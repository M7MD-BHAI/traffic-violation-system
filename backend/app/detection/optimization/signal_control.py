import asyncio
import logging
from datetime import datetime, timezone

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Extension rate: +2 s per 10 CI points of difference between red and green roads
_EXTENSION_RATE_S = 2
_EXTENSION_PER_CI = 10
# A red road must be 40% denser than the green road to earn an extension
_EXTENSION_THRESHOLD = 1.40


class ConnectionManager:
    """Tracks live WebSocket connections and broadcasts JSON to all of them."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        logger.info("WebSocket client connected. Total: %d", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        self._connections = [c for c in self._connections if c is not ws]
        logger.info("WebSocket client disconnected. Total: %d", len(self._connections))

    async def broadcast(self, data: dict) -> None:
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


# Module-level singleton — imported by routes/optimization.py for the WS endpoint
ws_manager = ConnectionManager()


class CongestionAggregator:
    """
    M4 (optimisation half) — aggregates per-road density snapshots and
    computes smart signal phase extensions.

    Stores the latest CI for every road in an in-memory dict (no Redis).
    On each ingest() call:
      1. Updates in-memory state
      2. Recomputes phase optimisation
      3. Broadcasts the result to all connected React clients via WebSocket

    Phase optimisation rule:
      For each RED road whose CI > GREEN road CI * 1.40:
          time_extension_s = (CI_diff // 10) * 2
    """

    def __init__(self) -> None:
        # road_id → {"density_index": int, "vehicle_count": int, "signal_state": str}
        self._roads: dict[str, dict] = {}
        self._last_optimisation: dict = {}
        # Set by FastAPI startup so we can schedule coroutines from sync code
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Call from FastAPI lifespan startup to enable cross-thread broadcasting."""
        self._loop = loop

    # ── Public interface ───────────────────────────────────────────────────

    def ingest(self, road_id: str, density_index: int, vehicle_count: int) -> None:
        state = self._roads.setdefault(
            road_id, {"signal_state": "GREEN", "density_index": 0, "vehicle_count": 0}
        )
        state["density_index"] = density_index
        state["vehicle_count"] = vehicle_count

        result = self.compute_phase_optimisation()
        self._schedule_broadcast(result)

    def set_signal_state(self, road_id: str, state: str) -> None:
        self._roads.setdefault(
            road_id, {"signal_state": "GREEN", "density_index": 0, "vehicle_count": 0}
        )["signal_state"] = state

    def compute_phase_optimisation(self) -> dict:
        green_entries = [
            (rid, d) for rid, d in self._roads.items()
            if d.get("signal_state") == "GREEN"
        ]
        red_entries = [
            (rid, d) for rid, d in self._roads.items()
            if d.get("signal_state") == "RED"
        ]

        if not green_entries:
            result = {
                "green_road":      None,
                "green_ci":        0,
                "recommendations": [],
                "computed_at":     datetime.now(timezone.utc).isoformat(),
            }
            self._last_optimisation = result
            return result

        # If multiple green roads exist, pick the one with lowest CI (least congested)
        green_road, green_data = min(green_entries, key=lambda x: x[1]["density_index"])
        green_ci = green_data["density_index"]

        recommendations = []
        for rid, data in red_entries:
            red_ci = data["density_index"]
            if red_ci > green_ci * _EXTENSION_THRESHOLD:
                ci_diff = red_ci - green_ci
                extension_s = (ci_diff // _EXTENSION_PER_CI) * _EXTENSION_RATE_S
                recommendations.append({
                    "road_id":         rid,
                    "density_index":   red_ci,
                    "time_extension_s": extension_s,
                })

        result = {
            "green_road":      green_road,
            "green_ci":        green_ci,
            "recommendations": recommendations,
            "computed_at":     datetime.now(timezone.utc).isoformat(),
        }
        self._last_optimisation = result
        return result

    async def broadcast(self, data: dict) -> None:
        await ws_manager.broadcast(data)

    def get_last_optimisation(self) -> dict:
        return self._last_optimisation

    # ── Private ────────────────────────────────────────────────────────────

    def _schedule_broadcast(self, data: dict) -> None:
        """
        Schedule broadcast safely from any calling context (sync or async).
        Uses run_coroutine_threadsafe when called from the video loop thread,
        create_task when already on the event loop.
        """
        coro = self.broadcast(data)
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            # Called from a non-async thread (e.g. video processor)
            if self._loop is not None and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(coro, self._loop)
            else:
                logger.debug("No event loop available — skipping WebSocket broadcast.")


# Module-level singleton — shared by video_processor and FastAPI routes
aggregator = CongestionAggregator()
