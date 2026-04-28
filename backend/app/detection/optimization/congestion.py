import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import app.detection.tracking.vehicle_history as vehicle_history
from app.crud.signals import save_congestion_snapshot
from app.database.connection import SessionLocal
from app.detection.tracking.vehicle_tracker import TrackedBox
from app.utils.geometry import centroid, point_in_polygon

logger = logging.getLogger(__name__)

_STAGNANT_SPEED_KMH = 5.0      # below this → counted as stagnant
_REPORT_INTERVAL_S = 10.0      # persist snapshot every 10 seconds

_executor = ThreadPoolExecutor(max_workers=1)


class RoadDensityService:
    """
    M4 (density half) — Congestion Index calculator for one road.

    Receives tracked boxes and the shared speed_map every frame.
    Counts vehicles whose centroid falls inside the lane polygon (occupancy)
    and among those, how many are moving below 5 km/h (stagnant).

    CI formula:  CI = min(100, occupancy * 3 + stagnant * 2)

    Persists a snapshot to the DB every 10 seconds without blocking the
    video loop — the write is dispatched to a ThreadPoolExecutor.
    """

    def __init__(self, road_id: str, lane_polygon: list, backend_url: str) -> None:
        self._road_id = road_id
        self._lane_polygon = lane_polygon   # list of [x, y] vertices
        self._backend_url = backend_url
        self._last_report_ts: float = 0.0

    def update(self, tracked_boxes: list[TrackedBox], speed_map: dict[int, float]) -> dict:
        """
        Calculate the current Congestion Index and return a snapshot dict.
        Triggers a DB persist every 10 s (non-blocking).
        """
        occupancy = 0
        stagnant = 0

        for box in tracked_boxes:
            cx, cy = centroid(box["bbox"])
            if not point_in_polygon((cx, cy), self._lane_polygon):
                continue
            occupancy += 1
            # Use shared speed_map written by M3; default high speed if unknown
            speed = speed_map.get(box["track_id"], 999.0)
            if speed < _STAGNANT_SPEED_KMH:
                stagnant += 1

        density_index = min(100, occupancy * 3 + stagnant * 2)

        snapshot = {
            "road_id":       self._road_id,
            "density_index": density_index,
            "vehicle_count": occupancy,
            "stagnant_count": stagnant,
        }

        now = time.time()
        if now - self._last_report_ts >= _REPORT_INTERVAL_S:
            self._last_report_ts = now
            _executor.submit(self._persist, snapshot)

        return snapshot

    # ── Private ────────────────────────────────────────────────────────────

    def _persist(self, snapshot: dict) -> None:
        db = SessionLocal()
        try:
            save_congestion_snapshot(
                db,
                road_id=snapshot["road_id"],
                density_index=snapshot["density_index"],
                vehicle_count=snapshot["vehicle_count"],
                stagnant_count=snapshot["stagnant_count"],
                timestamp=datetime.now(timezone.utc),
            )
        except Exception as exc:
            logger.error(
                "Failed to persist congestion snapshot for road '%s': %s",
                snapshot["road_id"], exc,
            )
        finally:
            db.close()
