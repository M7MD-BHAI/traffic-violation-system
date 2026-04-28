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
| M1 | Red Light Violation | Detect stop-line crossings during RED signal | ⬜ Pending |
| M2 | Helmet Violation | Detect bare-head riders via head-zone ROI + voting | ⬜ Pending |
| M3 | Speed Estimation | Measure speed via mini-box centroid + cache matrix | ⬜ Pending |
| M4 | Congestion Manager | Calculate road density index + smart signal timing | ⬜ Pending |
| M5 | Vehicle Counter | Count and classify vehicles crossing stop-line | ⬜ Pending |
| M6 | Accident Detector | Detect crashes via IoU overlap + stagnation heuristic | ⬜ Pending |
| M7 | ANPR Service | Triggered plate detection + EasyOCR (idle until violation) | ⬜ Pending |
| M8 | Auth | JWT login, user roles, protected routes | ⬜ Pending |
| M9 | Dashboard | React analytics UI with live WebSocket updates | ⬜ Pending |

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
| M1 — Red Light | ⬜ Pending |
| M2 — Helmet | ⬜ Pending |
| M3 — Speed | ⬜ Pending |
| M4 — Congestion | ⬜ Pending |
| M5 — Counter | ⬜ Pending |
| M6 — Accident | ⬜ Pending |
| M7 — ANPR | ⬜ Pending |
| M8 — Auth | ⬜ Pending |
| M9 — Frontend | ⬜ Pending |
