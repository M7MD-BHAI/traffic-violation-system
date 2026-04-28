# Commit Convention — traffic-violation-system

## Format
```
type(scope): short description

[optional body — what and why, not how]
```

## Types

| Type | When to use |
|---|---|
| `feat` | New feature or module added |
| `fix` | Bug fix |
| `refactor` | Code restructured, no behaviour change |
| `docs` | README, docstrings, markdown files |
| `test` | Adding or fixing tests |
| `chore` | Dependencies, config, tooling |
| `style` | Formatting only (no logic change) |

## Scopes — use the module name

| Scope | Covers |
|---|---|
| `auth` | Login, JWT, user model |
| `red-light` | M1 — ViolationManager |
| `helmet` | M2 — HelmetViolationDetector |
| `speed` | M3 — HybridSpeedService |
| `congestion` | M4 — RoadDensityService, CongestionAggregator |
| `counter` | M5 — TrafficCounter |
| `accident` | M6 — AccidentDetector |
| `anpr` | M7 — ANPR_Service |
| `tracker` | BoT-SORT wrapper, vehicle_history |
| `db` | Models, connection, migrations |
| `api` | Routes, schemas, CRUD |
| `frontend` | All React files |
| `dashboard` | Dashboard.jsx specifically |
| `violations-page` | Violations.jsx specifically |
| `settings` | Settings.jsx |
| `calibration` | line_selector.py, config.json |
| `pipeline` | video_processor.py, yolo_loader.py |
| `docker` | docker-compose, Dockerfile |

## Real examples from this project

```bash
chore: initial project scaffold, folder structure, requirements.txt
feat(db): add SQLAlchemy models for User, Violation, Vehicle, Accident
feat(auth): implement JWT login endpoint and bcrypt password hashing
feat(auth): add React login page with Tailwind styling
feat(calibration): add interactive stop-line and signal ROI selector tool
feat(pipeline): add shared YOLO loader singleton and BoT-SORT tracker wrapper
feat(red-light): implement ViolationManager with V-channel signal detection
feat(red-light): add directional guard (v>0) and line-crossing logic
feat(helmet): implement head-zone ROI extraction (top 25% of motorcycle bbox)
feat(helmet): add 15-frame temporal voting system (70% threshold)
feat(speed): implement mini-box centroid and cache matrix speed estimation
feat(speed): add stripe logic for line crossing (line_y ± 5px)
feat(anpr): add triggered ANPR service with ThreadPoolExecutor
feat(anpr): implement plate_not_visible fallback with next-camera message
feat(congestion): implement RoadDensityService and Congestion Index formula
feat(congestion): add WebSocket broadcast for smart signal timer
feat(accident): implement IoU overlap crash heuristic
feat(accident): add stagnation detection with exclusion zones
feat(counter): add directional vehicle counting and classification by group
feat(dashboard): add Recharts violation trend and vehicle type charts
feat(violations-page): add filterable violations table with image preview
feat(settings): add configurable speed limit and ANPR threshold controls
docs: add README with setup guide and architecture overview
chore: add docker-compose.yml for PostgreSQL + backend + frontend
```

## Rules

1. **Present tense** — "add feature" not "added feature"
2. **No period** at end of subject line
3. **Subject line max 72 characters**
4. **One feature = one commit** — never batch unrelated changes
5. **Never commit broken code** to `main`
6. **Never commit** `.env`, `*.pt` model files, or `node_modules`

---

## First 5 Git Commands (run after scaffold.sh)

```bash
# 1. Initialise the repo
git init

# 2. Add remote (replace with your actual GitHub repo URL)
git remote add origin https://github.com/YOUR_USERNAME/traffic-violation-system.git

# 3. Stage all scaffolded files
git add .

# 4. First commit
git commit -m "chore: initial project scaffold, folder structure, requirements.txt"

# 5. Push to GitHub
git branch -M main
git push -u origin main
```

After this, every time you finish a feature:
```bash
git add .
git commit -m "feat(module-name): description of what you built"
git push origin main
```
