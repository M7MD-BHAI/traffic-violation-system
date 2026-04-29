# CLAUDE.md — AI-Driven Traffic Flow Optimization & Violation Detection System
> Final Year Project (FYP) | Status: 🟡 In Development

---

## One-Line Purpose
Real-time traffic violation detection (red light, helmet, speed) with ANPR, accident detection, congestion optimization, and a React dashboard — all running as a single unified pipeline.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Detection | YOLOv8n (ultralytics) | 8.x |
| Helmet Model | YOLOv8n (custom trained) | 8.x |
| ANPR Model | YOLOv8n (custom trained) | 8.x |
| Tracker | BoT-SORT (via ultralytics) | built-in |
| OCR | EasyOCR | latest |
| CV | OpenCV | 4.8+ |
| Backend | FastAPI | 0.110+ |
| ORM | SQLAlchemy | 2.0+ |
| DB | PostgreSQL / SQLite | 15 / 3 |
| Auth | JWT (python-jose) | 3.x |
| Async HTTP | httpx | 0.27+ |
| Frontend | React + Vite | 18.x |
| Styling | Tailwind CSS | 3.x |
| Charts | Recharts | 2.x |
| Runtime | Python | 3.10+ |
| Node | Node.js | 18+ |

---

## Module Inventory

| # | Module | Purpose | Status |
|---|---|---|---|
| M1 | Red Light Violation | Detect stop-line crossings during RED signal | ✅ Done |
| M2 | Helmet Violation | Detect bare-head riders via head-zone ROI + voting | ✅ Done |
| M3 | Speed Estimation | Measure speed via mini-box centroid + cache matrix | ✅ Done |
| M4 | Congestion Manager | Calculate road density index + smart signal timing | ✅ Done |
| M5 | Vehicle Counter | Count and classify vehicles crossing stop-line | ✅ Done |
| M6 | Accident Detector | Detect crashes via IoU overlap + stagnation heuristic | ⬜ Pending |
| M7 | ANPR Service | Triggered plate detection + EasyOCR (idle until violation) | ✅ Done |
| M8 | Auth | JWT login, user roles, protected routes | ✅ Done |
| M9 | Dashboard | React analytics UI with live WebSocket updates | 🟡 In Progress |

---

## File Structure

```
traffic-violation-system/
├── backend/
│   └── app/
│       ├── main.py                      # FastAPI entry, mounts all routers
│       ├── config.py                    # Settings from .env
│       ├── detection/
│       │   ├── video_processor.py       # Main 30 FPS loop
│       │   ├── yolo_loader.py           # Singleton shared model
│       │   ├── violations/
│       │   │   ├── red_light.py         # M1
│       │   │   ├── helmet.py            # M2
│       │   │   └── speeding.py          # M3
│       │   ├── optimization/
│       │   │   ├── congestion.py        # M4 — density service
│       │   │   ├── signal_control.py    # M4 — aggregator + optimizer
│       │   │   └── accident.py          # M6
│       │   ├── tracking/
│       │   │   ├── vehicle_tracker.py   # BoT-SORT wrapper
│       │   │   └── vehicle_history.py   # Speed map, track state
│       │   └── anpr/
│       │       └── plate_reader.py      # M7 — triggered ANPR
│       ├── routes/
│       │   ├── auth.py
│       │   ├── violations.py
│       │   ├── vehicles.py
│       │   ├── signals.py
│       │   ├── accidents.py
│       │   ├── anpr.py
│       │   └── optimization.py
│       ├── schemas/
│       │   ├── violation.py
│       │   ├── vehicle.py
│       │   ├── signal.py
│       │   ├── accident.py
│       │   └── anpr.py
│       ├── crud/
│       │   ├── violations.py
│       │   ├── vehicles.py
│       │   ├── signals.py
│       │   ├── accidents.py
│       │   └── anpr.py
│       ├── database/
│       │   ├── connection.py
│       │   └── models.py
│       ├── utils/
│       │   ├── geometry.py
│       │   ├── line_selector.py
│       │   ├── logger.py
│       │   └── validators.py
│       └── static/
│           ├── violations/
│           └── accidents/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Navbar.jsx
│       │   ├── ViolationCard.jsx
│       │   └── SignalControl.jsx
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── Violations.jsx
│       │   ├── LiveFeed.jsx
│       │   ├── Accidents.jsx
│       │   ├── Optimization.jsx
│       │   ├── ANPR.jsx
│       │   ├── Settings.jsx
│       │   └── Login.jsx
│       ├── services/
│       │   └── api.js
│       ├── App.jsx
│       └── index.js
├── data/
│   └── test_videos/
├── notebooks/
│   └── model_training.ipynb
├── .env
├── .gitignore
├── README.md
├── docker-compose.yml
└── calibration_config.json
```

---

## Naming Conventions

| Context | Convention | Example |
|---|---|---|
| Python files | snake_case | `red_light.py` |
| Python classes | PascalCase | `ViolationManager` |
| Python functions | snake_case | `process_frame()` |
| React components | PascalCase | `ViolationCard.jsx` |
| React hooks | camelCase + use | `useWebSocket()` |
| DB tables | snake_case plural | `violations`, `vehicles` |
| DB columns | snake_case | `track_id`, `created_at` |
| Env vars | SCREAMING_SNAKE | `DATABASE_URL` |
| Git commits | type(scope): msg | `feat(anpr): add plate fallback` |
| API routes | kebab-case | `/violations/red-light` |

---

## Absolute Code Rules

1. Every Python function must have type hints on all parameters and return value
2. Every module must handle its own exceptions — never let raw exceptions bubble to FastAPI
3. All DB operations go through CRUD layer — routes never touch models directly
4. YOLO model loaded ONCE in `yolo_loader.py` — never import YOLO elsewhere
5. ANPR runs only in a `ThreadPoolExecutor` — never block the main loop
6. All timestamps stored and returned as ISO 8601 UTC strings
7. No hardcoded paths — all paths come from `config.py` which reads `.env`
8. Every route file has a corresponding schema file — no raw dicts in responses
9. React components never call the API directly — all calls go through `services/api.js`
10. Git: one feature = one commit. Never commit broken code to main.

---

## Environment Variables

```
DATABASE_URL
SECRET_KEY
ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES
YOLO_PRIMARY_MODEL_PATH
YOLO_HELMET_MODEL_PATH
YOLO_PLATE_MODEL_PATH
STATIC_FILES_DIR
VIDEO_SOURCE
SPEED_LIMIT_KMH
ANPR_CONFIDENCE_THRESHOLD
BACKEND_URL
CORS_ORIGINS
```

---

## Key Data Models

| Entity | Key Fields |
|---|---|
| User | id, username, password_hash, role, created_at |
| Violation | id, track_id, type, timestamp, image_path, plate_text, confidence, speed_kmh |
| Vehicle | id, track_id, class_name, first_seen, last_seen |
| Accident | id, track_ids, alert_type, timestamp, clip_path, road_id |
| PlateResult | id, violation_id, plate_text, confidence, status, timestamp |
| CongestionSnapshot | id, road_id, density_index, vehicle_count, timestamp |

---

## Inter-Module Dependency Map

```
video_processor  ──▶  yolo_loader          (shared model)
video_processor  ──▶  vehicle_tracker      (track_ids)
video_processor  ──▶  vehicle_history      (speed_map)

red_light   ──▶  vehicle_tracker, vehicle_history, ANPR (on violation)
helmet      ──▶  vehicle_tracker, red_light (merges records), ANPR
speeding    ──▶  vehicle_tracker, vehicle_history, ANPR

congestion  ──▶  vehicle_tracker, vehicle_history
accident    ──▶  vehicle_tracker, vehicle_history, speeding

ANPR        ──▶  (none — triggered only, accepts frame + bbox)
counter     ──▶  vehicle_tracker

All modules ──▶  FastAPI routes ──▶ CRUD ──▶ DB
FastAPI     ──▶  WebSocket ──▶ React frontend
```

---

## Docs Reference

- @docs/modules/red-light.md
- @docs/modules/helmet.md
- @docs/modules/speed.md
- @docs/modules/congestion.md
- @docs/modules/counter.md
- @docs/modules/accident.md
- @docs/modules/anpr.md
- @docs/modules/auth.md
- @docs/schema.md
- @docs/api.md
- @docs/architecture.md

---

## Progress

| Module | Status |
|---|---|
| M1 — Red Light | ✅ Done |
| M2 — Helmet | ✅ Done |
| M3 — Speed | ✅ Done |
| M4 — Congestion | ✅ Done |
| M5 — Counter | ✅ Done |
| M6 — Accident | ⬜ Pending |
| M7 — ANPR | ✅ Done |
| M8 — Auth | ✅ Done |
| M9 — Frontend | 🟡 In Progress |

---

## Backend Infrastructure (Completed)

| File | Status |
|---|---|
| `database/models.py` — all 7 SQLAlchemy 2.0 models | ✅ Done |
| `database/connection.py` — engine, SessionLocal, get_db | ✅ Done |
| `config.py` — Pydantic BaseSettings, all env vars | ✅ Done |
| `main.py` — FastAPI app, CORS, lifespan, all routers mounted | ✅ Done |
| `detection/yolo_loader.py` — 3 singleton YOLO models | ✅ Done |
| `detection/tracking/vehicle_tracker.py` — BoT-SORT wrapper | ✅ Done |
| `detection/tracking/vehicle_history.py` — shared speed_map + y_prev | ✅ Done |
| `utils/geometry.py` — centroid, IoU, point_in_polygon, line_crossing | ✅ Done |

## Schemas (Completed)

| File | Status |
|---|---|
| `schemas/auth.py` — LoginRequest, RegisterRequest, TokenOut, UserOut | ✅ Done |
| `schemas/violation.py` — ViolationCreate, ViolationOut | ✅ Done |
| `schemas/anpr.py` — PlateResultOut | ✅ Done |
| `schemas/vehicle.py` — VehicleOut, CountingReportCreate, CountingReportOut | ✅ Done |
| `schemas/accident.py` — AccidentAlert, AccidentOut | ✅ Done |
| `schemas/signal.py` — CongestionUpdate, SignalStateUpdate, OptimisationResult | ✅ Done |

## CRUD (Completed)

| File | Status |
|---|---|
| `crud/users.py` — get_by_username, get_by_id, create_user, verify_password | ✅ Done |
| `crud/violations.py` — insert, get, list (filtered), update_plate, delete | ✅ Done |
| `crud/anpr.py` — save_plate_result, get_plate_by_track, search_by_plate_text | ✅ Done |
| `crud/vehicles.py` — get_vehicles, save_counting_report, get_latest_counts | ✅ Done |
| `crud/accidents.py` — save_alert, get_alerts, resolve_alert | ✅ Done |
| `crud/signals.py` — save_congestion_snapshot, get_congestion_history | ✅ Done |

## Routes (Completed)

| File | Status |
|---|---|
| `routes/auth.py` — POST /auth/login\|register, GET /auth/me | ✅ Done |
| `routes/violations.py` — POST/GET/DELETE violations | ✅ Done |
| `routes/anpr.py` — GET /anpr/{track_id}, /anpr/search | ✅ Done |
| `routes/vehicles.py` — GET /vehicles, /analytics/counting | ✅ Done |
| `routes/accidents.py` — POST/GET /alerts/accident, PATCH resolve | ✅ Done |
| `routes/signals.py` — POST/GET /congestion endpoints | ✅ Done |
| `routes/optimization.py` — WS /congestion/ws | ✅ Done |

## Frontend (In Progress)

| File | Status |
|---|---|
| `services/api.js` — Axios instance, JWT interceptor, all API functions | ✅ Done |
| `pages/Login.jsx` — Tailwind login form, token storage, redirect | ✅ Done |
| `pages/Dashboard.jsx` | ⬜ Pending |
| `pages/Violations.jsx` | ⬜ Pending |
| `pages/LiveFeed.jsx` | ⬜ Pending |
| `pages/Accidents.jsx` | ⬜ Pending |
| `pages/Optimization.jsx` | ⬜ Pending |
| `pages/ANPR.jsx` | ⬜ Pending |
| `pages/Settings.jsx` | ⬜ Pending |
| `components/Navbar.jsx` | ⬜ Pending |
| `components/ViolationCard.jsx` | ⬜ Pending |
| `components/SignalControl.jsx` | ⬜ Pending |
| `App.jsx` — Router + protected routes | ⬜ Pending |
| `index.js` — React entry point | ⬜ Pending |



## YOLO Model Architecture

This system uses THREE YOLO models with clearly separated responsibilities.  
All custom models are **already trained and ready for use**.

---

### 1. YOLOv8n — Vehicle Detection & Tracking (Primary Model)

- Model: YOLOv8n (nano)
- Weights: `yolov8n.pt` (auto-downloaded)
- Training: ❌ Not required
- Dataset: COCO (pre-trained)

#### Purpose
Detect all vehicles in every frame and provide bounding boxes for:
- cars
- motorcycles
- buses
- trucks

Also works with **BoT-SORT tracker** to assign a unique `track_id` to each vehicle.

#### Responsibility
- Runs on EVERY frame (~30 FPS)
- Feeds all downstream modules
- Acts as the **main detection backbone**

---

### 2. YOLOv8n — Helmet Detection Model

- Model: YOLOv8n (nano)
- Weights: `best.pt` ✅ (already trained)
- Training: ❌ Not required (pre-trained by developer)
- Classes: `helmet`, `bare_head`

#### Purpose
Determine whether a rider is wearing a helmet.

#### How it works
- Takes **ROI (Region of Interest)** from primary detection
- Specifically:
  → top 25% of motorcycle bounding box (head zone)
- Runs classification on that cropped region

#### Trigger Condition
- Only runs when a **motorcycle/bike** is detected

#### Note
This model has been **custom trained by the developer using Google Colab** and is production-ready.

---

### 3. YOLOv8n — ANPR License Plate Detection

- Model: YOLOv8n (nano)
- Weights: `last.pt` ✅ (already trained)
- Training: ❌ Not required (pre-trained by developer)
- Classes: `license_plate`

#### Purpose
Detect license plate region for OCR processing.

#### How it works
- Runs on cropped vehicle image
- Outputs bounding box around plate
- Then **EasyOCR** extracts text

#### Trigger Condition
- Runs ONLY when a violation is detected
  (red light, helmet, speeding, etc.)

#### Note
This model has been **custom trained by the developer using Google Colab** and is ready for inference.

---

## Execution Pipeline

1. **YOLOv8n (Primary Model)** runs on every frame
2. BoT-SORT assigns `track_id`
3. Modules process detections:
   - Helmet Module → uses `best.pt`
   - Speed Module → uses tracking data
   - Red Light Module → uses geometry + tracking
4. If violation detected:
   → Trigger ANPR Model (`last.pt`)
   → Run EasyOCR on detected plate
5. Store results in database

---

## Model Loading Rules

- All models must be loaded ONLY in `yolo_loader.py`
- Models must be implemented as **singletons**
- No module should directly initialize YOLO models
- Model paths must come from environment variables:
  - `YOLO_PRIMARY_MODEL_PATH`
  - `YOLO_HELMET_MODEL_PATH`
  - `YOLO_PLATE_MODEL_PATH`



  ## Integration Note

If implementing any module requires changes in other modules, those changes must be:
- minimal and strictly necessary
- backward compatible
- limited to only affected logic

All cross-module changes must be clearly documented during implementation. You have complete access to each and every folder and file do changes where required.