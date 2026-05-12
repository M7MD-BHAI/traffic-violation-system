import json
from pathlib import Path

import cv2
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.detection.video_processor import processor

router = APIRouter(prefix="/video", tags=["video"])

_UPLOAD_DIR = Path("data/test_videos")
_CONFIG_PATH = Path("calibration_config.json")


class CalibrationBody(BaseModel):
    stop_line: list[list[int]]             # [[x1,y1],[x2,y2]]
    signal_roi: list[list[int]]            # [[x1,y1],[x2,y2]]
    lane_polygon: list[list[int]] | None = None  # ≥3 pts; None = no ROI filter
    resolution: list[int] | None = None    # [w,h] from calibration canvas, optional


def _point_distance(a: list[int], b: list[int]) -> float:
    dx = float(a[0] - b[0])
    dy = float(a[1] - b[1])
    return (dx * dx + dy * dy) ** 0.5


def _current_source_resolution() -> list[int] | None:
    source = processor.get_source()
    cap_source: int | str = int(source) if source.isdigit() else source
    cap = cv2.VideoCapture(cap_source)
    try:
        ret, frame = cap.read()
        if not ret:
            return None
        h, w = frame.shape[:2]
        return [int(w), int(h)]
    finally:
        cap.release()


def _validate_points_in_frame(
    points: list[list[int]],
    resolution: list[int] | None,
    field_name: str,
) -> None:
    if resolution is None:
        return
    w, h = int(resolution[0]), int(resolution[1])
    for x, y in points:
        if x < 0 or y < 0 or x >= w or y >= h:
            raise HTTPException(
                status_code=422,
                detail=f"{field_name} point [{x}, {y}] is outside the {w}x{h} video frame",
            )


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> dict:
    """Stream video to disk in 1 MB chunks, then reload the processor in the background."""
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name
    dest = _UPLOAD_DIR / safe_name

    # Write in chunks — never loads the full file into RAM
    with open(dest, "wb") as f:
        while chunk := await file.read(1024 * 1024):   # 1 MB at a time
            f.write(chunk)

    # Update source path immediately so /first-frame works right away
    processor.set_source(str(dest))

    # Restart the video loop in the background (stop + wait ~3 s)
    # so the response returns as soon as the file is saved
    background_tasks.add_task(processor.reload, str(dest))

    return {"filename": safe_name, "path": str(dest)}


@router.get("/first-frame")
def get_first_frame() -> Response:
    """Return the first frame of the current video source as a JPEG image."""
    source = processor.get_source()
    cap_source: int | str = int(source) if source.isdigit() else source
    cap = cv2.VideoCapture(cap_source)
    ret, frame = cap.read()
    cap.release()
    if not ret:
        raise HTTPException(status_code=404, detail="Cannot read from video source")
    _, buf = cv2.imencode(".jpg", frame)
    return Response(
        content=buf.tobytes(),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/debug")
def get_debug() -> dict:
    """Snapshot of the red-light detector's live state — useful for diagnosing detection issues."""
    import app.detection.tracking.vehicle_history as vh
    rl = processor._red_light
    lane_poly = (
        rl._lane_polygon.tolist() if rl is not None and rl._lane_polygon is not None else None
    )
    return {
        "red_light_active": rl is not None,
        "signal_state":     processor._signal_state,
        "frame_fps":        round(processor._fps, 1),
        "track_count":      processor._track_count,
        "debug_overlay":    processor._debug,
        "line_pts":         rl._line_pts if rl else None,
        "lane_polygon":     lane_poly,
        "lane_polygon_active": lane_poly is not None,
        "signal_roi":       [
            [rl._signal_detector._x1, rl._signal_detector._y1],
            [rl._signal_detector._x2, rl._signal_detector._y2],
        ] if rl else None,
        "signal_v_means":   list(rl._signal_detector.last_means) if rl else None,
        "confirmed_violation_ids": list(rl._confirmed_ids) if rl else [],
        "y_prev_map":       dict(vh.y_prev),
    }


@router.post("/debug/overlay")
def toggle_debug_overlay(enabled: bool | None = None) -> dict:
    """
    Toggle (or explicitly set) the lane-ROI debug overlay on the live stream.
    Pass ?enabled=true/false to set explicitly; omit to flip current state.
    Returns the new overlay state.
    """
    new_state = processor.toggle_debug(enabled)
    return {"debug_overlay": new_state}


@router.post("/calibration")
def set_calibration(body: CalibrationBody) -> dict:
    """
    Save stop-line, signal-ROI, and optional lane polygon, then re-initialise
    the red-light module.

    lane_polygon — list of ≥3 [x, y] points defining the monitored zone.
    Only vehicles whose bottom-centre falls inside this polygon will be
    checked for red-light violations.  Omit (or pass null) to remove the
    polygon and revert to whole-frame eligibility.
    """
    if len(body.stop_line) != 2 or len(body.signal_roi) != 2:
        raise HTTPException(
            status_code=422,
            detail="stop_line and signal_roi must each contain exactly 2 points",
        )
    if _point_distance(body.stop_line[0], body.stop_line[1]) < 10:
        raise HTTPException(
            status_code=422,
            detail="stop_line endpoints are too close together; click two different points on the visual stop line",
        )
    roi_w = abs(body.signal_roi[1][0] - body.signal_roi[0][0])
    roi_h = abs(body.signal_roi[1][1] - body.signal_roi[0][1])
    if roi_w < 10 or roi_h < 10:
        raise HTTPException(
            status_code=422,
            detail="signal_roi is too small; drag/click two opposite corners around the signal light",
        )
    if body.lane_polygon is not None and len(body.lane_polygon) < 3:
        raise HTTPException(
            status_code=422,
            detail="lane_polygon must have at least 3 points",
        )

    source_resolution = _current_source_resolution()
    resolution = source_resolution or body.resolution
    _validate_points_in_frame(body.stop_line, resolution, "stop_line")
    _validate_points_in_frame(body.signal_roi, resolution, "signal_roi")
    if body.lane_polygon:
        _validate_points_in_frame(body.lane_polygon, resolution, "lane_polygon")

    existing: dict = {}
    if _CONFIG_PATH.exists():
        try:
            existing = json.loads(_CONFIG_PATH.read_text())
        except Exception:
            pass

    config = {
        **existing,
        "violation_line": body.stop_line,
        "signal_roi":     body.signal_roi,
        "calibrated":     True,
    }
    if resolution is not None:
        config["resolution"] = resolution
    if body.lane_polygon:
        config["lane_polygon"] = body.lane_polygon
    else:
        config.pop("lane_polygon", None)  # explicit null removes the polygon

    _CONFIG_PATH.write_text(json.dumps(config, indent=2))
    processor.reinit_red_light()
    return {
        "status": "ok",
        "lane_polygon_active": body.lane_polygon is not None,
    }
