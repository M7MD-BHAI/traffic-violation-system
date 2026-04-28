from datetime import date

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.crud.vehicles import get_latest_counts, get_vehicles, save_counting_report
from app.database.connection import get_db
from app.routes.auth import get_current_user
from app.schemas.vehicle import CountingReportCreate, CountingReportOut, VehicleOut

router = APIRouter(tags=["vehicles"])


@router.get("/vehicles", response_model=list[VehicleOut])
def list_vehicles(
    class_name: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[VehicleOut]:
    rows = get_vehicles(db, class_name=class_name, limit=limit)
    return [VehicleOut.model_validate(r) for r in rows]


@router.get("/analytics/counting", response_model=CountingReportOut | None)
def get_counting(
    report_date: date | None = None,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> CountingReportOut | None:
    row = get_latest_counts(db, report_date=report_date)
    return CountingReportOut.model_validate(row) if row else None


@router.post("/analytics/counting", response_model=CountingReportOut,
             status_code=status.HTTP_201_CREATED)
def post_counting(
    body: CountingReportCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> CountingReportOut:
    return CountingReportOut.model_validate(save_counting_report(db, body))
