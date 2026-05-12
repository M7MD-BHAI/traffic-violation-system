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

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2)
_CONFIRMED_ID_TTL_FRAMES = 30
_STOP_LINE_TOLERANCE_PX = 8.0


class CalibrationTool:
    """
    Interactive OpenCV tool — two phases of mouse input:

      Phase 1 (4 clicks):
        Clicks 1-2 → stop-line endpoints
        Clicks 3-4 → signal ROI corners (top-left, bottom-right)
        Press ENTER to confirm and move to phase 2.

      Phase 2 (3+ clicks):
        Clicks define the lane polygon (monitored zone).
        Press ENTER to confirm (minimum 3 points).
        Press S to skip — all vehicles will be eligible (no ROI filtering).
        Press ESC to redo the polygon.

    Saves calibration_config.json on completion.
    """

    _WINDOW = "CALIBRATION — Red Light Setup"

    def __init__(self) -> None:
        self._clicks: list[tuple[int, int]] = []
        self._polygon_pts: list[tuple[int, int]] = []
        self._phase: int = 1          # 1 = stop-line/signal, 2 = lane polygon
        self._frame_shape: tuple[int, ...] = ()

    def _on_click(self, event: int, x: int, y: int, flags: int, param: object) -> None:
        if event != cv2.EVENT_LBUTTONDOWN:
            return
        if self._phase == 1 and len(self._clicks) < 4:
            self._clicks.append((x, y))
            logger.info("Calibration click %d: (%d, %d)", len(self._clicks), x, y)
        elif self._phase == 2:
            self._polygon_pts.append((x, y))
            logger.info("Polygon vertex %d: (%d, %d)", len(self._polygon_pts), x, y)

    def run(self, video_source: str) -> None:
        cap = cv2.VideoCapture(video_source)
        ret, frame = cap.read()
        cap.release()
        if not ret:
            raise RuntimeError(f"Cannot read frame from source: {video_source}")

        self._frame_shape = frame.shape
        self._clicks.clear()
        self._polygon_pts.clear()
        self._phase = 1

        cv2.namedWindow(self._WINDOW)
        cv2.setMouseCallback(self._WINDOW, self._on_click)

        while True:
            display = frame.copy()
            n = len(self._clicks)
            np_count = len(self._polygon_pts)

            if self._phase == 1:
                # ── Instruction text ───────────────────────────────────────
                if n < 2:
                    msg = f"STOP LINE — click point {n + 1} of 2"
                    cv2.putText(display, msg, (10, 30),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
                elif n < 4:
                    msg = f"SIGNAL ROI — click point {n - 1} of 2"
                    cv2.putText(display, msg, (10, 30),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 128, 0), 2)
                else:
                    cv2.putText(
                        display,
                        "Press ENTER to proceed to lane polygon  |  ESC to redo",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (0, 255, 0), 2,
                    )

                # ── Stop-line points + line ────────────────────────────────
                for i in range(min(n, 2)):
                    xc, yc = self._clicks[i]
                    cv2.circle(display, (xc, yc), 8, (0, 0, 255), -1)
                    cv2.putText(display, str(i + 1), (xc + 10, yc - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                if n >= 2:
                    cv2.line(display, self._clicks[0], self._clicks[1], (0, 0, 255), 3)
                    mid_x = (self._clicks[0][0] + self._clicks[1][0]) // 2
                    mid_y = (self._clicks[0][1] + self._clicks[1][1]) // 2
                    cv2.putText(display, "STOP LINE", (mid_x - 40, mid_y - 12),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2)

                # ── Signal ROI points + rectangle ──────────────────────────
                for i in range(2, min(n, 4)):
                    xc, yc = self._clicks[i]
                    cv2.circle(display, (xc, yc), 8, (255, 128, 0), -1)
                    cv2.putText(display, str(i - 1), (xc + 10, yc - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 128, 0), 2)
                if n == 4:
                    cv2.rectangle(display, self._clicks[2], self._clicks[3],
                                  (255, 128, 0), 2)
                    cv2.putText(display, "SIGNAL",
                                (self._clicks[2][0], self._clicks[2][1] - 8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 128, 0), 2)

            else:  # phase 2 — lane polygon
                # Keep stop-line and signal ROI for visual reference
                if len(self._clicks) >= 2:
                    cv2.line(display, self._clicks[0], self._clicks[1], (0, 0, 200), 2)
                if len(self._clicks) == 4:
                    cv2.rectangle(display, self._clicks[2], self._clicks[3],
                                  (200, 100, 0), 1)

                header = (
                    f"LANE POLYGON — {np_count} pts"
                    " | ENTER=confirm (min 3) | S=skip | ESC=redo"
                )
                cv2.putText(display, header, (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.62, (0, 255, 255), 2)

                # Draw polygon vertices
                for i, pt in enumerate(self._polygon_pts):
                    cv2.circle(display, pt, 7, (0, 255, 255), -1)
                    cv2.putText(display, str(i + 1), (pt[0] + 9, pt[1] - 9),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)

                # Draw edges between consecutive vertices
                if np_count >= 2:
                    for i in range(np_count - 1):
                        cv2.line(display, self._polygon_pts[i],
                                 self._polygon_pts[i + 1], (0, 255, 255), 2)

                # Closing edge + semi-transparent fill when ≥ 3 pts
                if np_count >= 3:
                    cv2.line(display, self._polygon_pts[-1],
                             self._polygon_pts[0], (0, 200, 200), 1)
                    pts_arr = np.array(self._polygon_pts, dtype=np.int32)
                    overlay = display.copy()
                    cv2.fillPoly(overlay, [pts_arr], (0, 255, 255))
                    cv2.addWeighted(overlay, 0.12, display, 0.88, 0, display)

            cv2.imshow(self._WINDOW, display)
            key = cv2.waitKey(20) & 0xFF

            if self._phase == 1:
                if key == 13 and n == 4:          # ENTER — proceed to polygon phase
                    self._phase = 2
                    logger.info("Phase 1 confirmed — entering lane polygon phase")
                elif key == 27:                   # ESC — redo stop-line/signal
                    self._clicks.clear()
            else:  # phase 2
                if key == 13 and np_count >= 3:   # ENTER — confirm polygon
                    break
                elif key in (ord("s"), ord("S")): # S — skip polygon
                    self._polygon_pts.clear()
                    logger.info(
                        "Lane polygon skipped — no ROI filtering, all vehicles eligible"
                    )
                    break
                elif key == 27:                   # ESC — redo polygon
                    self._polygon_pts.clear()

        cv2.destroyAllWindows()

    def save_config(self, path: str) -> dict:
        if len(self._clicks) < 4:
            raise RuntimeError("Calibration incomplete — 4 clicks required")
        h, w = self._frame_shape[:2]

        # Merge with existing config so speed lines / meters_per_pixel are preserved
        existing: dict = {}
        p = Path(path)
        if p.exists():
            try:
                existing = json.loads(p.read_text())
            except Exception:
                pass

        config = {
            **existing,
            "violation_line": [list(self._clicks[0]), list(self._clicks[1])],
            "signal_roi":     [list(self._clicks[2]), list(self._clicks[3])],
            "resolution":     [w, h],
            "calibrated":     True,
        }
        if self._polygon_pts:
            config["lane_polygon"] = [list(pt) for pt in self._polygon_pts]
            logger.info("Lane polygon saved: %d vertices", len(self._polygon_pts))
        else:
            # Remove stale polygon if user explicitly skipped it
            config.pop("lane_polygon", None)

        p.write_text(json.dumps(config, indent=2))
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
        self._last_means: tuple[float, float, float] = (0.0, 0.0, 0.0)

    def detect(self, frame: np.ndarray) -> str:
        h_f, w_f = frame.shape[:2]
        x1, x2 = max(0, self._x1), min(w_f, self._x2)
        y1, y2 = max(0, self._y1), min(h_f, self._y2)
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return "UNKNOWN"

        v_channel = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)[:, :, 2]
        h = v_channel.shape[0]
        third = max(1, h // 3)

        top_mean = float(np.mean(v_channel[:third]))
        mid_mean = float(np.mean(v_channel[third : 2 * third]))
        bot_mean = float(np.mean(v_channel[2 * third :]))
        self._last_means = (top_mean, mid_mean, bot_mean)

        if top_mean >= mid_mean and top_mean >= bot_mean:
            return "RED"
        if bot_mean >= top_mean and bot_mean >= mid_mean:
            return "GREEN"
        return "YELLOW"

    @property
    def last_means(self) -> tuple[float, float, float]:
        return self._last_means


def _line_y_at_x(line_pts: list[list[float]], x: float) -> float:
    """Return the y of the calibration line at the given x (linear interpolation)."""
    (x1, y1), (x2, y2) = line_pts[0], line_pts[1]
    if abs(x2 - x1) < 1e-6:
        return (y1 + y2) / 2.0
    t = (x - x1) / (x2 - x1)
    return y1 + t * (y2 - y1)


def _signed_line_side(line_pts: list[list[float]], x: float, y: float) -> float:
    """Return signed side of point (x, y) relative to the stop-line segment."""
    (x1, y1), (x2, y2) = line_pts[0], line_pts[1]
    return (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)


def _signed_line_distance(line_pts: list[list[float]], x: float, y: float) -> float:
    """Return signed perpendicular distance in pixels from point to stop line."""
    (x1, y1), (x2, y2) = line_pts[0], line_pts[1]
    length = float(np.hypot(x2 - x1, y2 - y1))
    if length <= 1e-6:
        return 0.0
    return _signed_line_side(line_pts, x, y) / length


class ViolationManager:
    """
    M1 — Red Light Violation Detection.

    Loads calibration config, runs BoT-SORT tracking per frame, checks
    whether any vehicle's bottom-centre crosses the stop-line while the
    signal is RED, and persists confirmed violations to the database.

    A lane-polygon ROI (optional, set during calibration) pre-filters vehicles
    before any crossing logic runs.  Only vehicles whose bottom-centre falls
    inside the polygon are eligible for violation detection.  Vehicles from
    adjacent lanes or cross-traffic that happen to share the same Y-range as
    the stop line are silently ignored.

    ANPR is triggered asynchronously via ThreadPoolExecutor.
    """

    def __init__(self, config_path: str, model: object) -> None:
        cfg_file = Path(config_path)
        if not cfg_file.exists():
            raise FileNotFoundError(
                f"Run calibration first — config not found at '{config_path}'"
            )

        cfg: dict = json.loads(cfg_file.read_text())
        self._line_pts: list[list[float]] = cfg["violation_line"]   # [[x1,y1],[x2,y2]]
        self._line_y: float = (self._line_pts[0][1] + self._line_pts[1][1]) / 2

        # ── Lane ROI polygon (optional) ────────────────────────────────────
        # When present, only vehicles whose bottom-centre (x_bc, y_bc) falls
        # inside this polygon are checked for violations.  Absent → no filter.
        self._lane_polygon: np.ndarray | None = None
        polygon_pts = cfg.get("lane_polygon")
        if polygon_pts and len(polygon_pts) >= 3:
            self._lane_polygon = np.array(polygon_pts, dtype=np.float32)
            logger.info(
                "Lane ROI polygon loaded: %d vertices — only vehicles inside "
                "this zone will be checked for red-light violations.",
                len(polygon_pts),
            )
        else:
            logger.warning(
                "No 'lane_polygon' in calibration config — ALL tracked vehicles "
                "across the entire frame are eligible for red-light violations. "
                "Re-run calibration and define a monitored zone."
            )

        self._tracker = VehicleTracker(model)
        self._signal_detector = SignalStateDetector(cfg["signal_roi"])
        self._confirmed_ids: set[int] = set()
        self._last_seen_frame: dict[int, int] = {}
        self._prev_anchor_by_id: dict[int, tuple[float, float]] = {}
        self._approach_side_sign: float = self._infer_approach_side_sign()
        self.last_signal_state: str = "UNKNOWN"

        # ── Calibration sanity check ───────────────────────────────────────
        res = cfg.get("resolution", [0, 0])   # [w, h]
        frame_w, frame_h = int(res[0]), int(res[1])
        if frame_w > 0 and frame_h > 0:
            lx1, ly1 = self._line_pts[0]
            lx2, ly2 = self._line_pts[1]
            signal_roi = cfg["signal_roi"]
            sx1, sy1 = signal_roi[0]
            sx2, sy2 = signal_roi[1]

            coords_ok = (
                max(ly1, ly2) <= frame_h and
                max(lx1, lx2) <= frame_w * 2 and  # allow 2× for widescreen calibration
                min(sx1, sx2) < frame_w and
                min(sy1, sy2) < frame_h
            )
            if not coords_ok:
                logger.error(
                    "CALIBRATION MISMATCH — stop-line coords %s and/or signal ROI %s "
                    "appear to be outside the %dx%d frame. "
                    "The stop line y-values (%.0f, %.0f) must be <= frame height %d. "
                    "Signal ROI x-values (%d, %d) must be < frame width %d. "
                    "RE-CALIBRATE via the Live Feed page — stop-line + signal ROI "
                    "coordinates must match the actual video resolution.",
                    self._line_pts, signal_roi,
                    frame_w, frame_h,
                    ly1, ly2, frame_h,
                    int(min(sx1, sx2)), int(max(sx1, sx2)), frame_w,
                )
            else:
                logger.info(
                    "Calibration sanity check PASSED — frame=%dx%d  "
                    "line_y=(%.0f,%.0f)  signal_roi=(%d-%d, %d-%d)",
                    frame_w, frame_h, ly1, ly2,
                    int(sx1), int(sx2), int(sy1), int(sy2),
                )

        logger.info(
            "Red-light module ready — line_pts=%s  signal_roi=%s  "
            "lane_polygon=%s",
            self._line_pts,
            cfg["signal_roi"],
            f"{len(polygon_pts)} vertices" if polygon_pts else "NONE (all vehicles eligible)",
        )
        logger.info(
            "Red-light crossing direction uses monitored-zone side sign=%+.0f",
            self._approach_side_sign,
        )

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

    # ── Public interface ───────────────────────────────────────────────────

    def reset_state(self) -> None:
        """Clear per-track red-light state when a video source/replay restarts."""
        self._confirmed_ids.clear()
        self._last_seen_frame.clear()
        self._prev_anchor_by_id.clear()
        logger.info("Red-light track state reset.")

    def _infer_approach_side_sign(self) -> float:
        """
        Infer which side of the diagonal stop line belongs to the monitored
        lane. A violation moves from this side to the opposite side.
        """
        if self._lane_polygon is None or len(self._lane_polygon) < 3:
            return -1.0

        centroid = np.mean(self._lane_polygon, axis=0)
        side = _signed_line_side(
            self._line_pts,
            float(centroid[0]),
            float(centroid[1]),
        )
        if abs(side) < 1e-6:
            return -1.0
        return 1.0 if side > 0 else -1.0

    def _violation_anchor(self, bbox: list[float]) -> tuple[float, float]:
        """
        Use the vehicle edge that clears the stop line last for crossing.
        ROI filtering still uses bottom-centre, but red-light violation timing
        should happen only after the full bounding region has crossed the line.
        """
        x1, y1, x2, y2 = bbox
        x_mid = (x1 + x2) / 2.0
        y_mid = (y1 + y2) / 2.0
        candidates = [
            (float(x1), float(y1)),
            (float(x2), float(y1)),
            (float(x1), float(y2)),
            (float(x2), float(y2)),
            (x_mid, float(y1)),
            (x_mid, float(y2)),
            (float(x1), y_mid),
            (float(x2), y_mid),
        ]
        return max(
            candidates,
            key=lambda pt: _signed_line_distance(self._line_pts, pt[0], pt[1])
            * self._approach_side_sign,
        )

    def _is_in_monitored_zone(self, x: float, y: float) -> bool:
        """
        Return True if (x, y) is inside (or on the boundary of) the configured
        lane ROI polygon.  When no polygon has been configured, returns True so
        that the system degrades gracefully to the original behaviour.
        """
        if self._lane_polygon is None:
            return True
        contour = self._lane_polygon.reshape(-1, 1, 2)
        # cv2.pointPolygonTest: positive = inside, 0 = on boundary, negative = outside
        result = cv2.pointPolygonTest(contour, (float(x), float(y)), False)
        return result >= 0

    def process_frame(
        self,
        frame: np.ndarray,
        frame_idx: int,
        tracked: list[TrackedBox] | None = None,
    ) -> list[dict]:
        signal_state = self._signal_detector.detect(frame)
        self.last_signal_state = signal_state
        if frame_idx % 30 == 0:
            tm, mm, bm = self._signal_detector.last_means
            logger.info(
                "frame=%d  signal=%s  V[top=%.1f mid=%.1f bot=%.1f]  tracks=%d",
                frame_idx, signal_state, tm, mm, bm,
                len(tracked) if tracked else 0,
            )

        if tracked is None:
            tracked = self._tracker.update(frame)

        # Remove stale y_prev entries for vehicles no longer in frame. Confirmed
        # IDs expire after a short absence so BoT-SORT ID reuse cannot suppress
        # later vehicles that receive the same numeric track_id.
        active_ids = {box["track_id"] for box in tracked} if tracked else set()
        for stale_id in set(vehicle_history.y_prev.keys()) - active_ids:
            vehicle_history.y_prev.pop(stale_id, None)
            self._prev_anchor_by_id.pop(stale_id, None)
        for stale_id, last_seen in list(self._last_seen_frame.items()):
            if stale_id in active_ids:
                continue
            if frame_idx - last_seen > _CONFIRMED_ID_TTL_FRAMES:
                self._last_seen_frame.pop(stale_id, None)
                self._prev_anchor_by_id.pop(stale_id, None)
                self._confirmed_ids.discard(stale_id)
                logger.debug(
                    "Pruned stale red-light track state tid=%d at frame=%d",
                    stale_id, frame_idx,
                )

        if not tracked:
            return []

        violations: list[dict] = []

        for box in tracked:
            tid = box["track_id"]
            self._last_seen_frame[tid] = frame_idx
            x1, y1, x2, y2 = box["bbox"]
            x_bc = (x1 + x2) / 2.0
            y_bc = float(y2)
            x_anchor, y_anchor = self._violation_anchor(box["bbox"])
            line_y_here = _line_y_at_x(self._line_pts, x_anchor)
            curr_side = _signed_line_distance(self._line_pts, x_anchor, y_anchor)
            curr_approach_side = curr_side * self._approach_side_sign

            # ── ROI filter ─────────────────────────────────────────────────
            # Test the vehicle's bottom-centre against the lane polygon BEFORE
            # any crossing or signal logic.  Vehicles from adjacent lanes,
            # cross-traffic, or any other area outside the polygon are ignored
            # completely — y_prev is NOT updated for them so that a vehicle
            # transitioning from outside → inside the polygon cannot trigger a
            # false positive on the frame it first enters the monitored zone.
            in_roi = self._is_in_monitored_zone(x_bc, y_bc)

            logger.debug(
                "frame=%d  tid=%d  cls=%s  x_bc=%.0f  y_bc=%.1f  "
                "x_clear=%.0f  y_clear=%.1f  line_y=%.1f  signal=%s  in_roi=%s",
                frame_idx, tid, box["class_name"],
                x_bc, y_bc, x_anchor, y_anchor, line_y_here, signal_state, in_roi,
            )

            if not in_roi:
                # Vehicles outside the monitored zone are completely ignored.
                # y_prev is intentionally NOT updated here: if a vehicle enters
                # the ROI from outside, it will have no prior y position, which
                # prevents a false crossing detection on the entry frame.
                logger.debug(
                    "IGNORED (out-of-ROI)  frame=%d  tid=%d  x_bc=%.0f  y_bc=%.1f",
                    frame_idx, tid, x_bc, y_bc,
                )
                self._prev_anchor_by_id.pop(tid, None)
                continue

            # ── Crossing check (in-ROI vehicles only) ─────────────────────
            if tid in self._prev_anchor_by_id:
                x_prev_val, y_prev_val = self._prev_anchor_by_id[tid]
                v = y_anchor - y_prev_val
                prev_line_y = _line_y_at_x(self._line_pts, x_prev_val)
                prev_side = _signed_line_distance(self._line_pts, x_prev_val, y_prev_val)
                prev_approach_side = prev_side * self._approach_side_sign
                crossed = (
                    prev_approach_side >= -_STOP_LINE_TOLERANCE_PX
                    and curr_approach_side < -_STOP_LINE_TOLERANCE_PX
                )

                logger.debug(
                    "CROSSING CHECK  frame=%d  tid=%d  "
                    "x_prev=%.0f  y_prev=%.1f  x_clear=%.0f  y_clear=%.1f  v=%.1f  "
                    "prev_line_y=%.1f  line_y=%.1f  prev_dist=%.1f  curr_dist=%.1f  "
                    "approach_prev=%.1f  approach_curr=%.1f  crossed=%s  "
                    "signal=%s  already_confirmed=%s",
                    frame_idx, tid,
                    x_prev_val, y_prev_val, x_anchor, y_anchor, v,
                    prev_line_y, line_y_here, prev_side, curr_side,
                    prev_approach_side, curr_approach_side, crossed,
                    signal_state,
                    tid in self._confirmed_ids,
                )

                if crossed:
                    logger.info(
                        "LINE CROSS  tid=%d  x=%.0f  "
                        "y_prev=%.1f → y_curr=%.1f  line_y@x=%.1f  "
                        "signal=%s  frame=%d",
                        tid, x_anchor,
                        y_prev_val, y_anchor, line_y_here,
                        signal_state, frame_idx,
                    )

                if (
                    signal_state == "RED"
                    and crossed
                    and tid not in self._confirmed_ids
                ):
                    self._confirmed_ids.add(tid)
                    logger.warning(
                        "RED-LIGHT VIOLATION  tid=%d  frame=%d  bbox=%s  "
                        "y_prev=%.1f  y_bc=%.1f  line_y=%.1f",
                        tid, frame_idx, [int(v) for v in box["bbox"]],
                        y_prev_val, y_anchor, line_y_here,
                    )
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
            else:
                # No prior y position — vehicle first appeared in this frame
                # (or just entered the ROI). Skip crossing check; next frame
                # will have y_prev set and detection will work normally.
                rear_side = _signed_line_distance(self._line_pts, x_bc, y_bc)
                rear_approach_side = rear_side * self._approach_side_sign
                first_seen_on_line = (
                    curr_approach_side < -_STOP_LINE_TOLERANCE_PX
                    and rear_approach_side > _STOP_LINE_TOLERANCE_PX
                )
                if curr_approach_side < -_STOP_LINE_TOLERANCE_PX:
                    logger.warning(
                        "FIRST-SEEN AFTER/ON STOP LINE  frame=%d  tid=%d  "
                        "x_clear=%.0f  y_clear=%.1f  line_y=%.1f  dist=%.1f  rear_dist=%.1f  "
                        "signal=%s  on_line=%s  no violation without prior crossing",
                        frame_idx, tid, x_anchor, y_anchor, line_y_here,
                        curr_approach_side, rear_approach_side, signal_state, first_seen_on_line,
                    )
                logger.debug(
                    "NO y_prev for tid=%d at frame=%d (first in-ROI detection) "
                    "— crossing check deferred to next frame",
                    tid, frame_idx,
                )

            # Update y_prev only for in-ROI vehicles so out-of-ROI transitions
            # cannot generate false positives.
            vehicle_history.y_prev[tid] = y_bc
            self._prev_anchor_by_id[tid] = (x_anchor, y_anchor)

        return violations

    def draw_debug_overlay(
        self,
        frame: np.ndarray,
        tracked: list[TrackedBox],
    ) -> np.ndarray:
        """
        Draw diagnostic overlays onto *frame* (in-place):
          - Cyan polygon outline + semi-transparent fill for the monitored zone
          - Green bottom-centre dot and IN label for vehicles inside the ROI
          - Grey dot and OUT label for vehicles outside the ROI (ignored)

        Call this after process_frame() to visualise which vehicles are being
        considered and which are being filtered out.
        """
        # ── Monitored-zone polygon ─────────────────────────────────────────
        if self._lane_polygon is not None:
            pts = self._lane_polygon.astype(np.int32).reshape(-1, 1, 2)
            overlay = frame.copy()
            cv2.fillPoly(overlay, [pts], (0, 255, 255))
            cv2.addWeighted(overlay, 0.10, frame, 0.90, 0, frame)
            cv2.polylines(frame, [pts], isClosed=True,
                          color=(0, 255, 255), thickness=2)
            lbl_x = int(self._lane_polygon[0][0])
            lbl_y = max(15, int(self._lane_polygon[0][1]) - 10)
            cv2.putText(
                frame, "MONITORED ZONE", (lbl_x, lbl_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 255, 255), 2,
            )

        # ── Per-vehicle IN / OUT status ────────────────────────────────────
        for box in tracked:
            tid = box["track_id"]
            x1, _y1, x2, y2 = (int(v) for v in box["bbox"])
            x_bc_i = (x1 + x2) // 2
            y_bc_i = y2
            in_roi = self._is_in_monitored_zone(float(x_bc_i), float(y_bc_i))

            dot_color = (0, 220, 0) if in_roi else (110, 110, 110)
            txt_color = (0, 220, 0) if in_roi else (110, 110, 110)
            status_lbl = f"{'IN' if in_roi else 'OUT'}#{tid}"

            cv2.circle(frame, (x_bc_i, y_bc_i), 6, dot_color, -1)
            label_y = min(frame.shape[0] - 4, y_bc_i + 17)
            cv2.putText(frame, status_lbl, (x1, label_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.40, txt_color, 1)

        return frame

    @staticmethod
    def build_violation_record(violation: dict, plate_text: str | None) -> dict:
        """Merge a completed ANPR result back into an existing violation dict."""
        return {**violation, "plate_text": plate_text}

    # ── Private helpers ────────────────────────────────────────────────────

    def _save_crop(
        self, frame: np.ndarray, bbox: list[float], track_id: int, frame_idx: int
    ) -> str:
        """
        Save a contextual snapshot for the violation: a padded crop around the
        vehicle with the bounding box drawn on it so the car AND the detection
        box are both visible in the dashboard's violation gallery.
        """
        h_f, w_f = frame.shape[:2]
        x1, y1, x2, y2 = (int(v) for v in bbox)

        # Pad by ~30 % of the bbox size, clamped to frame bounds
        pad_x = max(40, int((x2 - x1) * 0.3))
        pad_y = max(40, int((y2 - y1) * 0.3))
        cx1 = max(0, x1 - pad_x)
        cy1 = max(0, y1 - pad_y)
        cx2 = min(w_f, x2 + pad_x)
        cy2 = min(h_f, y2 + pad_y)

        crop = frame[cy1:cy2, cx1:cx2].copy()
        if crop.size == 0:
            crop = frame.copy()
            cx1, cy1 = 0, 0

        # bbox coords expressed in the crop's coordinate space
        bx1, by1 = x1 - cx1, y1 - cy1
        bx2, by2 = x2 - cx1, y2 - cy1

        cv2.rectangle(crop, (bx1, by1), (bx2, by2), (0, 0, 255), 3)
        label = f"RED-LIGHT  #{track_id}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        ly1 = max(0, by1 - th - 8)
        cv2.rectangle(crop, (bx1, ly1), (bx1 + tw + 8, by1), (0, 0, 255), -1)
        cv2.putText(
            crop, label, (bx1 + 4, by1 - 5),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2,
        )

        out_dir = Path(settings.STATIC_FILES_DIR) / "violations"
        out_dir.mkdir(parents=True, exist_ok=True)

        filename = f"rl_{track_id}_{frame_idx}.jpg"
        cv2.imwrite(str(out_dir / filename), crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
        return f"/static/violations/{filename}"

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
            logger.error(
                "DB persist failed for red-light violation track_id=%d: %s",
                record["track_id"], exc,
            )
        finally:
            db.close()
