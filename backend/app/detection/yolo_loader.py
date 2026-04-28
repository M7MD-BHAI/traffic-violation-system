import logging
from pathlib import Path

from ultralytics import YOLO

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level singletons — None until first access
_primary_model: YOLO | None = None
_helmet_model: YOLO | None = None
_plate_model: YOLO | None = None


def get_primary_model() -> YOLO:
    """Return the shared YOLOv8n vehicle detection + tracking model (COCO weights)."""
    global _primary_model
    if _primary_model is None:
        path = settings.YOLO_PRIMARY_MODEL_PATH
        logger.info("Loading primary YOLO model from %s", path)
        _primary_model = YOLO(path)
    return _primary_model


def get_helmet_model() -> YOLO:
    """Return the custom-trained helmet/bare_head classification model."""
    global _helmet_model
    if _helmet_model is None:
        path = settings.YOLO_HELMET_MODEL_PATH
        if not Path(path).exists():
            raise FileNotFoundError(
                f"Helmet model not found at '{path}'. "
                "Set YOLO_HELMET_MODEL_PATH in .env to the correct path."
            )
        logger.info("Loading helmet YOLO model from %s", path)
        _helmet_model = YOLO(path)
    return _helmet_model


def get_plate_model() -> YOLO:
    """Return the custom-trained license plate detection model."""
    global _plate_model
    if _plate_model is None:
        path = settings.YOLO_PLATE_MODEL_PATH
        if not Path(path).exists():
            raise FileNotFoundError(
                f"Plate model not found at '{path}'. "
                "Set YOLO_PLATE_MODEL_PATH in .env to the correct path."
            )
        logger.info("Loading plate YOLO model from %s", path)
        _plate_model = YOLO(path)
    return _plate_model
