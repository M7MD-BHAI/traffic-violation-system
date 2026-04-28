import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database.connection import create_tables
from app.detection.optimization.signal_control import aggregator
from app.routes import (
    accidents,
    anpr,
    auth,
    optimization,
    signals,
    vehicles,
    violations,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────
    create_tables()
    aggregator.set_event_loop(asyncio.get_event_loop())

    static_dir = Path(settings.STATIC_FILES_DIR)
    (static_dir / "violations").mkdir(parents=True, exist_ok=True)
    (static_dir / "accidents").mkdir(parents=True, exist_ok=True)

    yield
    # ── Shutdown ───────────────────────────────────────────────────────────


app = FastAPI(
    title="Traffic Violation Detection System",
    description="Real-time traffic violation detection with ANPR, congestion optimization, and live dashboard.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files ───────────────────────────────────────────────────────────
app.mount(
    "/static",
    StaticFiles(directory=settings.STATIC_FILES_DIR),
    name="static",
)

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(violations.router)
app.include_router(anpr.router)
app.include_router(vehicles.router)
app.include_router(accidents.router)
app.include_router(signals.router)
app.include_router(optimization.router)


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "version": "1.0.0"}
