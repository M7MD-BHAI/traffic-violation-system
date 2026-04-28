from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.detection.optimization.signal_control import ws_manager

router = APIRouter(tags=["optimization"])


@router.websocket("/congestion/ws")
async def congestion_ws(ws: WebSocket) -> None:
    await ws_manager.connect(ws)
    try:
        # Keep connection alive — the aggregator pushes updates via broadcast()
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)
