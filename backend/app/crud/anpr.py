from datetime import datetime

from sqlalchemy.orm import Session

from app.database.models import PlateResult, Violation


def save_plate_result(
    db: Session,
    violation_id: int,
    track_id: int,
    plate_text: str | None,
    confidence_score: float | None,
    status: str,
    message: str | None,
    timestamp: datetime,
) -> PlateResult:
    result = PlateResult(
        violation_id=violation_id,
        track_id=track_id,
        plate_text=plate_text,
        confidence_score=confidence_score,
        status=status,
        message=message,
        timestamp=timestamp,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


def get_plate_by_track(db: Session, track_id: int) -> PlateResult | None:
    return (
        db.query(PlateResult)
        .filter(PlateResult.track_id == track_id)
        .order_by(PlateResult.id.desc())
        .first()
    )


def search_by_plate_text(db: Session, plate_text: str) -> list[PlateResult]:
    return (
        db.query(PlateResult)
        .filter(PlateResult.plate_text.ilike(f"%{plate_text}%"))
        .order_by(PlateResult.id.desc())
        .all()
    )


def find_violation_id_by_track(db: Session, track_id: int) -> int | None:
    """Look up the most recent violation ID for a track — used by ANPR when
    the caller did not supply a violation_id."""
    row = (
        db.query(Violation.id)
        .filter(Violation.track_id == track_id)
        .order_by(Violation.id.desc())
        .first()
    )
    return row[0] if row else None
