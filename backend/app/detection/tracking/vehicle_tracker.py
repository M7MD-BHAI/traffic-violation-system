from typing import TypedDict

import numpy as np
from ultralytics import YOLO

# COCO class IDs for the four vehicle types this system tracks
_VEHICLE_CLASSES: dict[int, str] = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}


class TrackedBox(TypedDict):
    track_id: int
    bbox: list[float]   # [x1, y1, x2, y2] — pixel coords
    class_id: int
    class_name: str     # car | motorcycle | bus | truck
    confidence: float


class VehicleTracker:
    """
    Thin wrapper around the ultralytics BoT-SORT tracker.

    Receives the shared primary YOLO model (loaded once in yolo_loader.py),
    calls model.track() per frame with persist=True so BoT-SORT maintains
    state across frames, and returns only vehicle detections with valid track IDs.
    """

    def __init__(self, model: YOLO) -> None:
        self._model = model

    def update(self, frame: np.ndarray) -> list[TrackedBox]:
        """
        Run BoT-SORT tracking on one frame.

        Returns a list of TrackedBox dicts — empty list when no vehicles are
        detected or when the tracker has not yet assigned IDs (first 1–2 frames).
        """
        try:
            results = self._model.track(
                source=frame,
                persist=True,           # required: keeps BoT-SORT state between frames
                tracker="botsort.yaml",
                classes=list(_VEHICLE_CLASSES.keys()),
                verbose=False,
            )
        except Exception:
            return []

        if not results or results[0].boxes is None or results[0].boxes.id is None:
            return []

        tracked: list[TrackedBox] = []
        for box in results[0].boxes:
            class_id = int(box.cls[0])
            if class_id not in _VEHICLE_CLASSES:
                continue

            track_id = int(box.id[0])
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
            confidence = float(box.conf[0])

            tracked.append(
                TrackedBox(
                    track_id=track_id,
                    bbox=[x1, y1, x2, y2],
                    class_id=class_id,
                    class_name=_VEHICLE_CLASSES[class_id],
                    confidence=confidence,
                )
            )

        return tracked

    def active_ids(self, tracked: list[TrackedBox]) -> set[int]:
        """Convenience: extract the set of track_ids from the current frame's results."""
        return {box["track_id"] for box in tracked}
