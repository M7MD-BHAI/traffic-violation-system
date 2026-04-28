from datetime import datetime

from sqlalchemy.orm import Session

from app.database.models import Violation
from app.schemas.violation import ViolationCreate


def insert_violation(db: Session, data: ViolationCreate) -> Violation:
    violation = Violation(**data.model_dump())
    db.add(violation)
    db.commit()
    db.refresh(violation)
    return violation


def get_violation_by_id(db: Session, violation_id: int) -> Violation | None:
    return db.query(Violation).filter(Violation.id == violation_id).first()


def get_violations(
    db: Session,
    violation_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    plate: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Violation]:
    query = db.query(Violation)

    if violation_type:
        query = query.filter(Violation.violation_type == violation_type)
    if date_from:
        query = query.filter(Violation.timestamp >= date_from)
    if date_to:
        query = query.filter(Violation.timestamp <= date_to)
    if plate:
        query = query.filter(Violation.plate_text.ilike(f"%{plate}%"))

    return query.order_by(Violation.timestamp.desc()).offset(offset).limit(limit).all()


def update_violation_plate(
    db: Session,
    violation_id: int,
    plate_text: str | None,
    plate_status: str,
    confidence_score: float | None,
) -> Violation | None:
    violation = get_violation_by_id(db, violation_id)
    if not violation:
        return None
    violation.plate_text = plate_text
    violation.plate_status = plate_status
    violation.confidence_score = confidence_score
    db.commit()
    db.refresh(violation)
    return violation


def delete_violation(db: Session, violation_id: int) -> bool:
    violation = get_violation_by_id(db, violation_id)
    if not violation:
        return False
    db.delete(violation)
    db.commit()
    return True
