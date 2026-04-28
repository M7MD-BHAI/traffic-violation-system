#!/bin/bash
# scaffold.sh — Creates the complete empty file structure for traffic-violation-system
# Run with: bash scaffold.sh

set -e
echo "🚦 Scaffolding traffic-violation-system..."

# ── Backend ──────────────────────────────────────────────────────────────────

mkdir -p backend/app/detection/violations
mkdir -p backend/app/detection/optimization
mkdir -p backend/app/detection/tracking
mkdir -p backend/app/detection/anpr
mkdir -p backend/app/routes
mkdir -p backend/app/schemas
mkdir -p backend/app/crud
mkdir -p backend/app/database
mkdir -p backend/app/utils
mkdir -p backend/app/static/violations
mkdir -p backend/app/static/accidents

# __init__.py files
touch backend/app/__init__.py
touch backend/app/detection/__init__.py
touch backend/app/detection/violations/__init__.py
touch backend/app/detection/optimization/__init__.py
touch backend/app/detection/tracking/__init__.py
touch backend/app/detection/anpr/__init__.py
touch backend/app/routes/__init__.py
touch backend/app/schemas/__init__.py
touch backend/app/crud/__init__.py
touch backend/app/database/__init__.py
touch backend/app/utils/__init__.py

# Detection core
cat > backend/app/detection/video_processor.py << 'EOF'
# video_processor.py — Main 30 FPS processing loop. Runs one YOLO inference per frame
# and distributes results to all detection modules.
EOF

cat > backend/app/detection/yolo_loader.py << 'EOF'
# yolo_loader.py — Singleton YOLO model loader. Load once, share across all modules.
# Never import YOLO directly in any other file.
EOF

# Violations
cat > backend/app/detection/violations/red_light.py << 'EOF'
# red_light.py — M1: Red Light Violation Detection.
# ViolationManager class: calibration loading, signal state, crossing logic.
# See docs/modules/red-light.md for full spec.
EOF

cat > backend/app/detection/violations/helmet.py << 'EOF'
# helmet.py — M2: Helmet Violation Detection.
# HelmetViolationDetector class: hierarchical ROI + temporal voting.
# See docs/modules/helmet.md for full spec.
EOF

cat > backend/app/detection/violations/speeding.py << 'EOF'
# speeding.py — M3: Hybrid Speed Estimation.
# HybridSpeedService class: mini-box centroid + cache matrix.
# See docs/modules/speed.md for full spec.
EOF

# Optimization
cat > backend/app/detection/optimization/congestion.py << 'EOF'
# congestion.py — M4: Road Density Service.
# RoadDensityService class: calculates Congestion Index per road per frame.
# See docs/modules/congestion.md for full spec.
EOF

cat > backend/app/detection/optimization/signal_control.py << 'EOF'
# signal_control.py — M4: Congestion Aggregator & Smart Signal Optimizer.
# CongestionAggregator class: compares 4 roads, calculates time extensions.
# See docs/modules/congestion.md for full spec.
EOF

cat > backend/app/detection/optimization/accident.py << 'EOF'
# accident.py — M6: Accident Detection.
# AccidentDetector class: stagnation heuristic + IoU crash detection.
# See docs/modules/accident.md for full spec.
EOF

# Tracking
cat > backend/app/detection/tracking/vehicle_tracker.py << 'EOF'
# vehicle_tracker.py — BoT-SORT tracker wrapper.
# Wraps ultralytics built-in tracker. Provides clean interface for track_id access.
EOF

cat > backend/app/detection/tracking/vehicle_history.py << 'EOF'
# vehicle_history.py — Shared state store for track history.
# Holds: speed_map { track_id: float }, y_prev { track_id: float }
# Shared across red_light, speeding, congestion, accident modules.
EOF

# ANPR
cat > backend/app/detection/anpr/plate_reader.py << 'EOF'
# plate_reader.py — M7: ANPR Service.
# ANPR_Service class: triggered-only plate detection + EasyOCR.
# Runs in ThreadPoolExecutor. Never called from main loop directly.
# See docs/modules/anpr.md for full spec.
EOF

# Routes
cat > backend/app/routes/auth.py << 'EOF'
# auth.py — M8: Authentication routes.
# POST /auth/login, POST /auth/register, GET /auth/me
EOF

cat > backend/app/routes/violations.py << 'EOF'
# violations.py — Violation CRUD routes.
# POST /violations/red-light|helmet|speed, GET /violations, GET /violations/{id}
EOF

cat > backend/app/routes/vehicles.py << 'EOF'
# vehicles.py — Vehicle analytics routes.
# GET /vehicles, GET /analytics/counting, POST /analytics/counting
EOF

cat > backend/app/routes/signals.py << 'EOF'
# signals.py — Congestion update routes.
# POST /congestion/update, POST /congestion/signal-state, GET /congestion/status
EOF

cat > backend/app/routes/accidents.py << 'EOF'
# accidents.py — Accident alert routes.
# POST /alerts/accident, GET /alerts/accident, PATCH /alerts/accident/{id}/resolve
EOF

cat > backend/app/routes/anpr.py << 'EOF'
# anpr.py — ANPR lookup routes.
# GET /anpr/{track_id}, GET /anpr/search?plate=
EOF

cat > backend/app/routes/optimization.py << 'EOF'
# optimization.py — WebSocket + optimization routes.
# WS /congestion/ws — live smart timer broadcast to React frontend.
EOF

# Schemas
cat > backend/app/schemas/violation.py << 'EOF'
# violation.py — Pydantic schemas for violations.
# ViolationCreate, ViolationOut
EOF

cat > backend/app/schemas/vehicle.py << 'EOF'
# vehicle.py — Pydantic schemas for vehicle counting.
# VehicleOut, CountingReport
EOF

cat > backend/app/schemas/signal.py << 'EOF'
# signal.py — Pydantic schemas for congestion.
# CongestionUpdate, SignalStateUpdate
EOF

cat > backend/app/schemas/accident.py << 'EOF'
# accident.py — Pydantic schemas for accidents.
# AccidentAlert, AccidentOut
EOF

cat > backend/app/schemas/anpr.py << 'EOF'
# anpr.py — Pydantic schemas for ANPR results.
# PlateResult
EOF

# CRUD
cat > backend/app/crud/violations.py << 'EOF'
# violations.py — DB operations for violations.
# insert_violation(), get_violations(), get_violation_by_id(), update_violation_plate()
EOF

cat > backend/app/crud/vehicles.py << 'EOF'
# vehicles.py — DB operations for vehicle counting.
# save_counting_report(), get_latest_counts()
EOF

cat > backend/app/crud/signals.py << 'EOF'
# signals.py — DB operations for congestion snapshots.
# save_congestion_snapshot(), get_congestion_history()
EOF

cat > backend/app/crud/accidents.py << 'EOF'
# accidents.py — DB operations for accident alerts.
# save_alert(), get_alerts(), resolve_alert()
EOF

cat > backend/app/crud/anpr.py << 'EOF'
# anpr.py — DB operations for ANPR results.
# save_plate_result(), get_plate_by_track(), search_by_plate_text()
EOF

# Database
cat > backend/app/database/connection.py << 'EOF'
# connection.py — SQLAlchemy engine + session factory.
# Reads DATABASE_URL from environment. Provides get_db() dependency for FastAPI.
EOF

cat > backend/app/database/models.py << 'EOF'
# models.py — SQLAlchemy ORM models.
# Tables: users, violations, vehicles, counting_reports, accidents, plate_results, congestion_snapshots
EOF

# Utils
cat > backend/app/utils/geometry.py << 'EOF'
# geometry.py — Shared math utilities.
# compute_iou(), point_in_polygon(), line_crossing_check(), centroid()
EOF

cat > backend/app/utils/line_selector.py << 'EOF'
# line_selector.py — Interactive calibration mouse tool.
# Opens first video frame, accepts mouse clicks, saves calibration_config.json
EOF

cat > backend/app/utils/logger.py << 'EOF'
# logger.py — Structured logging setup.
# Returns configured logger with file + console handlers.
EOF

cat > backend/app/utils/validators.py << 'EOF'
# validators.py — Input validation helpers.
# validate_config_json(), validate_bbox(), validate_resolution()
EOF

# App entry files
cat > backend/app/config.py << 'EOF'
# config.py — Application settings loaded from .env
# Uses pydantic BaseSettings. All env vars defined here.
EOF

cat > backend/app/main.py << 'EOF'
# main.py — FastAPI application entry point.
# Creates app, mounts all routers, configures CORS, initialises DB.
# Run with: uvicorn backend.app.main:app --reload
EOF

cat > backend/requirements.txt << 'EOF'
ultralytics>=8.0.0
opencv-python>=4.8.0
numpy>=1.24.0
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
sqlalchemy>=2.0.0
psycopg2-binary>=2.9.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
httpx>=0.27.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
easyocr>=1.7.0
python-multipart>=0.0.9
EOF

cat > backend/.env.example << 'EOF'
DATABASE_URL=postgresql://user:password@localhost:5432/traffic_fyp
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
YOLO_PRIMARY_MODEL_PATH=models/yolov8n.pt
YOLO_HELMET_MODEL_PATH=models/helmet_detector.pt
YOLO_PLATE_MODEL_PATH=models/plate_detector.pt
STATIC_FILES_DIR=backend/app/static
VIDEO_SOURCE=data/test_videos/test.mp4
SPEED_LIMIT_KMH=50
ANPR_CONFIDENCE_THRESHOLD=0.40
BACKEND_URL=http://localhost:8000
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
EOF

# ── Frontend ──────────────────────────────────────────────────────────────────

mkdir -p frontend/src/components
mkdir -p frontend/src/pages
mkdir -p frontend/src/services
mkdir -p frontend/src/hooks

cat > frontend/src/pages/Login.jsx << 'EOF'
// Login.jsx — Login page with username + password fields. JWT token stored on success.
EOF

cat > frontend/src/pages/Dashboard.jsx << 'EOF'
// Dashboard.jsx — Main analytics dashboard. Live violation counts, charts (Recharts), vehicle totals.
EOF

cat > frontend/src/pages/Violations.jsx << 'EOF'
// Violations.jsx — Violations table. Filterable by type, date, plate. Snapshot image per row.
EOF

cat > frontend/src/pages/LiveFeed.jsx << 'EOF'
// LiveFeed.jsx — Live video feed with bounding boxes, track IDs, speed labels overlaid.
EOF

cat > frontend/src/pages/Accidents.jsx << 'EOF'
// Accidents.jsx — Emergency alerts page. Severity badge, road ID, 3-second clip preview.
EOF

cat > frontend/src/pages/Optimization.jsx << 'EOF'
// Optimization.jsx — Smart signal timer. WebSocket connection to /congestion/ws. Live CI display.
EOF

cat > frontend/src/pages/ANPR.jsx << 'EOF'
// ANPR.jsx — Plate lookup page. Search by plate number. Full violation history per plate.
EOF

cat > frontend/src/pages/Settings.jsx << 'EOF'
// Settings.jsx — Configure speed limit, confidence thresholds, camera names, ANPR sensitivity.
EOF

cat > frontend/src/components/Navbar.jsx << 'EOF'
// Navbar.jsx — Top navigation bar. Links to all pages. Username display + logout.
EOF

cat > frontend/src/components/ViolationCard.jsx << 'EOF'
// ViolationCard.jsx — Single violation display. Image crop, type badge, plate, timestamp.
EOF

cat > frontend/src/components/SignalControl.jsx << 'EOF'
// SignalControl.jsx — Smart signal timer widget. Shows CI per road + time extensions.
EOF

cat > frontend/src/services/api.js << 'EOF'
// api.js — All API calls to FastAPI backend. Axios instance with JWT interceptor.
// Never call the API from components directly — always use this service.
EOF

cat > frontend/src/hooks/useWebSocket.js << 'EOF'
// useWebSocket.js — Custom React hook for WebSocket connection to /congestion/ws
EOF

cat > frontend/src/App.jsx << 'EOF'
// App.jsx — Root component. React Router setup. Protected route wrapper.
EOF

cat > frontend/src/index.js << 'EOF'
// index.js — React entry point.
EOF

cat > frontend/package.json << 'EOF'
{
  "name": "traffic-violation-frontend",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-router-dom": "^6.0.0",
    "axios": "^1.6.0",
    "recharts": "^2.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^3.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0"
  }
}
EOF

# ── Root files ────────────────────────────────────────────────────────────────

mkdir -p data/test_videos
mkdir -p notebooks
mkdir -p models

cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*.pyo
.env
venv/
.venv/
*.egg-info/

# Models (too large for git)
models/*.pt

# Static uploads
backend/app/static/violations/
backend/app/static/accidents/

# Node
node_modules/
frontend/dist/
frontend/build/

# DB
*.db
*.sqlite

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
EOF

cat > calibration_config.json << 'EOF'
{
  "violation_line": [[0, 0], [640, 0]],
  "signal_roi": [[0, 0], [100, 100]],
  "resolution": [640, 360],
  "speed_line_a_y": 150,
  "speed_line_b_y": 300,
  "meters_per_pixel": 0.05,
  "_note": "Run python -m backend.app.utils.line_selector to recalibrate"
}
EOF

cat > README.md << 'EOF'
# AI-Driven Traffic Flow Optimization & Violation Detection System

Final Year Project (FYP)

## Setup
1. `cd backend && pip install -r requirements.txt`
2. Copy `.env.example` to `.env` and fill in values
3. `cd frontend && npm install`
4. Run backend: `uvicorn backend.app.main:app --reload`
5. Run frontend: `cd frontend && npm run dev`

## Calibration
```bash
python -m backend.app.utils.line_selector --video data/test_videos/test.mp4
```

## Docs
- Architecture: docs/architecture.md
- API: docs/api.md
- Schema: docs/schema.md
- Module specs: docs/modules/
EOF

cat > docker-compose.yml << 'EOF'
version: "3.8"
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: traffic_fyp
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    depends_on:
      - db
  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
EOF

echo ""
echo "✅ Scaffold complete! Structure created:"
echo ""
find . -type f | grep -v node_modules | grep -v .git | sort
echo ""
echo "Next step: bash scaffold.sh → git init → git add . → git commit"
