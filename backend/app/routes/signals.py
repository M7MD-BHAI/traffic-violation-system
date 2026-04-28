from fastapi import APIRouter, Depends

from app.detection.optimization.signal_control import aggregator
from app.routes.auth import get_current_user
from app.schemas.signal import CongestionUpdate, SignalStateUpdate

router = APIRouter(prefix="/congestion", tags=["congestion"])


@router.post("/update")
def congestion_update(
    body: CongestionUpdate,
    _: object = Depends(get_current_user),
) -> dict:
    aggregator.ingest(body.road_id, body.density_index, body.vehicle_count)
    return aggregator.get_last_optimisation()


@router.post("/signal-state")
def signal_state(
    body: SignalStateUpdate,
    _: object = Depends(get_current_user),
) -> dict:
    aggregator.set_signal_state(body.road_id, body.state)
    return {"ok": True}


@router.get("/status")
def congestion_status(_: object = Depends(get_current_user)) -> dict:
    return aggregator.get_last_optimisation()
