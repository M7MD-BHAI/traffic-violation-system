import logging
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

from app.config import settings
from app.crud.violations import insert_violation
from app.database.connection import SessionLocal
from app.detection.tracking.vehicle_tracker import TrackedBox, VehicleTracker
from app.schemas.violation import ViolationCreate

logger = logging.getLogger(__name__)

_MOTORCYCLE_CLASS_ID = 3
_BARE_HEAD_CLASS = 1      # helmet model class index 1 → "Without Helmet"
_VOTE_WINDOW = 15
_VOTE_THRESHOLD = 0.70    # 11/15 frames bare → confirmed violation

_executor = ThreadPoolExecutor(max_workers=2)


class HelmetViolationDetector:
    """
    M2 — Helmet Violation Detection.

    Two-stage hierarchical approach:
      1. Primary YOLO detects motorcycles → provides bbox + track_id
      2. Helmet model runs ONLY on the top-25% head-zone crop of each motorcycle
    Temporal voting over 15 frames prevents single-frame false positives.
    On confirmed violation, a composite image (full moto | head crop) is saved
    and ANPR is triggered asynchronously with the full motorcycle bbox.
    """

    def __init__(
        self, primary_model: object, helmet_model_path: str, config_path: str
    ) -> None:
        if not Path(helmet_model_path).exists():
            raise RuntimeError(
                f"Helmet model not found at '{helmet_model_path}'. "
                "Check YOLO_HELMET_MODEL_PATH in your .env file."
            )

        self._tracker = VehicleTracker(primary_model)
        self._helmet_model = YOLO(helmet_model_path)

        # track_id → sliding window of bool votes (bare_head detected in that frame?)
        self._vote_buffer: dict[int, deque[bool]] = {}
        self._confirmed_ids: set[int] = set()

        # Registered red-light violations keyed by track_id for merge logic
        self._rl_violations: dict[int, dict] = {}

        self._anpr = None
        try:
            from app.detection.anpr.plate_reader import ANPR_Service  # noqa: PLC0415
            self._anpr = ANPR_Service(
                plate_model_path=settings.YOLO_PLATE_MODEL_PATH,
                ocr_languages=["en"],
                max_workers=2,
            )
        except Exception as exc:
            logger.warning("ANPR service not available: %s", exc)

    def register_existing_violations(self, violations: dict[int, dict]) -> None:
        """
        Called by video_processor after M1 runs each frame.
        Keeps the RL violation registry current so M2 can merge records
        instead of creating duplicates for the same vehicle.
        """
        self._rl_violations.update(violations)

    def process_frame(self, frame: np.ndarray, frame_idx: int) -> list[dict]:
        tracked: list[TrackedBox] = self._tracker.update(frame)
        motos = [b for b in tracked if b["class_id"] == _MOTORCYCLE_CLASS_ID]

        if not motos:
            return []

        violations: list[dict] = []

        for box in motos:
            tid = box["track_id"]
            x1, y1, x2, y2 = (int(v) for v in box["bbox"])
            height = y2 - y1

            # ── Head-zone: exactly top 25% of motorcycle bbox ──────────────
            head_y2 = y1 + (height // 4)
            head_roi = frame[y1:head_y2, x1:x2]

            buf = self._vote_buffer.setdefault(tid, deque(maxlen=_VOTE_WINDOW))

            if head_roi.size == 0:
                # Bbox too small to crop — vote False (safer default: assume helmet)
                buf.append(False)
                continue

            # ── Secondary helmet model on head-zone crop only ───────────────
            bare_count = 0
            try:
                results = self._helmet_model(head_roi, verbose=False)
                if results and results[0].boxes is not None:
                    for det in results[0].boxes:
                        if int(det.cls[0]) == _BARE_HEAD_CLASS:
                            bare_count += 1
                # No boxes returned → treat as helmet present (safer default)
            except Exception as exc:
                logger.warning("Helmet inference error track_id=%d: %s", tid, exc)

            buf.append(bare_count > 0)

            # Wait until the window is fully populated before deciding
            if len(buf) < _VOTE_WINDOW:
                continue

            ratio = sum(buf) / _VOTE_WINDOW

            if ratio < _VOTE_THRESHOLD or tid in self._confirmed_ids:
                continue

            # ── Confirmed violation ─────────────────────────────────────────
            self._confirmed_ids.add(tid)

            head_crop = frame[y1:head_y2, x1:x2]
            image_path = self._save_composite(
                frame, [x1, y1, x2, y2], head_crop, tid, frame_idx
            )

            merged_with_rl = tid in self._rl_violations
            merged_with_id: int | None = (
                self._rl_violations[tid].get("id") if merged_with_rl else None
            )

            record: dict = {
                "track_id":         tid,
                "violation_type":   "HELMET",
                "confidence_score": round(ratio, 4),
                "timestamp":        datetime.now(timezone.utc).isoformat(),
                "frame_idx":        frame_idx,
                "image_path":       image_path,
                "bare_head_count":  bare_count,
                "merged_with_rl":   merged_with_rl,
                "merged_with_id":   merged_with_id,
                "bbox":             [x1, y1, x2, y2],
            }

            _executor.submit(self._persist, record)

            if self._anpr is not None:
                # Always pass full motorcycle bbox to ANPR, never the head crop
                self._anpr.trigger(frame, [x1, y1, x2, y2], tid)

            violations.append(record)

        return violations

    def get_moto_crop_for_anpr(self, frame: np.ndarray, violation: dict) -> np.ndarray:
        """Return the full motorcycle crop — ANPR needs the plate area, not the head zone."""
        x1, y1, x2, y2 = (int(v) for v in violation["bbox"])
        return frame[y1:y2, x1:x2]

    @staticmethod
    def build_api_payload(violation: dict, frame_path: str) -> dict:
        return {
            "track_id":         violation["track_id"],
            "violation_type":   "HELMET",
            "confidence_score": violation["confidence_score"],
            "timestamp":        violation["timestamp"],
            "frame_path":       frame_path,
        }

    # ── Private helpers ────────────────────────────────────────────────────

    def _save_composite(
        self,
        frame: np.ndarray,
        bbox: list[int],
        head_crop: np.ndarray,
        track_id: int,
        frame_idx: int,
    ) -> str:
        """Save side-by-side composite: full motorcycle (left) | head crop (right)."""
        x1, y1, x2, y2 = bbox
        moto_crop = frame[y1:y2, x1:x2]

        target_h = 200

        def _fit_height(img: np.ndarray) -> np.ndarray:
            if img.size == 0:
                return np.zeros((target_h, target_h, 3), dtype=np.uint8)
            scale = target_h / img.shape[0]
            w = max(1, int(img.shape[1] * scale))
            return cv2.resize(img, (w, target_h))

        composite = np.hstack([_fit_height(moto_crop), _fit_height(head_crop)])

        out_dir = Path(settings.STATIC_FILES_DIR) / "violations"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"helmet_{track_id}_{frame_idx}.jpg"
        cv2.imwrite(str(path), composite)
        return str(path)

    def _persist(self, record: dict) -> None:
        db = SessionLocal()
        try:
            insert_violation(
                db,
                ViolationCreate(
                    track_id=record["track_id"],
                    violation_type=record["violation_type"],
                    timestamp=datetime.fromisoformat(record["timestamp"]),
                    image_path=record["image_path"],
                    bbox=record["bbox"],
                    confidence_score=record["confidence_score"],
                    frame_idx=record["frame_idx"],
                    merged_with=record.get("merged_with_id"),
                ),
            )
        except Exception as exc:
            logger.error(
                "DB persist failed for helmet violation track_id=%d: %s",
                record["track_id"], exc,
            )
            # Spec: merged violation fails → create new record as fallback
            if record.get("merged_with_id") is not None:
                try:
                    insert_violation(
                        db,
                        ViolationCreate(
                            track_id=record["track_id"],
                            violation_type=record["violation_type"],
                            timestamp=datetime.fromisoformat(record["timestamp"]),
                            image_path=record["image_path"],
                            bbox=record["bbox"],
                            confidence_score=record["confidence_score"],
                            frame_idx=record["frame_idx"],
                        ),
                    )
                except Exception as fallback_exc:
                    logger.error("Fallback persist also failed: %s", fallback_exc)
        finally:
            db.close()
