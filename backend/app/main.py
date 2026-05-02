import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database.connection import create_tables, SessionLocal
from app.database.init_db import init_db
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

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────
    create_tables()
    
    # Initialize database with default users
    db = SessionLocal()
    try:
        init_db(db)
    finally:
        db.close()
    
    aggregator.set_event_loop(asyncio.get_event_loop())

    static_dir = Path(settings.STATIC_FILES_DIR)
    (static_dir / "violations").mkdir(parents=True, exist_ok=True)
    (static_dir / "accidents").mkdir(parents=True, exist_ok=True)

    yield
    # ── Shutdown ──────────────────────────────────────────────────────────


app = FastAPI(
    title="Traffic Violation Detection System",
    description="Real-time traffic violation detection with ANPR, congestion optimization, and live dashboard.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files ──────────────────────────────────────────────────────
app.mount(
    "/static",
    StaticFiles(directory=settings.STATIC_FILES_DIR),
    name="static",
)

# ── Routers ───────────────────────────────────────────────────────────
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


def _mjpeg_generator() -> bytes:
    source = settings.VIDEO_SOURCE
    # Try integer index first (webcam), else treat as file path
    cap_source: int | str = int(source) if source.isdigit() else source
    cap = cv2.VideoCapture(cap_source)
    if not cap.isOpened():
        logger.warning("MJPEG stream: cannot open video source %s", source)
        return
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                # Loop back to start for recorded video files
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = cap.read()
                if not ok:
                    break
            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
            )
    finally:
        cap.release()


@app.get("/video/stream", tags=["system"])
def video_stream() -> StreamingResponse:
    return StreamingResponse(
        _mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
