from sqlalchemy.orm import Session

from app.database.models import Accident
from app.schemas.accident import AccidentAlert


def save_alert(db: Session, data: AccidentAlert) -> Accident:
    accident = Accident(**data.model_dump())
    db.add(accident)
    db.commit()
    db.refresh(accident)
    return accident


def get_alerts(
    db: Session,
    resolved: bool | None = None,
    limit: int = 50,
) -> list[Accident]:
    query = db.query(Accident)
    if resolved is not None:
        query = query.filter(Accident.resolved == resolved)
    return query.order_by(Accident.timestamp.desc()).limit(limit).all()


def resolve_alert(db: Session, accident_id: int) -> Accident | None:
    accident = db.query(Accident).filter(Accident.id == accident_id).first()
    if not accident:
        return None
    accident.resolved = True
    db.commit()
    db.refresh(accident)
    return accident
