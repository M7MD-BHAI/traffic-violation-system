# Module: Congestion Manager & Smart Signal Optimizer (M4)

> Calculates a real-time Congestion Index per road and broadcasts smart signal timing extensions to the React frontend via WebSocket.

---

## Dependencies
- `detection/tracking/vehicle_tracker.py` — track_ids in lane polygon
- `detection/tracking/vehicle_history.py` — speed_map (smoothed speeds)
- FastAPI WebSocket hub — broadcasts to React
- `crud/signals.py` — DB snapshots

---

## Public Interface

```python
class RoadDensityService:
    def __init__(self, road_id: str, lane_polygon: list, backend_url: str) -> None
    def update(self, tracked_boxes: list, speed_map: dict) -> dict

class CongestionAggregator:
    def ingest(self, road_id: str, density_index: int, vehicle_count: int) -> None
    def set_signal_state(self, road_id: str, state: str) -> None
    def compute_phase_optimisation(self) -> dict
    async def broadcast(self, data: dict) -> None
```

---

## Features & Requirements

- Congestion Index formula: `CI = min(100, occupancy * 3 + stagnant * 2)`
- Occupancy: track_ids with centroid inside lane polygon
- Stagnation: vehicles with smoothed_speed < 5 km/h inside polygon
- Report CI to FastAPI every 10 seconds (async, non-blocking)
- Payload: `{ "road_id": "North_Street", "density_index": 78, "vehicle_count": 22 }`
- Aggregator stores latest CI for all 4 roads in-memory dict
- Phase optimization: if red-road CI > green-road CI × 1.40 → extend green time
- Time extension: +2 seconds per 10 CI points of difference
- Broadcast result via WebSocket to React every time new data arrives

---

## API Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/congestion/update` | CongestionUpdate | optimisation dict |
| POST | `/congestion/signal-state` | SignalStateUpdate | ok |
| GET | `/congestion/status` | — | current optimisation |
| WS | `/congestion/ws` | — | live broadcast stream |

---

## Acceptance Criteria

- [ ] CI correctly increases when vehicles stagnate in lane polygon
- [ ] Report fires every 10 seconds without blocking video loop
- [ ] Time extension calculated correctly for 40%+ density difference
- [ ] WebSocket pushes update to all connected React clients on each ingest
- [ ] Disconnected WS clients cleaned up without crash
