# REMAINING PROMPTS PLAYBOOK
# Traffic Violation System — Pick up from current progress
# Status: M1-M4, M7, M8 Done | M5, M6 Pending | M9 Frontend In Progress

===========================================================
CURRENT PROGRESS SNAPSHOT
===========================================================

BACKEND:   M1 M2 M3 M4 M7 M8 = DONE
           M5 (Counter) = PENDING
           M6 (Accident) = PENDING

FRONTEND:  api.js = DONE
           Login.jsx = DONE
           Everything else = PENDING

===========================================================
SESSION 1 — COMPLETE M5: VEHICLE COUNTER
===========================================================

PROMPT 1A — Implement TrafficCounter
----------------------------------------------------------
Read CLAUDE.md and docs/modules/counter.md carefully.

Implement backend/app/detection/optimization/counter.py

Build the TrafficCounter class with:
- Directional counting: only count track_id when bottom-centre y crosses stop_line_y from above
- Never count same track_id twice (use a confirmed_ids set)
- Classification dict mapping YOLO class IDs to: small (bike/motorcycle), medium (car), heavy (bus/truck)
- Two counters: total_counts (never reset) and interval_counts (reset every 60s)
- asyncio reporter that POSTs to /analytics/counting every 60 seconds without blocking the video loop
- Payload format: {"timestamp": str, "interval_counts": dict, "total_counts": dict, "grouped": {"small": N, "medium": N, "heavy": N}}

Read calibration_config.json for stop_line coordinates.
Use the shared model from yolo_loader.py — do NOT create a new YOLO instance.

----------------------------------------------------------
COMMIT AFTER THIS:
git add backend/app/detection/optimization/counter.py
git commit -m "feat(counter): implement directional vehicle counting and classification"
git push origin main
----------------------------------------------------------

PROMPT 1B — Counter API route + schema + CRUD
----------------------------------------------------------
Read docs/api.md for the /analytics/counting endpoints.

Implement these three files:
1. backend/app/schemas/vehicle.py — VehicleOut and CountingReport pydantic models
2. backend/app/crud/vehicles.py — save_counting_report() and get_latest_counts() functions
3. backend/app/routes/vehicles.py — GET /vehicles and POST+GET /analytics/counting endpoints

All DB operations go through crud layer only. Routes import from schemas and crud — never touch models directly.

----------------------------------------------------------
COMMIT AFTER THIS:
git add backend/app/schemas/vehicle.py backend/app/crud/vehicles.py backend/app/routes/vehicles.py
git commit -m "feat(counter): add counting API routes, schemas, and CRUD operations"
git push origin main
----------------------------------------------------------

UPDATE CLAUDE.md AFTER SESSION 1:
----------------------------------------------------------
Open CLAUDE.md. In the Progress table change:
M5 — Counter | ⬜ Pending   →   M5 — Counter | ✅ Done

git add CLAUDE.md
git commit -m "docs: mark M5 Counter as complete"
git push origin main
----------------------------------------------------------


===========================================================
SESSION 2 — COMPLETE M6: ACCIDENT DETECTION
===========================================================

PROMPT 2A — Implement AccidentDetector
----------------------------------------------------------
Read CLAUDE.md and docs/modules/accident.md carefully.

Implement backend/app/detection/optimization/accident.py

Build the AccidentDetector class with:

STAGNATION HEURISTIC:
- Track vehicles with speed < 2 km/h for more than 10 continuous seconds
- Only trigger if vehicle is NOT inside signal_roi and NOT within 40px of stop_line_y
- These are the exclusion zones — a car stopped at a red light is NOT an accident

CRASH IoU HEURISTIC:
- Compute IoU between every pair of bounding boxes each frame
- If IoU > 0.40 AND both vehicles have speed < 2 km/h for > 5 seconds → crash alert
- Use compute_iou() from backend/app/utils/geometry.py

ROLLING FRAME BUFFER:
- Maintain a deque of last 90 frames (3 seconds at 30fps)
- Include this buffer in the alert so a video clip can be saved

ALERT:
- POST to /alerts/accident with: alert_type, track_ids, timestamp, road_id, bbox
- Once a pair is alerted do not alert again (use alerted_ids set)

Read signal_roi and stop_line from calibration_config.json.
Read speed values from the shared vehicle_history speed_map dict.

----------------------------------------------------------
COMMIT AFTER THIS:
git add backend/app/detection/optimization/accident.py
git commit -m "feat(accident): implement IoU crash heuristic and stagnation detector"
git push origin main
----------------------------------------------------------

PROMPT 2B — Accident API route + schema + CRUD
----------------------------------------------------------
Read docs/api.md for the /alerts/accident endpoints.

Implement these three files:
1. backend/app/schemas/accident.py — AccidentAlert and AccidentOut pydantic models
2. backend/app/crud/accidents.py — save_alert(), get_alerts(), resolve_alert() functions
3. backend/app/routes/accidents.py — POST /alerts/accident, GET /alerts/accident, PATCH /alerts/accident/{id}/resolve

----------------------------------------------------------
COMMIT AFTER THIS:
git add backend/app/schemas/accident.py backend/app/crud/accidents.py backend/app/routes/accidents.py
git commit -m "feat(accident): add accident alert routes, schemas, and CRUD operations"
git push origin main
----------------------------------------------------------

PROMPT 2C — geometry.py utils
----------------------------------------------------------
Implement backend/app/utils/geometry.py with these functions, all with full type hints:

1. compute_iou(box_a: list, box_b: list) -> float
   - box format: [x1, y1, x2, y2]
   - returns 0.0 if union is zero

2. point_in_polygon(point: tuple, polygon: list) -> bool
   - uses OpenCV pointPolygonTest
   - polygon is list of (x,y) tuples

3. is_near_line(cy: float, line_y: float, margin: float = 40.0) -> bool
   - returns True if abs(cy - line_y) < margin

4. get_centroid(box: list) -> tuple
   - returns (cx, cy) centre of [x1,y1,x2,y2]

5. get_bottom_centre(box: list) -> tuple
   - returns (cx, y2) bottom centre point

----------------------------------------------------------
COMMIT AFTER THIS:
git add backend/app/utils/geometry.py
git commit -m "feat(utils): add geometry utilities for IoU, polygon, line crossing"
git push origin main
----------------------------------------------------------

UPDATE CLAUDE.md AFTER SESSION 2:
----------------------------------------------------------
Open CLAUDE.md. In the Progress table change:
M6 — Accident | ⬜ Pending   →   M6 — Accident | ✅ Done

git add CLAUDE.md
git commit -m "docs: mark M6 Accident as complete"
git push origin main
----------------------------------------------------------


===========================================================
SESSION 3 — FRONTEND: App.jsx + Navbar + Components
===========================================================

PROMPT 3A — App.jsx with routing and protected routes
----------------------------------------------------------
Read CLAUDE.md. The frontend uses React 18, React Router v6, and Tailwind CSS.
The api.js and Login.jsx are already complete.

Implement frontend/src/App.jsx with:
- React Router v6 BrowserRouter setup
- Routes for: /login, /dashboard, /violations, /live-feed, /accidents, /optimization, /anpr, /settings
- A ProtectedRoute wrapper component that checks for JWT token in localStorage
- If no token found, redirect to /login automatically
- If token found, render the requested page
- Default route "/" redirects to "/dashboard"

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/App.jsx
git commit -m "feat(frontend): add React Router setup with JWT protected routes"
git push origin main
----------------------------------------------------------

PROMPT 3B — index.js entry point
----------------------------------------------------------
Implement frontend/src/index.js as the React 18 entry point.
Use createRoot from react-dom/client.
Wrap App in React.StrictMode.
Import index.css for Tailwind styles.

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/index.js
git commit -m "feat(frontend): add React 18 entry point"
git push origin main
----------------------------------------------------------

PROMPT 3C — Navbar component
----------------------------------------------------------
Read CLAUDE.md. Implement frontend/src/components/Navbar.jsx

Build a responsive top navigation bar with Tailwind CSS:
- Left side: project name "TrafficIQ" with a traffic light emoji
- Navigation links: Dashboard, Violations, Live Feed, Accidents, Optimization, ANPR, Settings
- Right side: logged-in username from localStorage + a Logout button
- Logout clears localStorage token and redirects to /login
- Active link should have a highlighted style (different colour from inactive links)
- Use React Router NavLink for navigation so active state is automatic
- Dark background (slate-900 or similar), white text

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/components/Navbar.jsx
git commit -m "feat(frontend): add Navbar with navigation links and logout"
git push origin main
----------------------------------------------------------

PROMPT 3D — ViolationCard component
----------------------------------------------------------
Implement frontend/src/components/ViolationCard.jsx

A reusable card component that accepts a violation object as a prop and displays:
- Vehicle snapshot image (from violation.image_path) — show placeholder if null
- Violation type badge: RED LIGHT (red), HELMET (orange), SPEED (yellow) — different colour per type
- Plate number OR "Plate Not Visible" badge in grey if plate_status is plate_not_visible
- Timestamp formatted as readable date+time
- Speed value if violation_type is SPEED (e.g. "67 km/h")
- Confidence score as a percentage
- Tailwind styled, clean card with shadow and rounded corners

Props: violation = { id, track_id, violation_type, timestamp, image_path, plate_text, plate_status, confidence_score, speed_kmh }

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/components/ViolationCard.jsx
git commit -m "feat(frontend): add ViolationCard component with type badges"
git push origin main
----------------------------------------------------------

PROMPT 3E — SignalControl component
----------------------------------------------------------
Implement frontend/src/components/SignalControl.jsx

A widget that displays the smart signal timer. Props: roadData = array of road objects.
Each road shows:
- Road name
- Congestion Index bar (0-100, colour coded: green<40, amber<70, red>=70)
- Vehicle count
- Time extension in seconds (if any)
- Current signal state badge (RED/GREEN/YELLOW)

Accepts live data as props — the Optimization page will pass WebSocket data into this.
Tailwind styled, dark card style.

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/components/SignalControl.jsx
git commit -m "feat(frontend): add SignalControl widget for congestion display"
git push origin main
----------------------------------------------------------


===========================================================
SESSION 4 — FRONTEND PAGES PART 1
===========================================================

PROMPT 4A — Dashboard page
----------------------------------------------------------
Read CLAUDE.md and docs/api.md for relevant endpoints.
The api.js service file is already complete — import from there.

Implement frontend/src/pages/Dashboard.jsx with:

TOP ROW — 4 stat cards:
- Total Violations Today
- Total Vehicles Counted
- Active Accidents (unresolved)
- Most Common Violation Type

MIDDLE ROW — 2 Recharts charts:
- Line chart: violations over the last 7 days (fetch from GET /violations with date filter)
- Pie chart: vehicle breakdown by type small/medium/heavy (fetch from GET /analytics/counting)

BOTTOM ROW — last 5 violations as ViolationCard components

Auto-refresh every 30 seconds using setInterval.
Show loading spinner while fetching.
Use Tailwind CSS grid layout.
Import Navbar at top. Import ViolationCard component.

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): add stats cards, Recharts charts, recent violations"
git push origin main
----------------------------------------------------------

PROMPT 4B — Violations page
----------------------------------------------------------
Read docs/api.md for GET /violations endpoint and its query parameters.

Implement frontend/src/pages/Violations.jsx with:

FILTER BAR at top:
- Dropdown: All Types / RED_LIGHT / HELMET / SPEED
- Date from + Date to date pickers
- Plate number text search input
- Clear filters button

RESULTS:
- Grid of ViolationCard components
- Pagination: 12 per page, Previous/Next buttons
- Total count shown: "Showing 24 of 156 violations"
- Each card clickable — opens a modal with full violation details including larger image

MODAL details:
- Full size image
- All violation fields
- Plate result with status
- If plate_status is plate_not_visible show: "⚠️ Plate unreadable — monitor next camera"

Import Navbar. Use Tailwind. Call API only through api.js.

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/pages/Violations.jsx
git commit -m "feat(violations-page): add filterable violations table with detail modal"
git push origin main
----------------------------------------------------------


===========================================================
SESSION 5 — FRONTEND PAGES PART 2
===========================================================

PROMPT 5A — Accidents page
----------------------------------------------------------
Read docs/api.md for /alerts/accident endpoints.

Implement frontend/src/pages/Accidents.jsx with:

- List of accident alerts, newest first
- Each alert shows: alert type badge (CRASH = red, STAGNATION = amber), road ID, timestamp, involved track IDs, resolved status
- CRASH badge is red with warning icon, STAGNATION is amber
- "Mark Resolved" button on each unresolved alert — calls PATCH /alerts/accident/{id}/resolve
- Filter toggle: Show All / Unresolved Only
- Auto-refresh every 15 seconds

Import Navbar. Tailwind styled.

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/pages/Accidents.jsx
git commit -m "feat(accidents-page): add accident alerts list with resolve action"
git push origin main
----------------------------------------------------------

PROMPT 5B — Optimization page (WebSocket)
----------------------------------------------------------
Read docs/api.md for the WebSocket endpoint WS /congestion/ws.

Implement frontend/src/pages/Optimization.jsx with:

- WebSocket connection to ws://localhost:8000/congestion/ws
- Reconnects automatically if connection drops (retry every 3 seconds)
- Shows connection status badge: Connected (green) / Reconnecting (amber)
- Uses SignalControl component to display live road data
- Shows last updated timestamp
- Below the signal controls: a table of recent congestion snapshots

Also implement frontend/src/hooks/useWebSocket.js as a custom hook:
- Takes url as parameter
- Returns { data, status } where status is "connected" | "reconnecting" | "disconnected"
- Handles cleanup on component unmount

Import Navbar. Tailwind styled.

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/pages/Optimization.jsx frontend/src/hooks/useWebSocket.js
git commit -m "feat(optimization-page): add live WebSocket smart signal timer display"
git push origin main
----------------------------------------------------------

PROMPT 5C — ANPR page
----------------------------------------------------------
Read docs/api.md for GET /anpr/{track_id} and GET /anpr/search?plate= endpoints.

Implement frontend/src/pages/ANPR.jsx with:

SEARCH BAR:
- Text input for plate number (e.g. ABC123)
- Search button — calls GET /anpr/search?plate=input

RESULTS:
- Shows all violations linked to that plate number
- Each result: plate text, confidence score, timestamp, violation type, image
- If status is plate_not_visible: show grey badge "Plate Not Visible" and the next-camera message in amber
- "No results found" state if empty

Also show a recent ANPR lookups table at the bottom (last 10 from GET /anpr with limit=10).

Import Navbar. Tailwind styled.

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/pages/ANPR.jsx
git commit -m "feat(anpr-page): add plate search and violation history lookup"
git push origin main
----------------------------------------------------------


===========================================================
SESSION 6 — FRONTEND PAGES PART 3 + SETTINGS
===========================================================

PROMPT 6A — Live Feed page
----------------------------------------------------------
Implement frontend/src/pages/LiveFeed.jsx

The live feed shows the processed video stream from the backend.
The backend serves frames as MJPEG stream at GET /video/stream (add this endpoint note).

Build the page with:
- Large video display area showing the MJPEG stream using an <img> tag with src pointing to the backend stream URL
- Sidebar showing real-time stats: current FPS, active track count, signal state
- Below video: last 5 violations detected in this session (polling GET /violations?limit=5 every 5 seconds)
- Start/Stop stream buttons
- If stream is unavailable show a placeholder with "Stream offline — check video source"

Import Navbar. Tailwind styled.

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/pages/LiveFeed.jsx
git commit -m "feat(live-feed): add MJPEG video stream display with real-time stats"
git push origin main
----------------------------------------------------------

PROMPT 6B — Settings page
----------------------------------------------------------
Read CLAUDE.md for the settings that should be configurable.

Implement frontend/src/pages/Settings.jsx with these sections:

DETECTION SETTINGS:
- Speed limit (km/h) — number input, default 50
- ANPR confidence threshold — slider 0.1 to 1.0, default 0.40
- Helmet voting threshold — slider 0.5 to 1.0, default 0.70

CAMERA SETTINGS:
- Camera name / road ID — text input
- Video source path — text input

SYSTEM INFO (read-only display):
- Primary model: YOLOv8n
- Helmet model: helmet_detector.pt
- Plate model: plate_detector.pt
- Database: PostgreSQL

Save button — POSTs settings to GET/POST /settings endpoint.
Show success toast on save.

Import Navbar. Tailwind styled. Clean form layout with section headings.

----------------------------------------------------------
COMMIT AFTER THIS:
git add frontend/src/pages/Settings.jsx
git commit -m "feat(settings): add configurable detection and camera settings page"
git push origin main
----------------------------------------------------------

UPDATE CLAUDE.md AFTER SESSION 6:
----------------------------------------------------------
Open CLAUDE.md. Update the Progress table:
M9 — Frontend | 🟡 In Progress   →   M9 — Frontend | ✅ Done

Also update the frontend sub-table — mark all pages as Done.

git add CLAUDE.md
git commit -m "docs: mark M9 Frontend as complete — all pages done"
git push origin main
----------------------------------------------------------


===========================================================
SESSION 7 — WIRE EVERYTHING TOGETHER
===========================================================

PROMPT 7A — Complete FastAPI main.py
----------------------------------------------------------
Read CLAUDE.md and docs/api.md.

Implement backend/app/main.py as the complete FastAPI application entry point:

- Create FastAPI app with title "Traffic Violation System API" and version "1.0.0"
- Add CORSMiddleware allowing origins from CORS_ORIGINS env var
- Mount all routers with prefixes:
    auth router        → /auth
    violations router  → /violations
    vehicles router    → /vehicles + /analytics
    signals router     → /congestion
    accidents router   → /alerts
    anpr router        → /anpr
    optimization router → /congestion (WebSocket)
- Mount static files: /static → backend/app/static/
- Add startup event that creates all DB tables using SQLAlchemy
- Add GET /health endpoint returning {"status": "ok", "version": "1.0.0"}
- Add GET /video/stream endpoint that reads from VIDEO_SOURCE env var and streams as MJPEG

----------------------------------------------------------
COMMIT AFTER THIS:
git add backend/app/main.py
git commit -m "feat(api): complete FastAPI main with all routers, CORS, static, MJPEG stream"
git push origin main
----------------------------------------------------------

PROMPT 7B — config.py and .env
----------------------------------------------------------
Implement backend/app/config.py using pydantic BaseSettings.

Define all settings with types and defaults:
- DATABASE_URL: str
- SECRET_KEY: str
- ALGORITHM: str = "HS256"
- ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
- YOLO_PRIMARY_MODEL_PATH: str = "models/yolov8n.pt"
- YOLO_HELMET_MODEL_PATH: str = "models/helmet_detector.pt"
- YOLO_PLATE_MODEL_PATH: str = "models/plate_detector.pt"
- STATIC_FILES_DIR: str = "backend/app/static"
- VIDEO_SOURCE: str = "data/test_videos/test.mp4"
- SPEED_LIMIT_KMH: float = 50.0
- ANPR_CONFIDENCE_THRESHOLD: float = 0.40
- BACKEND_URL: str = "http://localhost:8000"
- CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

Create get_settings() cached function using lru_cache.
Create .env file from .env.example with placeholder values filled in for SQLite:
DATABASE_URL=sqlite:///./traffic_fyp.db

----------------------------------------------------------
COMMIT AFTER THIS:
git add backend/app/config.py .env
git commit -m "feat(config): add pydantic settings and .env for local SQLite dev"
git push origin main
----------------------------------------------------------

PROMPT 7C — video_processor.py main loop
----------------------------------------------------------
Read CLAUDE.md and docs/architecture.md carefully. This is the most important file.

Implement backend/app/detection/video_processor.py as the main processing loop.

CRITICAL RULES from architecture.md:
- ONE YOLO inference per frame — use yolo_loader singleton, never create new YOLO instances
- Share the result (boxes, track_ids, classes) with all modules
- All DB writes are async — never block the loop
- CV operations are synchronous

Build VideoProcessor class with:
- __init__: load config, instantiate all modules (ViolationManager, HelmetViolationDetector, HybridSpeedService, TrafficCounter, RoadDensityService, AccidentDetector, ANPR_Service)
- process_video(source): main loop that opens video, runs per-frame logic
- _process_frame(frame, frame_idx): single frame handler:
    1. Resize to resolution from config
    2. Run model.track() ONCE — get boxes, ids, classes, confidences
    3. Update vehicle_history speed_map and y_prev
    4. Pass shared results to: red_light, helmet, speeding, counter, accident, congestion
    5. Trigger ANPR async for any violations returned
    6. Draw overlays on frame (speed labels, bounding boxes, violation flags)
    7. Return annotated frame
- start() and stop() methods
- get_stats() returning current FPS, track count, signal state

----------------------------------------------------------
COMMIT AFTER THIS:
git add backend/app/detection/video_processor.py
git commit -m "feat(pipeline): implement main video processor with shared single YOLO pass"
git push origin main
----------------------------------------------------------


===========================================================
SESSION 8 — FINAL POLISH AND TESTING
===========================================================

PROMPT 8A — README with full setup guide
----------------------------------------------------------
Read CLAUDE.md, docs/architecture.md, and docs/api.md.

Rewrite README.md as a complete, professional project README with:

1. Project title and one-line description
2. Screenshot placeholder section (add 3 placeholder image links)
3. Features list — all 7 modules described in one line each
4. Tech stack table (from CLAUDE.md)
5. Prerequisites section (Python 3.10+, Node 18+, Git)
6. Complete setup instructions:
   - Clone repo
   - Backend setup (venv, pip install, .env setup)
   - Run calibration tool
   - Start backend server
   - Frontend setup (npm install)
   - Start frontend dev server
7. Project structure tree (2 levels deep)
8. API quick reference (link to docs/api.md)
9. Model files section — where to put trained .pt files

----------------------------------------------------------
COMMIT AFTER THIS:
git add README.md
git commit -m "docs: complete README with setup guide, features, and tech stack"
git push origin main
----------------------------------------------------------

PROMPT 8B — Fix any import errors before first run
----------------------------------------------------------
Read all files in backend/app/detection/ and backend/app/routes/ and check for:

1. Any file that imports YOLO directly (from ultralytics import YOLO) — replace with yolo_loader singleton
2. Any circular imports between modules
3. Any missing __init__.py files in any folder
4. Any route file that is not yet included in main.py routers list
5. Any schema that references a model that does not exist in models.py

List every issue found, fix them all, then run:
python -c "from backend.app.main import app; print('Import OK')"

If it prints Import OK we are ready to start.

----------------------------------------------------------
COMMIT AFTER THIS:
git add .
git commit -m "fix: resolve import errors and missing init files before first run"
git push origin main
----------------------------------------------------------


===========================================================
HOW TO RUN THE PROJECT — COPY THESE COMMANDS
===========================================================

--- TERMINAL 1: START BACKEND ---

# Go to project folder
cd traffic-violation-system

# Create virtual environment (first time only)
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies (first time only)
pip install -r backend/requirements.txt

# Copy env file (first time only)
cp backend/.env.example backend/.env

# Run calibration tool FIRST (first time only — draws your stop line)
python -m backend.app.utils.line_selector --video data/test_videos/test.mp4

# Start the backend server
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Backend is now running at: http://localhost:8000
# API docs at: http://localhost:8000/docs  ← Swagger UI auto-generated
# Health check: http://localhost:8000/health


--- TERMINAL 2: START FRONTEND ---

# Go to frontend folder
cd traffic-violation-system/frontend

# Install dependencies (first time only)
npm install

# Start React dev server
npm run dev

# Frontend is now running at: http://localhost:5173
# Open this URL in your browser


--- TERMINAL 3: START VIDEO PROCESSING ---

# Go to project folder
cd traffic-violation-system

# Activate venv
venv\Scripts\activate   # Windows
source venv/bin/activate  # Mac/Linux

# Run the video processor
python -m backend.app.detection.video_processor --video data/test_videos/test.mp4

# This starts the 30 FPS detection loop
# Violations will appear in the dashboard automatically


--- FIRST TIME LOGIN ---
Username: admin
Password: admin123
(Created automatically on first startup by the DB seed)


--- SWAGGER API DOCS ---
Open browser: http://localhost:8000/docs
This shows every API endpoint — you can test them all directly from the browser
Very useful to show your panel during demo


--- USEFUL COMMANDS ---

# See all commits (your modular history)
git log --oneline

# Check which files changed
git status

# If backend crashes, check logs
uvicorn backend.app.main:app --reload --log-level debug

# Reset database (careful — deletes all data)
python -c "from backend.app.database.connection import engine; from backend.app.database.models import Base; Base.metadata.drop_all(engine); Base.metadata.create_all(engine); print('DB reset')"


===========================================================
FINAL CLAUDE.md STATUS — PASTE THIS WHEN EVERYTHING IS DONE
===========================================================

After all sessions complete, tell Claude Code:

"Update the Progress section in CLAUDE.md. Mark all modules as Done:
M1 M2 M3 M4 M5 M6 M7 M8 M9 all = Done.
Also add a new section at the bottom called ## Run Commands with the uvicorn and npm run dev commands."

git add CLAUDE.md
git commit -m "docs: mark all modules complete — project ready for demo"
git push origin main


===========================================================
PANEL DEMO CHECKLIST
===========================================================

Before your presentation run through this:

[ ] git log --oneline  →  shows 20+ meaningful commits spread over weeks
[ ] Backend starts with no errors
[ ] Frontend loads login page correctly
[ ] Login works with admin credentials
[ ] Dashboard shows charts (may need test video to have run first)
[ ] Run test video: python -m backend.app.detection.video_processor
[ ] Violations appear in Violations page
[ ] Optimization page shows WebSocket connected
[ ] ANPR search returns results
[ ] Settings page loads and saves
[ ] http://localhost:8000/docs  →  show panel all your API endpoints
[ ] Show trained helmet model: models/helmet_detector.pt exists
[ ] Mention: "plate_not_visible triggers next-camera alert" — strong talking point
