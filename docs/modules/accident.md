# Module: Accident Detection (M6)

> Detects potential accidents using kinematic anomaly — sudden velocity drop and bounding box overlap — and fires high-priority emergency alerts.

---

## Dependencies
- `detection/tracking/vehicle_tracker.py` — track_ids + bboxes
- `detection/tracking/vehicle_history.py` — speed_map
- `calibration_config.json` — signal_roi and stop_line (exclusion zones)
- `utils/geometry.py` — IoU calculation
- `crud/accidents.py` — DB persistence
- FastAPI `/alerts/accident` endpoint

---

## Public Interface

```python
class AccidentDetector:
    def __init__(self, config_path: str, backend_url: str) -> None
    def process_frame(self, frame: np.ndarray, tracked: list, speed_map: dict) -> list[dict]
```

---

## Features & Requirements

### Stagnation Heuristic
- Vehicle had speed > 20 km/h, now speed < 2 km/h for > 10 seconds
- Must NOT be inside signal_roi or within 40px of stop_line
- Triggers single-vehicle stagnation alert

### Crash IoU Heuristic
- Two vehicle bboxes overlap with IoU > 0.4
- Both vehicles speed < 2 km/h for > 5 seconds after overlap
- Triggers crash alert with both track_ids

### Alert Protocol
- Save 3-second rolling frame buffer (90 frames at 30fps)
- Include frame buffer in alert payload as video clip
- POST high-priority alert to `/alerts/accident`
- Include road_id in payload

---

## Data Models Owned

```python
{
    "alert_type":  "STAGNATION" | "CRASH",
    "track_ids":   list[int],
    "timestamp":   str,
    "road_id":     str,
    "bbox":        [x1, y1, x2, y2],
    "clip_path":   str
}
```

---

## API Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/alerts/accident` | AccidentAlert | ok |
| GET | `/alerts/accident` | — | list[AccidentAlert] |

---

## Acceptance Criteria

- [ ] No alert fires for stopped vehicle at red light (exclusion zone works)
- [ ] Stagnation alert fires only after 10 continuous seconds below 2 km/h
- [ ] Crash alert requires BOTH IoU > 0.4 AND both vehicles still for 5s
- [ ] 3-second video clip saved with alert
- [ ] Same pair of track_ids does not trigger repeated alerts
