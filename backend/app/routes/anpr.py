from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.crud.anpr import get_plate_by_track, search_by_plate_text
from app.database.connection import get_db
from app.routes.auth import get_current_user
from app.schemas.anpr import PlateResultOut

router = APIRouter(prefix="/anpr", tags=["anpr"])


# /anpr/search must be declared before /anpr/{track_id} so FastAPI
# does not try to coerce the literal "search" to int.
@router.get("/search", response_model=list[PlateResultOut])
def search_plate(
    plate: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[PlateResultOut]:
    rows = search_by_plate_text(db, plate)
    return [PlateResultOut.model_validate(r) for r in rows]


@router.get("/{track_id}", response_model=PlateResultOut)
def get_by_track(
    track_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> PlateResultOut:
    row = get_plate_by_track(db, track_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No ANPR result for this track_id")
    return PlateResultOut.model_validate(row)
