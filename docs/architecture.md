# Architecture Decisions & Constraints

---

## System Overview

Single-camera pipeline (extensible to multi-camera) that processes video frames through a shared YOLO inference pass, distributes results to detection modules, persists violations to PostgreSQL, and serves a React dashboard over FastAPI REST + WebSocket.

---

## Core Architectural Decisions

### 1. One YOLO inference per frame
**Decision:** All modules share one `yolo_loader.py` singleton. YOLO runs once per frame in `video_processor.py`. Results (boxes, track_ids, classes) distributed to all modules.
**Why:** Running YOLO separately per module would cost 5–6× compute. On CPU hardware this is the difference between 15 FPS and 2 FPS.

### 2. ANPR is triggered-only
**Decision:** `ANPR_Service` is completely idle between violations. It wakes only when called by M1/M2/M3.
**Why:** EasyOCR + plate YOLO is expensive (~300–500ms). Running every frame would kill performance. Violations are rare events — triggered inference is correct architecture.

### 3. Async for all I/O, sync for CV
**Decision:** All DB writes and HTTP POSTs use `asyncio` / `httpx`. All computer vision (YOLO, OpenCV, numpy) stays synchronous in the main processing loop.
**Why:** CV operations are CPU-bound and must not context-switch. I/O operations are network-bound and must not block the loop.

### 4. Temporal voting for helmet (not per-frame)
**Decision:** 15-frame window with 70% threshold before confirming helmet violation.
**Why:** Single-frame detection has high false positive rate from motion blur and occlusion. Temporal voting gives a reliable signal while staying within ~0.5 second detection latency.

### 5. Position-based signal detection
**Decision:** V-channel intensity comparison across 3 segments, not HSV colour masking.
**Why:** Colour masking fails under different lighting conditions (night, overcast, direct sun). Relative brightness of segments is invariant to overall lighting level.

### 6. Mini-box centroid for speed
**Decision:** 20×20 pixel hit-box at bbox centre for all speed math.
**Why:** YOLO bounding boxes expand as vehicles approach camera, creating false "acceleration". Fixed-size centroid box eliminates this perspective distortion.

### 7. config.json as ground truth for spatial data
**Decision:** All pixel coordinates (stop-line, signal ROI, speed lines, lane polygon) come from `calibration_config.json`. Never hardcoded.
**Why:** Coordinates change every time camera angle or position changes. External config allows recalibration without code changes.

---

## Performance Constraints

| Target | Value | Strategy |
|---|---|---|
| Processing FPS | 15–30 | YOLOv8n nano, 640×360 res, single inference pass |
| ANPR latency | < 2s | ThreadPoolExecutor, triggered only |
| DB write latency | non-blocking | asyncio + httpx |
| WebSocket update | every 10s | congestion aggregator interval |

---

## Data Flow

```
Video frame
    │
    ▼
video_processor.py (30 FPS loop)
    │
    ├─▶ yolo_loader (1 inference)
    │       └─▶ boxes, track_ids, classes, confidences
    │
    ├─▶ vehicle_tracker   → track_id assignment
    ├─▶ vehicle_history   → speed_map, y_prev map
    │
    ├─▶ [M1] red_light.py     → violation? → ANPR trigger (async)
    ├─▶ [M2] helmet.py        → violation? → ANPR trigger (async)
    ├─▶ [M3] speeding.py      → violation? → ANPR trigger (async)
    ├─▶ [M4] congestion.py    → density index → POST every 10s (async)
    ├─▶ [M5] counter.py       → crossing count → POST every 60s (async)
    └─▶ [M6] accident.py      → crash/stagnation? → POST alert (async)

ANPR_Service (ThreadPoolExecutor — idle unless triggered)
    └─▶ plate YOLO → EasyOCR → DB → violation record updated

FastAPI
    ├─▶ REST endpoints → CRUD → PostgreSQL
    └─▶ WebSocket → React Dashboard (live updates)
```

---

## Technology Constraints

- **No GPU on deployment machine** — all inference uses CPU. YOLOv8n nano is mandatory. Do not switch to larger models.
- **Pre-recorded video only for demo** — live webcam is supported in code but hardware may not sustain 30 FPS with live capture + inference simultaneously.
- **SQLite acceptable for FYP demo** — PostgreSQL is the production target. SQLAlchemy ORM abstracts the difference. Switch via `DATABASE_URL` env var.
- **No Redis** — congestion aggregator uses in-memory dict. Redis would be used in production multi-server deployment.
- **EasyOCR English only** — Pakistani plates use Latin alphabet. `allowlist` restricted to alphanumeric characters.

---

## Security Notes

- JWT tokens expire per `ACCESS_TOKEN_EXPIRE_MINUTES`
- Passwords stored as bcrypt hashes only
- CORS configured to accept only `CORS_ORIGINS` from env
- Static violation images served from `/static/` — not directly exposed to public
- `.env` file never committed to git (in `.gitignore`)
