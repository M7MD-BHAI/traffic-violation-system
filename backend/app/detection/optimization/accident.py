import json
import logging
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import httpx
import numpy as np

from app.detection.tracking.vehicle_tracker import TrackedBox
from app.utils.geometry import compute_iou, point_in_polygon

logger = logging.getLogger(__name__)

_STAGNATION_SPEED_THRESHOLD: float = 2.0    # km/h — below = slow
_STAGNATION_WAS_FAST: float = 20.0          # km/h — must have exceeded this first
_STAGNATION_DURATION: float = 10.0          # seconds continuous slow → stagnation alert
_CRASH_SPEED_THRESHOLD: float = 2.0         # km/h — both vehicles must be below
_CRASH_IOU_THRESHOLD: float = 0.40
_CRASH_DURATION: float = 5.0               # seconds both slow after overlap → crash alert
_FRAME_BUFFER_SIZE: int = 90               # 3 s rolling buffer at 30 fps
_CLIP_FPS: int = 30
_EXCLUSION_MARGIN: float = 40.0            # px around stop-line that is excluded

_executor = ThreadPoolExecutor(max_workers=2)


class AccidentDetector:
    def __init__(self, config_path: str, backend_url: str) -> None:
        self._backend_url = backend_url.rstrip("/")
        self._frame_buffer: deque[np.ndarray] = deque(maxlen=_FRAME_BUFFER_SIZE)

        cfg: dict[str, Any] = json.loads(Path(config_path).read_text())

        # stop-line y taken from violation_line first point
        violation_line = cfg.get("violation_line", [[0, 0], [640, 0]])
        self._stop_line_y: float = float(violation_line[0][1])

        # signal_roi is [[x1,y1],[x2,y2]] → expand to 4-point polygon for point_in_polygon
        roi = cfg.get("signal_roi", [[0, 0], [100, 100]])
        rx1, ry1 = float(roi[0][0]), float(roi[0][1])
        rx2, ry2 = float(roi[1][0]), float(roi[1][1])
        self._signal_polygon: list[list[float]] = [
            [rx1, ry1], [rx2, ry1], [rx2, ry2], [rx1, ry2]
        ]

        # Per-vehicle slow-start timestamps and fast-history set
        self._slow_since: dict[int, float] = {}
        self._was_fast: set[int] = set()

        # Crash pair tracking: frozenset({id_a, id_b}) → timestamp when overlap+slow began
        self._overlap_since: dict[frozenset, float] = {}

        # Fired alerts — never re-alert same vehicle or pair
        self._alerted: set[frozenset] = set()

        self._clip_dir = Path("backend/app/static/accidents")
        self._clip_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_frame(
        self,
        frame: np.ndarray,
        tracked: list[TrackedBox],
        speed_map: dict[int, float],
    ) -> list[dict[str, Any]]:
        self._frame_buffer.append(frame.copy())
        now = time.time()
        alerts: list[dict[str, Any]] = []

        current_ids = {box["track_id"] for box in tracked}

        # Drop stale slow_since entries for vehicles no longer visible
        for gone_id in list(self._slow_since.keys()):
            if gone_id not in current_ids:
                del self._slow_since[gone_id]

        # Update fast-history and slow-since for every tracked vehicle
        for box in tracked:
            tid = box["track_id"]
            speed = speed_map.get(tid, 999.0)
            if speed > _STAGNATION_WAS_FAST:
                self._was_fast.add(tid)
            if speed < _STAGNATION_SPEED_THRESHOLD:
                self._slow_since.setdefault(tid, now)
            else:
                self._slow_since.pop(tid, None)

        # ── Stagnation heuristic ──────────────────────────────────────
        for box in tracked:
            tid = box["track_id"]
            if tid not in self._was_fast:
                continue
            slow_start = self._slow_since.get(tid)
            if slow_start is None or now - slow_start < _STAGNATION_DURATION:
                continue
            key: frozenset = frozenset({tid})
            if key in self._alerted:
                continue
            cx, cy = _centroid(box["bbox"])
            if self._in_exclusion_zone(cx, cy):
                continue

            self._alerted.add(key)
            clip_path = self._save_clip(tid, "stagnation")
            alert = _build_alert("STAGNATION", [tid], box["bbox"], clip_path)
            alerts.append(alert)
            _executor.submit(self._post_alert, alert)

        # ── Crash IoU heuristic ───────────────────────────────────────
        boxes = list(tracked)
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                tid_a = boxes[i]["track_id"]
                tid_b = boxes[j]["track_id"]
                pair: frozenset = frozenset({tid_a, tid_b})
                if pair in self._alerted:
                    continue

                iou = compute_iou(boxes[i]["bbox"], boxes[j]["bbox"])
                speed_a = speed_map.get(tid_a, 999.0)
                speed_b = speed_map.get(tid_b, 999.0)
                both_slow = (
                    speed_a < _CRASH_SPEED_THRESHOLD
                    and speed_b < _CRASH_SPEED_THRESHOLD
                )

                if iou > _CRASH_IOU_THRESHOLD and both_slow:
                    self._overlap_since.setdefault(pair, now)
                    if now - self._overlap_since[pair] >= _CRASH_DURATION:
                        self._alerted.add(pair)
                        self._overlap_since.pop(pair, None)
                        union_bbox = _union_bbox(boxes[i]["bbox"], boxes[j]["bbox"])
                        clip_path = self._save_clip(tid_a, "crash")
                        alert = _build_alert(
                            "CRASH", [tid_a, tid_b], union_bbox, clip_path
                        )
                        alerts.append(alert)
                        _executor.submit(self._post_alert, alert)
                else:
                    # Reset overlap timer if IoU dropped or vehicles sped up
                    self._overlap_since.pop(pair, None)

        return alerts

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _in_exclusion_zone(self, cx: float, cy: float) -> bool:
        if point_in_polygon((cx, cy), self._signal_polygon):
            return True
        if abs(cy - self._stop_line_y) < _EXCLUSION_MARGIN:
            return True
        return False

    def _save_clip(self, track_id: int, label: str) -> str:
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        filename = f"{label}_{track_id}_{ts}.mp4"
        path = self._clip_dir / filename
        frames = list(self._frame_buffer)
        if frames:
            h, w = frames[0].shape[:2]
            writer = cv2.VideoWriter(
                str(path),
                cv2.VideoWriter_fourcc(*"mp4v"),
                _CLIP_FPS,
                (w, h),
            )
            for f in frames:
                writer.write(f)
            writer.release()
            logger.info("Saved accident clip: %s", path)
        return str(path)

    def _post_alert(self, alert: dict[str, Any]) -> None:
        try:
            with httpx.Client(timeout=5.0) as client:
                resp = client.post(
                    f"{self._backend_url}/alerts/accident",
                    json=alert,
                    headers={"Content-Type": "application/json"},
                )
                resp.raise_for_status()
        except Exception as exc:
            logger.warning("Failed to POST accident alert: %s", exc)


# ------------------------------------------------------------------
# Module-level pure helpers (no self dependency — easy to test)
# ------------------------------------------------------------------

def _centroid(bbox: list[float]) -> tuple[float, float]:
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2, (y1 + y2) / 2


def _union_bbox(bbox_a: list[float], bbox_b: list[float]) -> list[float]:
    return [
        min(bbox_a[0], bbox_b[0]),
        min(bbox_a[1], bbox_b[1]),
        max(bbox_a[2], bbox_b[2]),
        max(bbox_a[3], bbox_b[3]),
    ]


def _build_alert(
    alert_type: str,
    track_ids: list[int],
    bbox: list[float],
    clip_path: str,
) -> dict[str, Any]:
    return {
        "alert_type": alert_type,
        "track_ids": track_ids,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "road_id": "default",
        "bbox": bbox,
        "clip_path": clip_path,
    }
