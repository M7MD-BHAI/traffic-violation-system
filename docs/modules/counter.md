# Module: Vehicle Counting & Classification (M5)

> Counts unique vehicles crossing the stop-line and classifies them by type, reporting totals to the backend every 60 seconds.

---

## Dependencies
- `detection/yolo_loader.py` — shared YOLO model + tracker
- `calibration_config.json` — stop-line Y coordinate
- `crud/vehicles.py` — DB persistence
- FastAPI `/analytics/counting` endpoint

---

## Public Interface

```python
class TrafficCounter:
    def __init__(self, config_path: str, model, backend_url: str) -> None
    def process_frame(self, frame: np.ndarray, frame_idx: int) -> None
```

---

## Features & Requirements

- Count unique track_ids only — never count the same vehicle twice
- Crossing: y_bc transitions from above line_y to at/below line_y
- Class groupings:
  - Small: bicycle, motorcycle
  - Medium: car, van, rickshaw
  - Heavy: bus, truck
- Maintain two counters: `total_counts` (never reset) and `interval_counts` (reset every 60s)
- POST to `/analytics/counting` every 60 seconds using asyncio
- Reset interval_counts after successful POST
- Include grouped totals: `{ "small": N, "medium": N, "heavy": N }`

---

## API Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/analytics/counting` | CountingReport | ok |
| GET | `/analytics/counting` | — | CountingReport |

---

## Acceptance Criteria

- [ ] Same track_id never counted twice
- [ ] Classification correctly maps YOLO class IDs to groups
- [ ] Interval counter resets after each successful POST
- [ ] asyncio POST does not pause video processing loop
- [ ] Total count never decreases
