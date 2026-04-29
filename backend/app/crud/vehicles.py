from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.database.models import CountingReport, Vehicle
from app.schemas.vehicle import CountingReportCreate


def get_vehicles(
    db: Session,
    class_name: str | None = None,
    limit: int = 50,
) -> list[Vehicle]:
    query = db.query(Vehicle)
    if class_name:
        query = query.filter(Vehicle.class_name == class_name)
    return query.order_by(Vehicle.last_seen.desc()).limit(limit).all()


def save_counting_report(db: Session, data: CountingReportCreate) -> CountingReport:
    report = CountingReport(**data.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def get_latest_counts(
    db: Session, report_date: date | None = None
) -> CountingReport | None:
    query = db.query(CountingReport)
    if report_date:
        query = query.filter(
            CountingReport.timestamp >= datetime(report_date.year, report_date.month, report_date.day),
            CountingReport.timestamp < datetime(report_date.year, report_date.month, report_date.day) + timedelta(days=1),
        )
    return query.order_by(CountingReport.id.desc()).first()
