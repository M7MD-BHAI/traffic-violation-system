# Module: ANPR — Automatic Number Plate Recognition (M7)

> Triggered-only service that detects and reads license plates on violating vehicles. Remains completely idle until called by a violation module.

---

## Dependencies
- `YOLO_PLATE_MODEL_PATH` — custom trained YOLOv8n plate detector
- EasyOCR — alphanumeric OCR
- `concurrent.futures.ThreadPoolExecutor` — non-blocking execution
- `crud/anpr.py` — DB persistence
- Called by: M1 (red light), M2 (helmet), M3 (speed)

---

## Public Interface

```python
class ANPR_Service:
    def __init__(self, plate_model_path: str, ocr_languages: list, max_workers: int) -> None
    def trigger(self, frame: np.ndarray, bbox: list, track_id: int, callback=None) -> Future
    async def process_async(self, frame: np.ndarray, bbox: list, track_id: int) -> dict
    def get_cached(self, track_id: int) -> dict | None
    def shutdown(self) -> None
```

---

## Features & Requirements

- Idle until called — zero CPU usage between violations
- Accepts: full frame + vehicle bbox [x1,y1,x2,y2] + track_id
- Step 1: Crop vehicle from frame using bbox
- Step 2: Run plate YOLO model on vehicle crop → find plate bbox
- Step 3: Upscale plate crop 2× + Otsu threshold for OCR
- Step 4: EasyOCR with allowlist = `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`
- Step 5: Return plate_text + confidence_score
- All OCR runs in ThreadPoolExecutor — never blocks 30 FPS loop
- Result cached by track_id for lookup
- **Plate not visible fallback:**
  - If confidence < 0.40 OR no plate detected → status: `"plate_not_visible"`
  - Response includes: `"message": "Plate unreadable. Monitor next camera on [road_id]."`
- Save result to PostgreSQL violations table

---

## Data Models Owned

```python
{
    "track_id":         int,
    "plate_text":       str | None,
    "confidence_score": float,
    "timestamp":        str,
    "status":           "ok" | "plate_not_visible" | "no_plate_found" | "ocr_failed",
    "message":          str | None    # populated on plate_not_visible
}
```

---

## API Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/anpr/{track_id}` | — | PlateResult |
| GET | `/anpr/search?plate=ABC123` | — | list[PlateResult + violation history] |

---

## Error Cases

- Plate model not found → log warning, use bottom-third fallback crop
- Vehicle crop is empty → return `status: "empty_crop"`
- EasyOCR throws → return `status: "ocr_failed"`, confidence 0.0
- confidence < 0.40 → return `status: "plate_not_visible"` with next-camera message

---

## Acceptance Criteria

- [ ] ANPR does not run at all unless triggered by a violation module
- [ ] ThreadPoolExecutor confirmed non-blocking (main loop FPS unchanged)
- [ ] Plate text returned in under 2 seconds for typical vehicle crop
- [ ] `plate_not_visible` status returned when confidence < 0.40
- [ ] Next-camera message included in plate_not_visible response
- [ ] Results cached — same track_id not re-processed
- [ ] Plate result linked to violation record in DB
