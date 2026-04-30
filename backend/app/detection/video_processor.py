import logging
import threading
import time

import cv2
import numpy as np

import app.detection.tracking.vehicle_history as vehicle_history
from app.config import settings
from app.detection.optimization.accident import AccidentDetector
from app.detection.optimization.congestion import RoadDensityService
from app.detection.optimization.counter import TrafficCounter
from app.detection.optimization.signal_control import aggregator
from app.detection.tracking.vehicle_tracker import TrackedBox, VehicleTracker
from app.detection.violations.helmet import HelmetViolationDetector
from app.detection.violations.red_light import ViolationManager
from app.detection.violations.speeding import HybridSpeedService
from app.detection.yolo_loader import get_primary_model

logger = logging.getLogger(__name__)

_COLOR_OK = (0, 255, 0)         # green — unviolating vehicle box
_COLOR_VIOLATION = (0, 0, 255)  # red — violating vehicle box
_COLOR_HUD = (255, 255, 255)    # white HUD text

# Fallback lane polygon when calibration has no polygon data (full-frame middle band)
_FALLBACK_POLYGON = [[0, 100], [640, 100], [640, 380], [0, 380]]
_DEFAULT_ROAD_ID = "main_road"


class VideoProcessor:
    """
    Orchestrates the full 30 FPS detection pipeline.

    Runs ONE model.track() call per frame and distributes the pre-computed
    tracked boxes to all modules, avoiding redundant YOLO inference.

    Thread model: process_video() runs in a daemon thread started by start().
    get_latest_frame() and get_stats() are safe to call from any thread.
    """

    def __init__(self, config_path: str = "calibration_config.json") -> None:
        self._config_path = config_path
        self._running = False
        self._lock = threading.Lock()
        self._latest_frame: np.ndarray | None = None
        self._fps: float = 0.0
        self._track_count: int = 0
        self._signal_state: str = "UNKNOWN"

        model = get_primary_model()
        self._tracker = VehicleTracker(model)

        self._red_light: ViolationManager | None = None
        self._helmet: HelmetViolationDetector | None = None
        self._speed: HybridSpeedService | None = None
        self._density: RoadDensityService | None = None
        self._counter: TrafficCounter | None = None
        self._accident: AccidentDetector | None = None

        self._init_modules(model)

    def _init_modules(self, model: object) -> None:
        try:
            self._red_light = ViolationManager(self._config_path, model)
        except FileNotFoundError:
            logger.warning("Red-light module disabled — calibration config missing.")
        except Exception as exc:
            logger.error("Red-light module init failed: %s", exc)

        try:
            self._helmet = HelmetViolationDetector(
                model, settings.YOLO_HELMET_MODEL_PATH, self._config_path
            )
        except Exception as exc:
            logger.warning("Helmet module disabled: %s", exc)

        try:
            self._speed = HybridSpeedService(
                self._config_path, model, settings.BACKEND_URL, settings.SPEED_LIMIT_KMH
            )
        except Exception as exc:
            logger.warning("Speed module disabled: %s", exc)

        try:
            self._density = RoadDensityService(
                road_id=_DEFAULT_ROAD_ID,
                lane_polygon=_FALLBACK_POLYGON,
                backend_url=settings.BACKEND_URL,
            )
        except Exception as exc:
            logger.warning("Congestion module disabled: %s", exc)

        try:
            self._counter = TrafficCounter(
                self._config_path, model, settings.BACKEND_URL
            )
        except Exception as exc:
            logger.warning("Counter module disabled: %s", exc)

        try:
            self._accident = AccidentDetector(
                self._config_path, settings.BACKEND_URL
            )
        except Exception as exc:
            logger.warning("Accident module disabled: %s", exc)

    # ── Public interface ───────────────────────────────────────────────────

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        t = threading.Thread(target=self._run_loop, daemon=True)
        t.start()
        logger.info("VideoProcessor started.")

    def stop(self) -> None:
        self._running = False
        logger.info("VideoProcessor stopped.")

    def get_latest_frame(self) -> np.ndarray | None:
        with self._lock:
            return self._latest_frame.copy() if self._latest_frame is not None else None

    def get_stats(self) -> dict:
        return {
            "fps": round(self._fps, 1),
            "track_count": self._track_count,
            "signal_state": self._signal_state,
        }

    def process_video(self, source: str | int) -> None:
        """Synchronous video loop. Blocks until self._running is False or source ends."""
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video source: {source}")

        fps_counter = _FPSCounter()
        frame_idx = 0
        try:
            while self._running:
                ok, frame = cap.read()
                if not ok:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, frame = cap.read()
                    if not ok:
                        break

                annotated = self._process_frame(frame, frame_idx)
                frame_idx += 1
                fps_counter.tick()
                self._fps = fps_counter.fps

                with self._lock:
                    self._latest_frame = annotated
        finally:
            cap.release()

    # ── Internal ───────────────────────────────────────────────────────────

    def _run_loop(self) -> None:
        source = settings.VIDEO_SOURCE
        cap_source: int | str = int(source) if source.isdigit() else source
        try:
            self.process_video(cap_source)
        except Exception as exc:
            logger.error("VideoProcessor fatal error: %s", exc)
        finally:
            self._running = False

    def _process_frame(self, frame: np.ndarray, frame_idx: int) -> np.ndarray:
        # ── Step 1: ONE YOLO inference ─────────────────────────────────────
        tracked: list[TrackedBox] = self._tracker.update(frame)
        self._track_count = len(tracked)

        # ── Step 2: Update shared vehicle_history ──────────────────────────
        active_ids = {box["track_id"] for box in tracked}
        for stale in list(vehicle_history.y_prev.keys()):
            if stale not in active_ids:
                vehicle_history.y_prev.pop(stale, None)
        for box in tracked:
            vehicle_history.y_prev[box["track_id"]] = box["bbox"][3]  # y2 = bottom-centre

        # ── Step 3: Violation modules (receive pre-computed tracked) ───────
        rl_violations: list[dict] = []
        if self._red_light is not None:
            try:
                rl_violations = self._red_light.process_frame(frame, frame_idx, tracked)
                self._signal_state = self._red_light._signal_detector.detect(frame)
            except Exception as exc:
                logger.error("Red-light frame error: %s", exc)

        helmet_violations: list[dict] = []
        if self._helmet is not None:
            try:
                self._helmet.register_existing_violations(
                    {v["track_id"]: v for v in rl_violations}
                )
                helmet_violations = self._helmet.process_frame(frame, frame_idx, tracked)
            except Exception as exc:
                logger.error("Helmet frame error: %s", exc)

        speed_violations: list[dict] = []
        if self._speed is not None:
            try:
                speed_violations = self._speed.process_frame(frame, frame_idx, tracked)
                self._speed.draw_speed_lines(frame)
            except Exception as exc:
                logger.error("Speed frame error: %s", exc)

        if self._counter is not None:
            try:
                self._counter.process_frame(frame, frame_idx, tracked)
            except Exception as exc:
                logger.error("Counter frame error: %s", exc)

        # ── Step 4: Optimization modules ───────────────────────────────────
        if self._density is not None:
            try:
                snap = self._density.update(tracked, vehicle_history.speed_map)
                aggregator.ingest(snap["road_id"], snap["density_index"], snap["vehicle_count"])
            except Exception as exc:
                logger.error("Congestion frame error: %s", exc)

        if self._accident is not None:
            try:
                self._accident.process_frame(frame, tracked, vehicle_history.speed_map)
            except Exception as exc:
                logger.error("Accident frame error: %s", exc)

        # ── Step 5: Draw overlays and return ──────────────────────────────
        return self._draw_overlays(
            frame, tracked, rl_violations, helmet_violations, speed_violations
        )

    def _draw_overlays(
        self,
        frame: np.ndarray,
        tracked: list[TrackedBox],
        rl_violations: list[dict],
        helmet_violations: list[dict],
        speed_violations: list[dict],
    ) -> np.ndarray:
        violation_ids = {
            v["track_id"]
            for v in rl_violations + helmet_violations + speed_violations
        }

        for box in tracked:
            tid = box["track_id"]
            x1, y1, x2, y2 = (int(v) for v in box["bbox"])
            color = _COLOR_VIOLATION if tid in violation_ids else _COLOR_OK

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            label = f"{box['class_name']} #{tid}"
            cv2.putText(
                frame, label,
                (x1, max(y1 - 6, 12)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2,
            )

        cv2.putText(
            frame,
            f"FPS:{self._fps:.1f}  Tracks:{self._track_count}  Signal:{self._signal_state}",
            (10, 22),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, _COLOR_HUD, 2,
        )

        return frame


class _FPSCounter:
    """Exponential moving-average FPS estimator."""

    def __init__(self, alpha: float = 0.05) -> None:
        self._alpha = alpha
        self.fps: float = 0.0
        self._last: float = time.perf_counter()

    def tick(self) -> None:
        now = time.perf_counter()
        dt = now - self._last
        self._last = now
        if dt > 0:
            inst = 1.0 / dt
            self.fps = inst if self.fps == 0.0 else (1 - self._alpha) * self.fps + self._alpha * inst


# Module-level singleton — import this in main.py lifespan to start processing
processor = VideoProcessor()
