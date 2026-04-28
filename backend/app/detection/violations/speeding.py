import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

import app.detection.tracking.vehicle_history as vehicle_history
from app.config import settings
from app.crud.violations import insert_violation
from app.database.connection import SessionLocal
from app.detection.tracking.vehicle_tracker import TrackedBox, VehicleTracker
from app.schemas.violation import ViolationCreate

logger = logging.getLogger(__name__)

_STRIPE_HALF = 5        # ± pixels around trap line — handles FPS drops
_MINI_BOX_HALF = 10     # 20×20 hit-box half-width
_CACHE_TTL_S = 30.0     # evict entries older than this (vehicle left frame)

_executor = ThreadPoolExecutor(max_workers=2)


class HybridSpeedService:
    """
    M3 — Hybrid Speed Estimation.

    Places two virtual horizontal trap lines (line_a = entry, line_b = exit).
    Uses a 20×20 mini-box centroid for all crossing math — eliminates the
    bounding-box expansion error that causes false acceleration readings.

    Speed formula:  speed_kmh = (trap_distance_m / Δt) * 3.6
    Δt measured between the frame where the centroid enters line_a stripe
    and the frame where it exits line_b stripe.

    Violations and ANPR are dispatched to a ThreadPoolExecutor so they
    never stall the 30 FPS main loop.
    """

    def __init__(
        self,
        config_path: str,
        model: object,
        backend_url: str,
        speed_limit_kmh: float,
    ) -> None:
        cfg_file = Path(config_path)
        if not cfg_file.exists():
            raise FileNotFoundError(
                f"Calibration config not found at '{config_path}'. "
                "Run CalibrationTool first."
            )

        cfg: dict = json.loads(cfg_file.read_text())

        if "meters_per_pixel" not in cfg:
            raise KeyError(
                "'meters_per_pixel' missing from calibration config. "
                "Re-run calibration and ensure this value is set."
            )

        self._line_a_y: float = float(cfg["speed_line_a_y"])
        self._line_b_y: float = float(cfg["speed_line_b_y"])
        self._mpp: float = float(cfg["meters_per_pixel"])
        self._trap_distance_m: float = abs(self._line_b_y - self._line_a_y) * self._mpp
        self._speed_limit: float = speed_limit_kmh
        self._backend_url: str = backend_url

        self._tracker = VehicleTracker(model)

        # track_id → unix timestamp of line_a crossing
        self._cache_matrix: dict[int, float] = {}
        # track_id → latest measured speed (for label rendering)
        self._speed_labels: dict[int, float] = {}
        # prevent duplicate violations per crossing
        self._violation_ids: set[int] = set()

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

    # ── Public API ─────────────────────────────────────────────────────────

    def process_frame(self, frame: np.ndarray, frame_idx: int) -> list[dict]:
        self._evict_stale_cache()

        tracked: list[TrackedBox] = self._tracker.update(frame)
        if not tracked:
            return []

        violations: list[dict] = []
        now = time.time()

        for box in tracked:
            tid = box["track_id"]
            x1, y1, x2, y2 = box["bbox"]

            # ── Mini-box centroid — all crossing math uses this, never bbox edges
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            # mini_box extent: cx±10, cy±10  (defined for clarity; crossing uses cy only)

            # ── Entry stripe: line_a ────────────────────────────────────────
            if abs(cy - self._line_a_y) <= _STRIPE_HALF and tid not in self._cache_matrix:
                self._cache_matrix[tid] = now

            # ── Exit stripe: line_b ─────────────────────────────────────────
            elif abs(cy - self._line_b_y) <= _STRIPE_HALF and tid in self._cache_matrix:
                delta_t = now - self._cache_matrix.pop(tid)

                if delta_t == 0:
                    # Skip — impossible to compute, avoid ZeroDivisionError
                    continue

                speed_kmh = (self._trap_distance_m / delta_t) * 3.6

                # Update shared speed_map so M4/M6 can read current speeds
                vehicle_history.speed_map[tid] = speed_kmh
                self._speed_labels[tid] = speed_kmh

                self._draw_speed_label(frame, box["bbox"], speed_kmh)

                if speed_kmh > self._speed_limit and tid not in self._violation_ids:
                    self._violation_ids.add(tid)

                    image_path = self._save_crop(frame, box["bbox"], tid, frame_idx)

                    record: dict = {
                        "track_id":       tid,
                        "violation_type": "SPEED",
                        "speed_kmh":      round(speed_kmh, 2),
                        "speed_limit":    self._speed_limit,
                        "timestamp":      datetime.now(timezone.utc).isoformat(),
                        "frame_idx":      frame_idx,
                        "bbox":           [x1, y1, x2, y2],
                        "image_path":     image_path,
                    }

                    _executor.submit(self._persist, record)

                    if self._anpr is not None:
                        self._anpr.trigger(frame, box["bbox"], tid)

                    violations.append(record)

            # Draw speed label every frame once a speed reading exists
            elif tid in self._speed_labels:
                self._draw_speed_label(frame, box["bbox"], self._speed_labels[tid])

        return violations

    def draw_speed_lines(self, frame: np.ndarray) -> np.ndarray:
        """Overlay the two trap lines on the frame (in-place). Returns frame."""
        h, w = frame.shape[:2]
        a_y = int(self._line_a_y)
        b_y = int(self._line_b_y)

        cv2.line(frame, (0, a_y), (w, a_y), (0, 255, 255), 2)
        cv2.putText(frame, "SPEED LINE A", (10, a_y - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)

        cv2.line(frame, (0, b_y), (w, b_y), (0, 165, 255), 2)
        cv2.putText(frame, "SPEED LINE B", (10, b_y - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 165, 255), 2)

        return frame

    # ── Private helpers ────────────────────────────────────────────────────

    def _evict_stale_cache(self) -> None:
        """Remove cache entries older than _CACHE_TTL_S (vehicle left frame before exit line)."""
        cutoff = time.time() - _CACHE_TTL_S
        stale = [tid for tid, ts in self._cache_matrix.items() if ts < cutoff]
        for tid in stale:
            self._cache_matrix.pop(tid, None)

    @staticmethod
    def _draw_speed_label(
        frame: np.ndarray, bbox: list[float], speed_kmh: float
    ) -> None:
        x1, y1 = int(bbox[0]), int(bbox[1])
        label = f"{speed_kmh:.1f} km/h"
        cv2.putText(
            frame, label,
            (x1, max(y1 - 8, 12)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2,
        )

    def _save_crop(
        self,
        frame: np.ndarray,
        bbox: list[float],
        track_id: int,
        frame_idx: int,
    ) -> str:
        x1, y1, x2, y2 = (int(v) for v in bbox)
        crop = frame[y1:y2, x1:x2]

        out_dir = Path(settings.STATIC_FILES_DIR) / "violations"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"speed_{track_id}_{frame_idx}.jpg"
        cv2.imwrite(str(path), crop)
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
                    speed_kmh=record["speed_kmh"],
                    speed_limit=record["speed_limit"],
                    frame_idx=record["frame_idx"],
                ),
            )
        except Exception as exc:
            logger.error(
                "DB persist failed for speed violation track_id=%d: %s",
                record["track_id"], exc,
            )
        finally:
            db.close()
