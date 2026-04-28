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
