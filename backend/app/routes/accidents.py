from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.crud.accidents import get_alerts, resolve_alert, save_alert
from app.database.connection import get_db
from app.routes.auth import get_current_user, require_admin
from app.schemas.accident import AccidentAlert, AccidentOut

router = APIRouter(prefix="/alerts", tags=["accidents"])


@router.post("/accident", response_model=AccidentOut, status_code=status.HTTP_201_CREATED)
def report_accident(
    body: AccidentAlert,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> AccidentOut:
    return AccidentOut.model_validate(save_alert(db, body))


@router.get("/accident", response_model=list[AccidentOut])
def list_accidents(
    resolved: bool | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[AccidentOut]:
    rows = get_alerts(db, resolved=resolved, limit=limit)
    return [AccidentOut.model_validate(r) for r in rows]


@router.patch("/accident/{accident_id}/resolve", dependencies=[Depends(require_admin)])
def mark_resolved(accident_id: int, db: Session = Depends(get_db)) -> dict:
    accident = resolve_alert(db, accident_id)
    if not accident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Accident alert not found")
    return {"ok": True}
