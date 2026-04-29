from datetime import datetime

from pydantic import BaseModel


class VehicleOut(BaseModel):
    id: int
    track_id: int
    class_name: str
    class_group: str
    first_seen: datetime
    last_seen: datetime

    model_config = {"from_attributes": True}


class CountingReportCreate(BaseModel):
    timestamp: datetime
    interval_minutes: int = 1
    car_count: int = 0
    motorcycle_count: int = 0
    bus_count: int = 0
    truck_count: int = 0
    total_small: int = 0
    total_medium: int = 0
    total_heavy: int = 0


class CountingReportOut(BaseModel):
    id: int
    timestamp: datetime
    interval_minutes: int
    car_count: int
    motorcycle_count: int
    bus_count: int
    truck_count: int
    total_small: int
    total_medium: int
    total_heavy: int

    model_config = {"from_attributes": True}
