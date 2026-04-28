from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    YOLO_PRIMARY_MODEL_PATH: str
    YOLO_HELMET_MODEL_PATH: str
    YOLO_PLATE_MODEL_PATH: str

    STATIC_FILES_DIR: str
    VIDEO_SOURCE: str
    SPEED_LIMIT_KMH: float = 60.0
    ANPR_CONFIDENCE_THRESHOLD: float = 0.40
    BACKEND_URL: str
    CORS_ORIGINS: str = "http://localhost:5173"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
