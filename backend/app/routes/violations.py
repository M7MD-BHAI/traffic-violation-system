from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.crud.violations import (
    delete_violation,
    get_violation_by_id,
    get_violations,
    insert_violation,
)
from app.database.connection import get_db
from app.routes.auth import get_current_user, require_admin
from app.schemas.violation import ViolationCreate, ViolationOut

router = APIRouter(prefix="/violations", tags=["violations"])


@router.post("/red-light", response_model=ViolationOut, status_code=status.HTTP_201_CREATED)
def create_red_light(
    body: ViolationCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> ViolationOut:
    body.violation_type = "RED_LIGHT"
    return ViolationOut.model_validate(insert_violation(db, body))


@router.post("/helmet", response_model=ViolationOut, status_code=status.HTTP_201_CREATED)
def create_helmet(
    body: ViolationCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> ViolationOut:
    body.violation_type = "HELMET"
    return ViolationOut.model_validate(insert_violation(db, body))


@router.post("/speed", response_model=ViolationOut, status_code=status.HTTP_201_CREATED)
def create_speed(
    body: ViolationCreate,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> ViolationOut:
    body.violation_type = "SPEED"
    return ViolationOut.model_validate(insert_violation(db, body))


@router.get("", response_model=list[ViolationOut])
def list_violations(
    type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    plate: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[ViolationOut]:
    rows = get_violations(db, violation_type=type, date_from=date_from,
                          date_to=date_to, plate=plate, limit=limit, offset=offset)
    return [ViolationOut.model_validate(r) for r in rows]


@router.get("/{violation_id}", response_model=ViolationOut)
def get_one(
    violation_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> ViolationOut:
    row = get_violation_by_id(db, violation_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Violation not found")
    return ViolationOut.model_validate(row)


@router.delete("/{violation_id}", dependencies=[Depends(require_admin)])
def remove(violation_id: int, db: Session = Depends(get_db)) -> dict:
    if not delete_violation(db, violation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Violation not found")
    return {"ok": True}
