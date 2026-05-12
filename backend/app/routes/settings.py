"""
Settings route — runtime-adjustable parameters that can be tuned from the
React dashboard without restarting the backend.

Values are held in-memory and applied immediately to the running processor.
They are NOT persisted across restarts (use the .env file for that).
"""
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])

# In-memory overlay of runtime settings (start from .env values)
_runtime: dict = {
    "speed_limit_kmh":          settings.SPEED_LIMIT_KMH,
    "anpr_confidence_threshold": settings.ANPR_CONFIDENCE_THRESHOLD,
    "helmet_voting_threshold":  0.70,
    "camera_name":              "main_road",
    "video_source":             settings.VIDEO_SOURCE,
}


class SettingsBody(BaseModel):
    speed_limit_kmh:           float | None = None
    anpr_confidence_threshold: float | None = None
    helmet_voting_threshold:   float | None = None
    camera_name:               str | None = None
    video_source:              str | None = None


@router.get("")
def get_settings() -> dict:
    return dict(_runtime)


@router.post("")
def save_settings(body: SettingsBody) -> dict:
    updated: list[str] = []

    if body.speed_limit_kmh is not None:
        _runtime["speed_limit_kmh"] = body.speed_limit_kmh
        _apply_speed_limit(body.speed_limit_kmh)
        updated.append("speed_limit_kmh")

    if body.anpr_confidence_threshold is not None:
        _runtime["anpr_confidence_threshold"] = body.anpr_confidence_threshold
        updated.append("anpr_confidence_threshold")

    if body.helmet_voting_threshold is not None:
        _runtime["helmet_voting_threshold"] = body.helmet_voting_threshold
        updated.append("helmet_voting_threshold")

    if body.camera_name is not None:
        _runtime["camera_name"] = body.camera_name
        updated.append("camera_name")

    if body.video_source is not None:
        _runtime["video_source"] = body.video_source
        updated.append("video_source")

    logger.info("Settings updated: %s", updated)
    return {"status": "ok", "updated": updated, "current": dict(_runtime)}


def _apply_speed_limit(limit: float) -> None:
    """Push the new speed limit into the running speed module if it's active."""
    try:
        from app.detection.video_processor import processor  # noqa: PLC0415
        if processor._speed is not None:
            processor._speed._speed_limit = limit
            logger.info("Speed limit updated to %.1f km/h", limit)
    except Exception as exc:
        logger.warning("Could not apply speed limit to running processor: %s", exc)
