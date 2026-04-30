import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from app.crud.vehicles import save_counting_report
from app.database.connection import SessionLocal
from app.detection.tracking.vehicle_tracker import TrackedBox, VehicleTracker
from app.schemas.vehicle import CountingReportCreate
from app.utils.geometry import line_crossing_check

logger = logging.getLogger(__name__)

_REPORT_INTERVAL_S = 60.0
_executor = ThreadPoolExecutor(max_workers=1)

# class_name (from VehicleTracker) → (group, per-class count key)
_CLASS_CONFIG: dict[str, tuple[str, str]] = {
    "bicycle":    ("small",  "motorcycle_count"),  # COCO bicycle → small group
    "motorcycle": ("small",  "motorcycle_count"),
    "car":        ("medium", "car_count"),
    "bus":        ("heavy",  "bus_count"),
    "truck":      ("heavy",  "truck_count"),
}

_ZERO_COUNTS: dict[str, int] = {
    "car_count":        0,
    "motorcycle_count": 0,
    "bus_count":        0,
    "truck_count":      0,
    "total_small":      0,
    "total_medium":     0,
    "total_heavy":      0,
}


class TrafficCounter:
    """
    M5 — Vehicle Counting & Classification.

    Counts unique vehicles crossing the stop-line (directional, top→bottom only).
    Maintains two independent counters:
      - total_counts  : cumulative since service start, never reset
      - interval_counts: resets to zero after each successful 60-second POST

    The DB write is dispatched to a ThreadPoolExecutor — the 30 FPS loop is
    never stalled.
    """

    def __init__(self, config_path: str, model: object, backend_url: str) -> None:
        cfg_file = Path(config_path)
        if not cfg_file.exists():
            raise FileNotFoundError(
                f"Calibration config not found at '{config_path}'. "
                "Run CalibrationTool first."
            )

        cfg: dict = json.loads(cfg_file.read_text())
        line_pts = cfg["violation_line"]           # [[x1, y1], [x2, y2]]
        self._line_y: float = (line_pts[0][1] + line_pts[1][1]) / 2

        self._tracker = VehicleTracker(model)
        self._backend_url = backend_url

        self._confirmed_ids: set[int] = set()
        self._y_prev: dict[int, float] = {}

        # total_counts never decreases; interval_counts resets every 60 s
        self._total_counts: dict[str, int] = dict(_ZERO_COUNTS)
        self._interval_counts: dict[str, int] = dict(_ZERO_COUNTS)

        self._last_report_ts: float = time.time()

    # ── Public interface ───────────────────────────────────────────────────

    def process_frame(
        self,
        frame: np.ndarray,
        frame_idx: int,
        tracked: list[TrackedBox] | None = None,
    ) -> None:
        if tracked is None:
            tracked = self._tracker.update(frame)

        # Remove y_prev entries for vehicles no longer in frame
        active_ids = {box["track_id"] for box in tracked}
        for stale_id in set(self._y_prev.keys()) - active_ids:
            self._y_prev.pop(stale_id, None)

        for box in tracked:
            tid = box["track_id"]
            y_bc: float = box["bbox"][3]   # y2 — bottom-centre y

            if tid in self._y_prev:
                if (
                    tid not in self._confirmed_ids
                    and line_crossing_check(self._y_prev[tid], y_bc, self._line_y)
                ):
                    self._confirmed_ids.add(tid)
                    self._record(box["class_name"])

            self._y_prev[tid] = y_bc

        self._maybe_report()

    # ── Private helpers ────────────────────────────────────────────────────

    def _record(self, class_name: str) -> None:
        """Increment both counters for the detected class."""
        if class_name not in _CLASS_CONFIG:
            logger.debug("Unrecognised class '%s' — skipped in counting.", class_name)
            return

        group, count_key = _CLASS_CONFIG[class_name]
        group_key = f"total_{group}"

        self._total_counts[count_key] += 1
        self._total_counts[group_key] += 1
        self._interval_counts[count_key] += 1
        self._interval_counts[group_key] += 1

    def _maybe_report(self) -> None:
        """Fire a DB persist every 60 s without blocking the frame loop."""
        if time.time() - self._last_report_ts < _REPORT_INTERVAL_S:
            return

        # Snapshot and reset interval_counts before submitting to avoid
        # a race where new crossings are credited to the old interval.
        interval_snapshot = dict(self._interval_counts)
        self._interval_counts = dict(_ZERO_COUNTS)
        self._last_report_ts = time.time()

        payload = {
            "timestamp":       datetime.now(timezone.utc).isoformat(),
            "interval_counts": interval_snapshot,
            "total_counts":    dict(self._total_counts),
            "grouped": {
                "small":  interval_snapshot["total_small"],
                "medium": interval_snapshot["total_medium"],
                "heavy":  interval_snapshot["total_heavy"],
            },
        }

        _executor.submit(self._persist, payload)

    def _persist(self, payload: dict) -> None:
        db = SessionLocal()
        try:
            ic = payload["interval_counts"]
            save_counting_report(
                db,
                CountingReportCreate(
                    timestamp=datetime.fromisoformat(payload["timestamp"]),
                    interval_minutes=1,
                    car_count=ic["car_count"],
                    motorcycle_count=ic["motorcycle_count"],
                    bus_count=ic["bus_count"],
                    truck_count=ic["truck_count"],
                    total_small=ic["total_small"],
                    total_medium=ic["total_medium"],
                    total_heavy=ic["total_heavy"],
                ),
            )
            logger.info(
                "Counting report saved — small=%d medium=%d heavy=%d",
                ic["total_small"], ic["total_medium"], ic["total_heavy"],
            )
        except Exception as exc:
            logger.error("Failed to save counting report: %s", exc)
        finally:
            db.close()
