from datetime import datetime

from pydantic import BaseModel


class PlateResultOut(BaseModel):
    id: int
    violation_id: int
    track_id: int
    plate_text: str | None
    confidence_score: float | None
    status: str      # ok | plate_not_visible | no_plate_found | ocr_failed | empty_crop
    message: str | None
    timestamp: datetime

    model_config = {"from_attributes": True}
