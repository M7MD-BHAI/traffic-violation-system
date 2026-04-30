from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./traffic_fyp.db"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    YOLO_PRIMARY_MODEL_PATH: str = "models/yolov8n.pt"
    YOLO_HELMET_MODEL_PATH: str = "models/helmet_detector.pt"
    YOLO_PLATE_MODEL_PATH: str = "models/plate_detector.pt"

    STATIC_FILES_DIR: str = "backend/app/static"
    VIDEO_SOURCE: str = "data/test_videos/test.mp4"
    SPEED_LIMIT_KMH: float = 50.0
    ANPR_CONFIDENCE_THRESHOLD: float = 0.40
    BACKEND_URL: str = "http://localhost:8000"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
