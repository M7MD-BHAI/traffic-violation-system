# Module: Helmet Violation Detection (M2)

> Detects helmetless motorcycle riders using a hierarchical head-zone ROI approach with temporal voting to prevent false alarms.

---

## Dependencies
- `detection/yolo_loader.py` — primary YOLO model (motorcycle detection)
- `YOLO_HELMET_MODEL_PATH` — secondary custom-trained helmet/bare_head model
- `detection/tracking/vehicle_tracker.py` — shared track_id
- `detection/violations/red_light.py` — merges records if same vehicle already flagged
- `detection/anpr/plate_reader.py` — triggered on confirmed violation
- `crud/violations.py` — DB persistence

---

## Public Interface

```python
class HelmetViolationDetector:
    def __init__(self, primary_model, helmet_model_path: str, config_path: str) -> None
    def register_existing_violations(self, violations: dict[int, dict]) -> None
    def process_frame(self, frame: np.ndarray, frame_idx: int) -> list[dict]
    def get_moto_crop_for_anpr(self, frame: np.ndarray, violation: dict) -> np.ndarray
    def build_api_payload(violation: dict, frame_path: str) -> dict
```

---

## Features & Requirements

- Hierarchical ROI — never do global helmet search on full frame
- Primary pass: detect motorcycles using main YOLO model
- Head-Zone ROI: top 25% of each motorcycle bounding box
  - Formula: `Head_ROI = frame[y1 : y1 + (height // 4), x1 : x2]`
- Secondary pass: run helmet model on Head-Zone crop only
- Two classes from helmet model: `With Helmet` (0), `Without Helmet` (1)
- Temporal voting: maintain deque of last 15 frames per track_id
- Violation confirmed only if bare_head detected in ≥ 70% of window
- Triple-ride logic: count multiple bare_head detections per ROI (passengers)
- Same track_id as red-light module — if already flagged, append not duplicate
- Composite snapshot: full motorcycle + zoomed head crop side by side
- Pass full motorcycle bbox to ANPR on confirmed violation

---

## Business Logic

```
Frame arrives →
  1. Detect motorcycles via primary YOLO
  2. For each motorcycle (track_id, bbox):
       head_y2 = y1 + (height // 4)
       head_roi = frame[y1:head_y2, x1:x2]
       run helmet_model on head_roi
       bare_count = count detections with class "Without Helmet"
       vote_buffer[track_id].append(bare_count > 0)

       if len(buffer) == 15:
           ratio = sum(buffer) / 15
           if ratio >= 0.70 and track_id not in confirmed:
               → confirmed violation
               → build composite image
               → check if track_id in rl_violations → merge or new record
               → trigger ANPR async
               → POST to /violations/helmet
```

---

## Data Models Owned

```python
{
    "track_id":         int,
    "violation_type":   "HELMET",
    "confidence_score": float,
    "timestamp":        str,
    "frame_idx":        int,
    "image_path":       str,
    "bare_head_count":  int,
    "merged_with_rl":   bool
}
```

## API Payload

```json
{
  "track_id": 102,
  "violation_type": "HELMET",
  "confidence_score": 0.94,
  "timestamp": "2026-04-23T17:00:00Z",
  "frame_path": "/storage/violations/h_102.jpg"
}
```

---

## API Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/violations/helmet` | ViolationCreate | ViolationOut |
| GET | `/violations?type=HELMET` | — | list[ViolationOut] |

---

## Error Cases

- Helmet model file not found → raise RuntimeError with clear path message
- Head-zone crop is empty (very small bbox) → append False to buffer, skip inference
- Secondary model returns no boxes → treat as "helmet present" (safer default)
- Merged violation fails DB update → log error, create new record as fallback

---

## Acceptance Criteria

- [ ] Head-zone ROI is always exactly top 25% of motorcycle bbox
- [ ] Single bare_head detection does not trigger violation alone
- [ ] 11+ bare_head detections out of 15 frames triggers violation
- [ ] Two passengers without helmets both detected in single ROI
- [ ] Vehicle already in RL violations table gets helmet appended, not duplicated
- [ ] Composite image saved: full motorcycle left, head crop right
- [ ] ANPR receives full motorcycle bbox (not head crop)
