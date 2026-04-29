from datetime import datetime

from sqlalchemy.orm import Session

from app.database.models import CongestionSnapshot


def save_congestion_snapshot(
    db: Session,
    road_id: str,
    density_index: int,
    vehicle_count: int,
    stagnant_count: int,
    timestamp: datetime,
) -> CongestionSnapshot:
    snapshot = CongestionSnapshot(
        road_id=road_id,
        density_index=density_index,
        vehicle_count=vehicle_count,
        stagnant_count=stagnant_count,
        timestamp=timestamp,
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def get_congestion_history(
    db: Session,
    road_id: str,
    limit: int = 100,
) -> list[CongestionSnapshot]:
    return (
        db.query(CongestionSnapshot)
        .filter(CongestionSnapshot.road_id == road_id)
        .order_by(CongestionSnapshot.timestamp.desc())
        .limit(limit)
        .all()
    )
