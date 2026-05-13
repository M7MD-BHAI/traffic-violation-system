import logging
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

from app.config import settings
from app.crud.violations import insert_violation
from app.database.connection import SessionLocal
from app.detection.tracking.vehicle_tracker import TrackedBox, VehicleTracker
from app.detection.yolo_loader import get_helmet_model
from app.schemas.violation import ViolationCreate

logger = logging.getLogger(__name__)

_MOTORCYCLE_CLASS_ID = 3
_VOTE_WINDOW = 15
_VOTE_THRESHOLD = 0.70
_HELMET_CONF_THRESHOLD = 0.25

_executor = ThreadPoolExecutor(max_workers=2)


class HelmetViolationDetector:
    """
    M2 - Helmet Violation Detection.

    The module runs globally for every tracked motorcycle in the frame. It does
    not use the red-light monitored zone. The custom helmet model is applied
    only to the top 25% motorcycle head-zone crop.
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
        self._helmet_model = get_helmet_model()
        self._bare_head_classes = self._resolve_bare_head_classes()
        self._helmet_classes = self._resolve_helmet_classes()
        logger.info(
            "Helmet model loaded from %s; bare-head classes=%s; helmet classes=%s",
            helmet_model_path,
            sorted(self._bare_head_classes),
            sorted(self._helmet_classes),
        )

        self._vote_buffer: dict[int, deque[bool]] = {}
        self._confirmed_ids: set[int] = set()
        self._track_status: dict[int, dict] = {}
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

    def reset_state(self) -> None:
        """Clear per-track helmet voting state when a video source/replay restarts."""
        self._vote_buffer.clear()
        self._confirmed_ids.clear()
        self._track_status.clear()
        self._rl_violations.clear()
        logger.info("Helmet detector track state reset.")

    def _resolve_bare_head_classes(self) -> set[int]:
        """
        Detect bare-head/no-helmet class IDs from the custom model metadata.
        Falls back to class 1 for older two-class helmet models.
        """
        names = getattr(self._helmet_model, "names", {}) or {}
        bare_ids: set[int] = set()
        for class_id, label in names.items():
            normalised = str(label).lower().replace("_", " ").replace("-", " ")
            if (
                "bare" in normalised
                or "without" in normalised
                or "no helmet" in normalised
                or "nohelmet" in normalised
                or "non helmet" in normalised
                or "nonhelmet" in normalised
            ):
                bare_ids.add(int(class_id))
        return bare_ids or {1}

    def _resolve_helmet_classes(self) -> set[int]:
        """Detect helmet/wearing-helmet class IDs from model metadata."""
        names = getattr(self._helmet_model, "names", {}) or {}
        helmet_ids: set[int] = set()
        for class_id, label in names.items():
            cid = int(class_id)
            if cid in self._bare_head_classes:
                continue
            normalised = str(label).lower().replace("_", " ").replace("-", " ")
            if "helmet" in normalised or normalised.strip() in {"helmet", "with"}:
                helmet_ids.add(cid)
        return helmet_ids or ({0} if 0 not in self._bare_head_classes else set())

    def get_track_statuses(self) -> dict[int, dict]:
        """Return latest helmet status per motorcycle for live overlays."""
        return dict(self._track_status)

    def register_existing_violations(self, violations: dict[int, dict]) -> None:
        """
        Called by video_processor after M1 runs each frame.
        Keeps the RL violation registry current so M2 can merge records instead
        of creating duplicates for the same vehicle.
        """
        self._rl_violations.update(violations)

    def process_frame(
        self,
        frame: np.ndarray,
        frame_idx: int,
        tracked: list[TrackedBox] | None = None,
    ) -> list[dict]:
        if tracked is None:
            tracked = self._tracker.update(frame)
        motos = [b for b in tracked if b["class_id"] == _MOTORCYCLE_CLASS_ID]

        active_moto_ids = {b["track_id"] for b in motos}
        for stale_id in list(self._track_status.keys()):
            if stale_id not in active_moto_ids:
                self._track_status.pop(stale_id, None)

        if not motos:
            return []

        violations: list[dict] = []

        for box in motos:
            tid = box["track_id"]
            x1, y1, x2, y2 = (int(v) for v in box["bbox"])
            height = y2 - y1
            head_y2 = y1 + (height // 4)
            head_roi = frame[y1:head_y2, x1:x2]
            buf = self._vote_buffer.setdefault(tid, deque(maxlen=_VOTE_WINDOW))

            if head_roi.size == 0:
                buf.append(False)
                self._set_status(tid, "UNKNOWN", 0.0, [x1, y1, x2, y2], [x1, y1, x2, head_y2], frame_idx, buf)
                continue

            bare_count = 0
            helmet_count = 0
            best_conf = 0.0
            try:
                results = self._helmet_model(head_roi, verbose=False)
                if results and results[0].boxes is not None:
                    for det in results[0].boxes:
                        conf = float(det.conf[0]) if getattr(det, "conf", None) is not None else 0.0
                        if conf < _HELMET_CONF_THRESHOLD:
                            continue
                        cls_id = int(det.cls[0])
                        best_conf = max(best_conf, conf)
                        if cls_id in self._bare_head_classes:
                            bare_count += 1
                        elif cls_id in self._helmet_classes:
                            helmet_count += 1
            except Exception as exc:
                logger.warning("Helmet inference error track_id=%d: %s", tid, exc)

            bare_detected = bare_count > 0
            buf.append(bare_detected)
            status = "NO_HELMET" if bare_detected else "HELMET" if helmet_count > 0 else "UNKNOWN"
            self._set_status(tid, status, best_conf, [x1, y1, x2, y2], [x1, y1, x2, head_y2], frame_idx, buf)

            if len(buf) < _VOTE_WINDOW:
                continue

            ratio = sum(buf) / _VOTE_WINDOW
            if ratio < _VOTE_THRESHOLD or tid in self._confirmed_ids:
                continue

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
                "track_id": tid,
                "violation_type": "HELMET",
                "confidence_score": round(ratio, 4),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "frame_idx": frame_idx,
                "image_path": image_path,
                "bare_head_count": bare_count,
                "merged_with_rl": merged_with_rl,
                "merged_with_id": merged_with_id,
                "bbox": [x1, y1, x2, y2],
            }

            if self._anpr is not None:
                frame_for_anpr = frame.copy()
                future = _executor.submit(self._persist, record)
                future.add_done_callback(
                    lambda f, frame_snapshot=frame_for_anpr, bbox=[x1, y1, x2, y2], track_id=tid:
                    self._trigger_anpr_after_persist(f, frame_snapshot, bbox, track_id)
                )
            else:
                _executor.submit(self._persist, record)

            violations.append(record)

        return violations

    def get_moto_crop_for_anpr(self, frame: np.ndarray, violation: dict) -> np.ndarray:
        """Return the full motorcycle crop; ANPR needs the plate area."""
        x1, y1, x2, y2 = (int(v) for v in violation["bbox"])
        return frame[y1:y2, x1:x2]

    @staticmethod
    def build_api_payload(violation: dict, frame_path: str) -> dict:
        return {
            "track_id": violation["track_id"],
            "violation_type": "HELMET",
            "confidence_score": violation["confidence_score"],
            "timestamp": violation["timestamp"],
            "frame_path": frame_path,
        }

    def _set_status(
        self,
        track_id: int,
        status: str,
        confidence: float,
        bbox: list[int],
        head_bbox: list[int],
        frame_idx: int,
        votes: deque[bool],
    ) -> None:
        labels = {
            "NO_HELMET": "NO HELMET",
            "HELMET": "HELMET OK",
            "UNKNOWN": "HELMET ?",
        }
        self._track_status[track_id] = {
            "status": status,
            "label": labels.get(status, "HELMET ?"),
            "confidence": round(confidence, 4),
            "bbox": bbox,
            "head_bbox": head_bbox,
            "frame_idx": frame_idx,
            "bare_votes": sum(votes),
            "vote_window": len(votes),
        }

    def _save_composite(
        self,
        frame: np.ndarray,
        bbox: list[int],
        head_crop: np.ndarray,
        track_id: int,
        frame_idx: int,
    ) -> str:
        """Save side-by-side composite: full motorcycle (left) and head crop (right)."""
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
        filename = f"helmet_{track_id}_{frame_idx}.jpg"
        cv2.imwrite(str(out_dir / filename), composite)
        return f"/static/violations/{filename}"

    def _trigger_anpr_after_persist(
        self,
        future: object,
        frame: np.ndarray,
        bbox: list[int],
        track_id: int,
    ) -> None:
        try:
            violation_id = future.result()
            if violation_id is not None and self._anpr is not None:
                self._anpr.trigger(frame, bbox, track_id, violation_id=violation_id)
        except Exception as exc:
            logger.error("Helmet ANPR trigger failed track_id=%d: %s", track_id, exc)

    def _persist(self, record: dict) -> int | None:
        db = SessionLocal()
        try:
            violation = insert_violation(
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
            return violation.id
        except Exception as exc:
            logger.error(
                "DB persist failed for helmet violation track_id=%d: %s",
                record["track_id"],
                exc,
            )
            if record.get("merged_with_id") is not None:
                try:
                    violation = insert_violation(
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
                    return violation.id
                except Exception as fallback_exc:
                    logger.error("Fallback persist also failed: %s", fallback_exc)
            return None
        finally:
            db.close()
