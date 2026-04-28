import json
import logging
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
from app.utils.geometry import line_crossing_check

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2)


class CalibrationTool:
    """
    Interactive OpenCV tool — collects 4 mouse clicks from the first video frame:
      Clicks 1-2 → stop-line endpoints
      Clicks 3-4 → signal ROI corners (top-left, bottom-right)
    Saves calibration_config.json on completion.
    """

    _WINDOW = "Calibration — Click 2pts stop-line, 2pts signal ROI, then ENTER"

    def __init__(self) -> None:
        self._clicks: list[tuple[int, int]] = []
        self._frame_shape: tuple[int, ...] = ()

    def _on_click(self, event: int, x: int, y: int, flags: int, param: object) -> None:
        if event == cv2.EVENT_LBUTTONDOWN and len(self._clicks) < 4:
            self._clicks.append((x, y))
            logger.info("Calibration click %d: (%d, %d)", len(self._clicks), x, y)

    def run(self, video_source: str) -> None:
        cap = cv2.VideoCapture(video_source)
        ret, frame = cap.read()
        cap.release()
        if not ret:
            raise RuntimeError(f"Cannot read frame from source: {video_source}")

        self._frame_shape = frame.shape
        self._clicks.clear()

        cv2.namedWindow(self._WINDOW)
        cv2.setMouseCallback(self._WINDOW, self._on_click)

        while True:
            display = frame.copy()
            for i, (x, y) in enumerate(self._clicks):
                color = (0, 0, 255) if i < 2 else (255, 128, 0)
                cv2.circle(display, (x, y), 7, color, -1)
                cv2.putText(display, str(i + 1), (x + 8, y - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            if len(self._clicks) == 2:
                cv2.line(display, self._clicks[0], self._clicks[1], (0, 0, 255), 2)

            cv2.imshow(self._WINDOW, display)
            key = cv2.waitKey(20) & 0xFF
            if key == 13 and len(self._clicks) == 4:   # ENTER
                break
            if key == 27:                                # ESC
                cv2.destroyAllWindows()
                raise RuntimeError("Calibration cancelled by user")

        cv2.destroyAllWindows()

    def save_config(self, path: str) -> dict:
        if len(self._clicks) < 4:
            raise RuntimeError("Calibration incomplete — 4 clicks required")
        h, w = self._frame_shape[:2]
        config = {
            "violation_line": [list(self._clicks[0]), list(self._clicks[1])],
            "signal_roi":     [list(self._clicks[2]), list(self._clicks[3])],
            "resolution":     [w, h],
        }
        Path(path).write_text(json.dumps(config, indent=2))
        logger.info("Calibration config saved to %s", path)
        return config


class SignalStateDetector:
    """
    Determines traffic signal state from a fixed ROI using HSV V-channel
    brightness comparison across three vertical segments.

    Top segment brightest  → RED
    Bottom segment brightest → GREEN
    Otherwise              → YELLOW
    """

    def __init__(self, signal_roi: list) -> None:
        pt1, pt2 = signal_roi
        self._x1 = int(min(pt1[0], pt2[0]))
        self._y1 = int(min(pt1[1], pt2[1]))
        self._x2 = int(max(pt1[0], pt2[0]))
        self._y2 = int(max(pt1[1], pt2[1]))

    def detect(self, frame: np.ndarray) -> str:
        crop = frame[self._y1:self._y2, self._x1:self._x2]
        if crop.size == 0:
            return "UNKNOWN"

        v_channel = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)[:, :, 2]
        h = v_channel.shape[0]
        third = max(1, h // 3)

        top_mean = float(np.mean(v_channel[:third]))
        mid_mean = float(np.mean(v_channel[third : 2 * third]))
        bot_mean = float(np.mean(v_channel[2 * third :]))

        if top_mean >= mid_mean and top_mean >= bot_mean:
            return "RED"
        if bot_mean >= top_mean and bot_mean >= mid_mean:
            return "GREEN"
        return "YELLOW"


class ViolationManager:
    """
    M1 — Red Light Violation Detection.

    Loads calibration config, runs BoT-SORT tracking per frame, checks
    whether any vehicle's bottom-centre crosses the stop-line while the
    signal is RED, and persists confirmed violations to the database.
    ANPR is triggered asynchronously via ThreadPoolExecutor.
    """

    def __init__(self, config_path: str, model: object) -> None:
        cfg_file = Path(config_path)
        if not cfg_file.exists():
            raise FileNotFoundError(
                f"Run calibration first — config not found at '{config_path}'"
            )

        cfg: dict = json.loads(cfg_file.read_text())
        line_pts = cfg["violation_line"]          # [[x1,y1],[x2,y2]]
        self._line_y: float = (line_pts[0][1] + line_pts[1][1]) / 2
        res = cfg["resolution"]                   # [w, h]
        self._resolution: tuple[int, int] = (int(res[0]), int(res[1]))

        self._tracker = VehicleTracker(model)
        self._signal_detector = SignalStateDetector(cfg["signal_roi"])
        self._confirmed_ids: set[int] = set()

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

    def process_frame(self, frame: np.ndarray, frame_idx: int) -> list[dict]:
        frame = cv2.resize(frame, self._resolution)
        signal_state = self._signal_detector.detect(frame)

        tracked: list[TrackedBox] = self._tracker.update(frame)
        if not tracked:
            return []

        # Remove stale y_prev entries for vehicles no longer in frame
        active_ids = {box["track_id"] for box in tracked}
        for stale_id in set(vehicle_history.y_prev.keys()) - active_ids:
            vehicle_history.y_prev.pop(stale_id, None)

        violations: list[dict] = []

        for box in tracked:
            tid = box["track_id"]
            x1, y1, x2, y2 = box["bbox"]
            y_bc = y2  # bottom-centre y as specified

            if tid in vehicle_history.y_prev:
                y_prev_val = vehicle_history.y_prev[tid]

                if (
                    signal_state == "RED"
                    and line_crossing_check(y_prev_val, y_bc, self._line_y)
                    and tid not in self._confirmed_ids
                ):
                    self._confirmed_ids.add(tid)
                    image_path = self._save_crop(frame, box["bbox"], tid, frame_idx)

                    record: dict = {
                        "track_id":       tid,
                        "violation_type": "RED_LIGHT",
                        "timestamp":      datetime.now(timezone.utc).isoformat(),
                        "frame_idx":      frame_idx,
                        "signal_state":   signal_state,
                        "bbox":           [x1, y1, x2, y2],
                        "image_path":     image_path,
                        "plate_text":     None,
                        "confidence":     box["confidence"],
                    }

                    _executor.submit(self._persist, record)

                    if self._anpr is not None:
                        self._anpr.trigger(frame, box["bbox"], tid)

                    violations.append(record)

            vehicle_history.y_prev[tid] = y_bc

        return violations

    @staticmethod
    def build_violation_record(violation: dict, plate_text: str | None) -> dict:
        """Merge a completed ANPR result back into an existing violation dict."""
        return {**violation, "plate_text": plate_text}

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _save_crop(
        self, frame: np.ndarray, bbox: list[float], track_id: int, frame_idx: int
    ) -> str:
        x1, y1, x2, y2 = (int(v) for v in bbox)
        crop = frame[y1:y2, x1:x2]

        out_dir = Path(settings.STATIC_FILES_DIR) / "violations"
        out_dir.mkdir(parents=True, exist_ok=True)

        filename = f"rl_{track_id}_{frame_idx}.jpg"
        path = out_dir / filename
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
                    confidence_score=record["confidence"],
                    frame_idx=record["frame_idx"],
                ),
            )
        except Exception as exc:
            logger.error("DB persist failed for red-light violation track_id=%d: %s",
                         record["track_id"], exc)
        finally:
            db.close()
