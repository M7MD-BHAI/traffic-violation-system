from datetime import datetime, timezone

from pydantic import BaseModel, field_serializer


class ViolationCreate(BaseModel):
    track_id: int
    violation_type: str          # RED_LIGHT | HELMET | SPEED
    timestamp: datetime
    image_path: str | None = None
    plate_text: str | None = None
    plate_status: str | None = None
    confidence_score: float | None = None
    speed_kmh: float | None = None
    speed_limit: float | None = None
    bbox: list | None = None
    road_id: str | None = None
    frame_idx: int | None = None
    merged_with: int | None = None


class ViolationOut(BaseModel):
    id: int
    track_id: int
    violation_type: str
    timestamp: datetime
    image_path: str | None
    plate_text: str | None
    plate_status: str | None
    confidence_score: float | None
    speed_kmh: float | None
    speed_limit: float | None
    bbox: list | None
    road_id: str | None
    frame_idx: int | None
    merged_with: int | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("timestamp", "created_at")
    def serialize_datetime_utc(self, value: datetime) -> str:
        """
        SQLite returns timezone-aware values as naive datetimes. Treat stored
        violation times as UTC so clients convert them to the correct local time.
        """
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
