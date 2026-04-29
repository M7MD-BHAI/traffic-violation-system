from datetime import datetime

from pydantic import BaseModel


class AccidentAlert(BaseModel):
    alert_type: str           # STAGNATION | CRASH
    track_ids: list[int]
    timestamp: datetime
    road_id: str | None = None
    bbox: list | None = None
    clip_path: str | None = None


class AccidentOut(BaseModel):
    id: int
    alert_type: str
    track_ids: list
    timestamp: datetime
    road_id: str | None
    clip_path: str | None
    bbox: list | None
    resolved: bool
    created_at: datetime

    model_config = {"from_attributes": True}
