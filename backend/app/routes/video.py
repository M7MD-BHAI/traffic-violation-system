import json
from pathlib import Path

import cv2
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.detection.video_processor import processor

router = APIRouter(prefix="/video", tags=["video"])

_UPLOAD_DIR = Path("data/test_videos")
_CONFIG_PATH = Path("calibration_config.json")


class CalibrationBody(BaseModel):
    stop_line: list[list[int]]   # [[x1,y1],[x2,y2]]
    signal_roi: list[list[int]]  # [[x1,y1],[x2,y2]]


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)) -> dict:
    """Save uploaded video file and reload the processor with the new source."""
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename).name  # strip any path components
    dest = _UPLOAD_DIR / safe_name
    content = await file.read()
    dest.write_bytes(content)
    processor.reload(str(dest))
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


@router.post("/calibration")
def set_calibration(body: CalibrationBody) -> dict:
    """Save stop-line + signal-ROI coordinates and re-initialise the red-light module."""
    if len(body.stop_line) != 2 or len(body.signal_roi) != 2:
        raise HTTPException(
            status_code=422,
            detail="stop_line and signal_roi must each contain exactly 2 points",
        )

    existing: dict = {}
    if _CONFIG_PATH.exists():
        try:
            existing = json.loads(_CONFIG_PATH.read_text())
        except Exception:
            pass

    config = {
        **existing,
        "violation_line": body.stop_line,
        "signal_roi": body.signal_roi,
        "calibrated": True,
    }
    _CONFIG_PATH.write_text(json.dumps(config, indent=2))
    processor.reinit_red_light()
    return {"status": "ok"}
