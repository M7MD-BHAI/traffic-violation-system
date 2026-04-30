# AI-Driven Traffic Flow Optimization & Violation Detection System

> Final Year Project (FYP) — Real-time traffic violation detection with ANPR, congestion optimization, and a React dashboard.

---

## Screenshots

![Dashboard](docs/screenshots/dashboard.png)
![Live Feed](docs/screenshots/live_feed.png)
![Violations](docs/screenshots/violations.png)

---

## Features

| Module | Description |
|---|---|
| Red Light Detection | Detects vehicles crossing the stop-line during a RED signal using V-channel intensity + directional crossing math |
| Helmet Violation | Two-stage head-zone ROI approach with 15-frame temporal voting — prevents single-frame false positives |
| Speed Estimation | Mini-box centroid trap-line measurement; flags vehicles exceeding the configurable speed limit |
| Congestion Manager | Per-road Congestion Index (0–100) with smart signal phase extension broadcast over WebSocket |
| Vehicle Counter | Counts and classifies vehicles (small / medium / heavy) crossing the stop-line every 60 seconds |
| Accident Detection | Kinematic anomaly detection — crash IoU heuristic + stagnation duration with 3-second video clip |
| ANPR | Triggered-only license plate recognition (YOLOv8n + EasyOCR) — zero CPU usage between violations |

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
| Database | PostgreSQL / SQLite | 15 / 3 |
| Auth | JWT (python-jose) | 3.x |
| Async HTTP | httpx | 0.27+ |
| Frontend | React + Vite | 18.x |
| Styling | Tailwind CSS | 3.x |
| Charts | Recharts | 2.x |
| Runtime | Python | 3.10+ |
| Node | Node.js | 18+ |

---

## Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- Git
- (Optional) PostgreSQL 15 — SQLite is used by default for local development

---

## Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd traffic-violation-system
```

### 2. Backend setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure environment variables

Copy the example and fill in values:

```bash
cp .env.example .env
```

`.env` reference:

```env
# Database — leave as-is for SQLite demo, or set a PostgreSQL URL
DATABASE_URL=sqlite:///./traffic_fyp.db

# Auth
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Model paths (see "Model Files" section below)
YOLO_PRIMARY_MODEL_PATH=models/yolov8n.pt
YOLO_HELMET_MODEL_PATH=models/best.pt
YOLO_PLATE_MODEL_PATH=models/last.pt

# Paths
STATIC_FILES_DIR=backend/app/static
VIDEO_SOURCE=data/test_videos/test.mp4

# Detection config
SPEED_LIMIT_KMH=50.0
ANPR_CONFIDENCE_THRESHOLD=0.40

# Server
BACKEND_URL=http://localhost:8000
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### 4. Run calibration

Calibration draws the stop-line and signal ROI on the first frame of your video. Run it once per camera setup:

```bash
cd ..   # back to repo root
python -m backend.app.utils.line_selector --video data/test_videos/test.mp4
```

Click order:
1. Two clicks → stop-line endpoints (red)
2. Two clicks → traffic signal bounding box (blue)
3. Press **Enter** to save `calibration_config.json`

### 5. Start the backend server

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

### 6. Frontend setup

```bash
cd frontend
npm install
```

### 7. Start the frontend dev server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser and log in.

Default credentials (created on first run if seeding is enabled):

```
username: admin
password: admin123
```

---

## Project Structure

```
traffic-violation-system/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI entry — CORS, routers, MJPEG stream
│   │   ├── config.py              # Pydantic settings from .env
│   │   ├── detection/
│   │   │   ├── video_processor.py # Main 30 FPS orchestration loop
│   │   │   ├── yolo_loader.py     # Singleton model loader (3 models)
│   │   │   ├── violations/        # M1 red_light, M2 helmet, M3 speeding
│   │   │   ├── optimization/      # M4 congestion, M5 counter, M6 accident
│   │   │   ├── tracking/          # BoT-SORT wrapper, shared vehicle_history
│   │   │   └── anpr/              # M7 triggered plate reader
│   │   ├── routes/                # FastAPI routers (auth, violations, anpr…)
│   │   ├── schemas/               # Pydantic request/response models
│   │   ├── crud/                  # DB layer — routes never touch models directly
│   │   ├── database/              # SQLAlchemy models and connection
│   │   └── utils/                 # geometry, line_selector, logger, validators
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/                 # Dashboard, Violations, LiveFeed, ANPR…
│       ├── components/            # Navbar, ViolationCard, SignalControl
│       ├── hooks/                 # useWebSocket
│       ├── services/api.js        # Axios instance + all API functions
│       └── App.jsx                # Routes and ProtectedRoute wrapper
├── data/
│   └── test_videos/               # Place your test .mp4 here
├── models/                        # Place .pt weight files here (see below)
├── docs/                          # Architecture, API, schema, module specs
├── calibration_config.json        # Generated by line_selector — do not commit
├── docker-compose.yml
└── .env                           # Local secrets — never committed
```

---

## Model Files

The system uses three YOLO models. Place weight files in the `models/` directory:

| File | Source | Env var |
|---|---|---|
| `yolov8n.pt` | Auto-downloaded by ultralytics on first run | `YOLO_PRIMARY_MODEL_PATH` |
| `best.pt` | Custom-trained helmet detector (provided separately) | `YOLO_HELMET_MODEL_PATH` |
| `last.pt` | Custom-trained ANPR plate detector (provided separately) | `YOLO_PLATE_MODEL_PATH` |

```
models/
├── yolov8n.pt      # COCO vehicle detection + BoT-SORT tracking
├── best.pt         # Helmet / bare-head classification
└── last.pt         # License plate detection
```

The primary model (`yolov8n.pt`) is downloaded automatically if not present. The helmet and ANPR models must be placed manually — the system logs a warning and disables those modules if files are missing.

---

## API Quick Reference

Full endpoint reference: [docs/api.md](docs/api.md)

Base URL: `http://localhost:8000`  
Auth: all endpoints except `/auth/login` require `Authorization: Bearer <token>`

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Obtain JWT token |
| GET | `/violations` | List violations with filters |
| GET | `/anpr/{track_id}` | Look up plate by track ID |
| GET | `/alerts/accident` | List accident alerts |
| GET | `/congestion/status` | Current optimisation result |
| WS | `/congestion/ws` | Live congestion + signal stream |
| GET | `/video/stream` | MJPEG live feed |
| GET | `/health` | Server health check |

---

## Docs

- [Architecture decisions](docs/architecture.md)
- [Full API reference](docs/api.md)
- [Database schema](docs/schema.md)
- Module specs: [red-light](docs/modules/red-light.md) · [helmet](docs/modules/helmet.md) · [speed](docs/modules/speed.md) · [congestion](docs/modules/congestion.md) · [counter](docs/modules/counter.md) · [accident](docs/modules/accident.md) · [anpr](docs/modules/anpr.md)
