# Module: Hybrid Speed Estimation (M3)

> Estimates vehicle speed using a mini-box centroid between two virtual trap lines, with async violation reporting to maintain 30 FPS.

---

## Dependencies
- `detection/yolo_loader.py` — shared YOLO model
- `detection/tracking/vehicle_tracker.py` — track_ids
- `detection/tracking/vehicle_history.py` — speed_map updates
- `detection/anpr/plate_reader.py` — triggered on speed violation
- `crud/violations.py` — DB persistence
- `calibration_config.json` — speed_line_a_y, speed_line_b_y, meters_per_pixel

---

## Public Interface

```python
class HybridSpeedService:
    def __init__(self, config_path: str, model, backend_url: str, speed_limit_kmh: float) -> None
    def process_frame(self, frame: np.ndarray, frame_idx: int) -> list[dict]
    def draw_speed_lines(self, frame: np.ndarray) -> np.ndarray
```

---

## Features & Requirements

- Mini-box centroid: 20×20 pixel virtual hit-box around bbox centre — eliminates bounding-box expansion error
- All line-crossing math uses centroid, never full bbox edges
- Two virtual trap lines from config: `speed_line_a_y` (entry), `speed_line_b_y` (exit)
- Cache matrix: `{ track_id: entry_timestamp }` — dict keyed by track_id
- Entry: centroid crosses line_a → record `time.time()` in cache_matrix
- Exit: centroid crosses line_b → compute Δt, calculate speed
- Stripe logic: intersection if `line_y - 5 < centroid_y < line_y + 5` (handles FPS drops)
- Speed formula: `speed_kmh = (trap_distance_m / delta_t) * 3.6`
- Draw speed label above vehicle bbox on frame
- Flag violation if speed > speed_limit_kmh
- Async hand-off to ANPR + FastAPI — never blocks main loop
- Update shared speed_map with latest reading per track_id

---

## Business Logic

```
Frame arrives →
  1. Run YOLO tracking
  2. For each vehicle (track_id, bbox):
       cx = (x1 + x2) / 2
       cy = (y1 + y2) / 2    ← true centre
       mini_box = (cx±10, cy±10)

       if |cy - line_a_y| <= 5 and track_id not in cache_matrix:
           cache_matrix[track_id] = time.time()

       elif |cy - line_b_y| <= 5 and track_id in cache_matrix:
           delta_t = time.time() - cache_matrix.pop(track_id)
           speed_kmh = (trap_distance_m / delta_t) * 3.6
           speed_map[track_id] = speed_kmh
           draw label on frame

           if speed_kmh > limit and track_id not in violation_ids:
               → record violation
               → async ANPR + FastAPI POST
```

---

## Config Keys Required

```json
{
  "speed_line_a_y": 150,
  "speed_line_b_y": 300,
  "meters_per_pixel": 0.05
}
```

---

## Data Models Owned

```python
{
    "track_id":       int,
    "violation_type": "SPEED",
    "speed_kmh":      float,
    "speed_limit":    float,
    "timestamp":      str,
    "frame_idx":      int,
    "bbox":           [x1, y1, x2, y2],
    "image_path":     str
}
```

---

## API Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/violations/speed` | ViolationCreate | ViolationOut |
| GET | `/violations?type=SPEED` | — | list[ViolationOut] |

---

## Error Cases

- delta_t == 0 → skip calculation, remove from cache_matrix
- Vehicle leaves frame before crossing line_b → cache_matrix entry expires after 30s
- meters_per_pixel missing from config → raise KeyError with setup instructions
- Async POST fails → log warning, violation still saved locally

---

## Acceptance Criteria

- [ ] Mini-box centroid used for all crossing math, never raw bbox edges
- [ ] Entry timestamp recorded exactly once per track_id per crossing
- [ ] Speed calculated only when exit line crossed after entry
- [ ] Speed label drawn above vehicle on every frame after first measurement
- [ ] Violation fires only once per track_id crossing
- [ ] Main loop FPS not affected by ANPR/POST calls (async confirmed)
- [ ] speed_map updated so congestion module can read smoothed speed
