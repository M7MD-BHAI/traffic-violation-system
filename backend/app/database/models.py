from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="operator")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())


class Violation(Base):
    __tablename__ = "violations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    violation_type: Mapped[str] = mapped_column(String(20), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(nullable=False)
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    plate_text: Mapped[str | None] = mapped_column(String(20), nullable=True)
    plate_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    bbox: Mapped[list | None] = mapped_column(JSON, nullable=True)
    road_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    frame_idx: Mapped[int | None] = mapped_column(Integer, nullable=True)
    merged_with: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("violations.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=func.now())

    plate_result: Mapped["PlateResult | None"] = relationship(
        "PlateResult", back_populates="violation", uselist=False
    )
    merged_violation: Mapped["Violation | None"] = relationship(
        "Violation", remote_side="Violation.id"
    )


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    class_name: Mapped[str] = mapped_column(String(30), nullable=False)
    class_group: Mapped[str] = mapped_column(String(10), nullable=False)
    first_seen: Mapped[datetime] = mapped_column(nullable=False)
    last_seen: Mapped[datetime] = mapped_column(nullable=False)


class CountingReport(Base):
    __tablename__ = "counting_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(nullable=False)
    interval_minutes: Mapped[int] = mapped_column(Integer, default=1)
    car_count: Mapped[int] = mapped_column(Integer, default=0)
    motorcycle_count: Mapped[int] = mapped_column(Integer, default=0)
    bus_count: Mapped[int] = mapped_column(Integer, default=0)
    truck_count: Mapped[int] = mapped_column(Integer, default=0)
    total_small: Mapped[int] = mapped_column(Integer, default=0)
    total_medium: Mapped[int] = mapped_column(Integer, default=0)
    total_heavy: Mapped[int] = mapped_column(Integer, default=0)


class Accident(Base):
    __tablename__ = "accidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_type: Mapped[str] = mapped_column(String(20), nullable=False)
    track_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(nullable=False)
    road_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    clip_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bbox: Mapped[list | None] = mapped_column(JSON, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=func.now())


class PlateResult(Base):
    __tablename__ = "plate_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    violation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("violations.id"), nullable=False
    )
    track_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    plate_text: Mapped[str | None] = mapped_column(String(20), nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(nullable=False)

    violation: Mapped["Violation"] = relationship(
        "Violation", back_populates="plate_result"
    )


class CongestionSnapshot(Base):
    __tablename__ = "congestion_snapshots"
    __table_args__ = (Index("ix_congestion_snapshots_road_id", "road_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    road_id: Mapped[str] = mapped_column(String(50), nullable=False)
    density_index: Mapped[int] = mapped_column(Integer, nullable=False)
    vehicle_count: Mapped[int] = mapped_column(Integer, nullable=False)
    stagnant_count: Mapped[int] = mapped_column(Integer, default=0)
    timestamp: Mapped[datetime] = mapped_column(nullable=False)
