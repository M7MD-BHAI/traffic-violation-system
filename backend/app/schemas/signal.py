from datetime import datetime

from pydantic import BaseModel


class CongestionUpdate(BaseModel):
    road_id: str
    density_index: int
    vehicle_count: int
    stagnant_count: int = 0


class SignalStateUpdate(BaseModel):
    road_id: str
    state: str      # RED | GREEN | YELLOW


class RoadRecommendation(BaseModel):
    road_id: str
    density_index: int
    time_extension_s: int


class OptimisationResult(BaseModel):
    green_road: str | None
    green_ci: int
    recommendations: list[RoadRecommendation]
    computed_at: datetime


class CongestionSnapshotOut(BaseModel):
    id: int
    road_id: str
    density_index: int
    vehicle_count: int
    stagnant_count: int
    timestamp: datetime

    model_config = {"from_attributes": True}
