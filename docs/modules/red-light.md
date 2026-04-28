# Module: Red Light Violation Detection (M1)

> Detects vehicles crossing a virtual stop-line during a RED signal using position-based intensity logic and directional vector math.

---

## Dependencies
- `detection/yolo_loader.py` — shared YOLO model instance
- `detection/tracking/vehicle_tracker.py` — track_id assignment
- `detection/tracking/vehicle_history.py` — y_prev per track_id
- `detection/anpr/plate_reader.py` — triggered on violation
- `utils/geometry.py` — line crossing math
- `crud/violations.py` — DB persistence
- `calibration_config.json` — stop-line coords, signal ROI, resolution

---

## Public Interface

```python
class CalibrationTool:
    def run(self, video_source: str) -> None
    def save_config(self, path: str) -> dict

class SignalStateDetector:
    def __init__(self, signal_roi: list) -> None
    def detect(self, frame: np.ndarray) -> str  # "RED" | "GREEN" | "YELLOW"

class ViolationManager:
    def __init__(self, config_path: str, model) -> None
    def process_frame(self, frame: np.ndarray, frame_idx: int) -> list[dict]
    def build_violation_record(violation: dict, plate_text: str) -> dict
```

---

## Features & Requirements

- Pre-run calibration phase: user clicks 2 points for stop-line, 2 points for signal ROI on first frame
- Calibration saves `config.json` with keys: `violation_line`, `signal_roi`, `resolution`
- Signal detection must use V-channel (HSV) intensity — NOT colour masking
- Signal ROI divided into 3 vertical segments: H_top, H_mid, H_bot
- State: top brightest = RED, bottom brightest = GREEN, else YELLOW
- Tracking uses BoT-SORT track_id, bottom-centre centroid (x_bc, y_bc = y2)
- Violation triggers only when: signal=RED, y_prev < line_y, y_curr >= line_y, v > 0
- Directional guard v = y_curr - y_prev must be positive (blocks reverse false positives)
- Each violation: capture vehicle bbox crop, track_id, timestamp
- Hook ANPR service with cropped image on violation
- Store as Violation Candidate in DB

---

## Business Logic

```
Frame arrives →
  1. Resize to calibrated resolution
  2. Detect signal state (V-channel intensity on signal_roi)
  3. Run YOLO tracking → get boxes + track_ids
  4. For each vehicle:
       y_bc = y2 (bottom centre)
       if track_id in prev_y:
           v = y_bc - prev_y[track_id]
           if signal==RED and prev_y < line_y and y_bc >= line_y and v > 0:
               → record violation
               → crop vehicle image
               → trigger ANPR async
               → save to DB
       prev_y[track_id] = y_bc
  5. Clean stale IDs not in current frame
```

---

## Data Models Owned

```python
violation = {
    "track_id":     int,
    "violation_type": "RED_LIGHT",
    "timestamp":    str,     # ISO 8601 UTC
    "frame_idx":    int,
    "signal_state": str,
    "bbox":         [x1, y1, x2, y2],
    "image_path":   str,
    "plate_text":   str | None,
    "confidence":   float | None
}
```

---

## API Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/violations/red-light` | ViolationCreate | ViolationOut |
| GET | `/violations?type=RED_LIGHT` | — | list[ViolationOut] |

---

## Error Cases

- `config.json` missing → raise `FileNotFoundError` with message "Run calibration first"
- Signal ROI crop is empty → return "UNKNOWN", skip frame
- No tracked boxes in frame → return empty list, no crash
- ANPR timeout → log warning, store violation without plate_text

---

## Acceptance Criteria

- [ ] Calibration tool opens first frame, accepts 4 mouse clicks, saves valid config.json
- [ ] Signal correctly identifies RED when top segment is brightest
- [ ] No violation fires when signal is GREEN or YELLOW
- [ ] No violation fires for a vehicle moving in reverse (v < 0)
- [ ] Same track_id is never double-counted for the same crossing
- [ ] Violation record saved to DB within same frame cycle
- [ ] ANPR triggered asynchronously — does not block frame processing
