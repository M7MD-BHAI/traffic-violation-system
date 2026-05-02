import asyncio
import logging
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

from app.crud.anpr import (
    find_violation_id_by_track,
    get_plate_by_track,
    save_plate_result,
)
from app.crud.violations import update_violation_plate
from app.database.connection import SessionLocal

logger = logging.getLogger(__name__)

_CONFIDENCE_THRESHOLD = 0.40
_OCR_ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
_NEXT_CAMERA_MSG = "Plate unreadable. Monitor next camera on {road_id}."


class ANPR_Service:
    """
    M7 — Automatic Number Plate Recognition.

    Completely idle between violations. Triggered only by M1/M2/M3.
    All inference runs inside a ThreadPoolExecutor — the 30 FPS main loop
    is never blocked.

    Pipeline per trigger:
      1. Crop vehicle from frame using bbox
      2. Run plate YOLO on vehicle crop → plate bbox
         (fallback: bottom-third crop if model unavailable)
      3. Upscale plate crop 2× + Otsu threshold
      4. EasyOCR with alphanumeric allowlist
      5. Evaluate confidence → assign status
      6. Cache result by track_id, persist to DB
    """

    def __init__(
        self,
        plate_model_path: str,
        ocr_languages: list[str],
        max_workers: int,
    ) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._cache: dict[int, dict] = {}

        # Plate YOLO model — soft dependency (fallback if missing)
        self._plate_model = None
        try:
            from app.detection.yolo_loader import get_plate_model  # noqa: PLC0415
            self._plate_model = get_plate_model()
            logger.info("Plate YOLO model loaded via singleton.")
        except FileNotFoundError as exc:
            logger.warning("Plate model not found — using bottom-third fallback crop: %s", exc)
        except Exception as exc:
            logger.warning("Could not load plate model: %s — using fallback.", exc)

        # EasyOCR reader — initialised once, reused across all requests
        import easyocr  # noqa: PLC0415
        self._reader = easyocr.Reader(ocr_languages, gpu=False)

    # ── Public interface ───────────────────────────────────────────────────

    def trigger(
        self,
        frame: np.ndarray,
        bbox: list,
        track_id: int,
        callback: object = None,
        violation_id: int | None = None,
        road_id: str = "unknown",
    ) -> Future:
        """
        Fire-and-forget. Returns a Future immediately; never blocks the caller.
        Same track_id is never re-processed — cached result returned as a
        resolved future instead.
        """
        if track_id in self._cache:
            future: Future = self._executor.submit(lambda: self._cache[track_id])
            return future

        # Snapshot the frame slice now — avoids race if the array is mutated
        x1, y1, x2, y2 = (int(v) for v in bbox)
        frame_copy = frame[max(0, y1):y2, max(0, x1):x2].copy()

        future = self._executor.submit(
            self._process, frame_copy, bbox, track_id, violation_id, road_id
        )

        if callback is not None:
            future.add_done_callback(
                lambda f: callback(f.result()) if not f.exception() else None
            )

        return future

    async def process_async(
        self,
        frame: np.ndarray,
        bbox: list,
        track_id: int,
        road_id: str = "unknown",
    ) -> dict:
        """Awaitable entry point — wraps the sync pipeline in the executor."""
        loop = asyncio.get_event_loop()
        x1, y1, x2, y2 = (int(v) for v in bbox)
        frame_copy = frame[max(0, y1):y2, max(0, x1):x2].copy()
        return await loop.run_in_executor(
            self._executor,
            self._process,
            frame_copy,
            bbox,
            track_id,
            None,
            road_id,
        )

    def get_cached(self, track_id: int) -> dict | None:
        return self._cache.get(track_id)

    def shutdown(self) -> None:
        self._executor.shutdown(wait=True)

    # ── Core pipeline (runs inside ThreadPoolExecutor) ─────────────────────

    def _process(
        self,
        vehicle_crop: np.ndarray,
        bbox: list,
        track_id: int,
        violation_id: int | None,
        road_id: str,
    ) -> dict:
        timestamp = datetime.now(timezone.utc)

        # ── Step 1: validate crop ──────────────────────────────────────────
        if vehicle_crop.size == 0:
            result = self._make_result(track_id, None, 0.0, "empty_crop", None, timestamp)
            self._cache[track_id] = result
            return result

        # ── Step 2: detect plate region ────────────────────────────────────
        plate_crop = self._detect_plate(vehicle_crop)

        if plate_crop is None or plate_crop.size == 0:
            msg = _NEXT_CAMERA_MSG.format(road_id=road_id)
            result = self._make_result(
                track_id, None, 0.0, "plate_not_visible", msg, timestamp
            )
            self._cache[track_id] = result
            self._persist(result, violation_id)
            return result

        # ── Step 3: upscale 2× + Otsu threshold ───────────────────────────
        h, w = plate_crop.shape[:2]
        upscaled = cv2.resize(plate_crop, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        gray = cv2.cvtColor(upscaled, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        ocr_input = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

        # ── Step 4: EasyOCR with alphanumeric allowlist ───────────────────
        try:
            detections = self._reader.readtext(
                ocr_input,
                allowlist=_OCR_ALLOWLIST,
                detail=1,
            )
        except Exception as exc:
            logger.error("EasyOCR failed for track_id=%d: %s", track_id, exc)
            result = self._make_result(track_id, None, 0.0, "ocr_failed", None, timestamp)
            self._cache[track_id] = result
            self._persist(result, violation_id)
            return result

        if not detections:
            msg = _NEXT_CAMERA_MSG.format(road_id=road_id)
            result = self._make_result(
                track_id, None, 0.0, "plate_not_visible", msg, timestamp
            )
            self._cache[track_id] = result
            self._persist(result, violation_id)
            return result

        # ── Step 5: evaluate best detection ───────────────────────────────
        # detections: list of (bbox, text, confidence)
        best = max(detections, key=lambda d: d[2])
        plate_text = best[1].strip().upper()
        confidence = float(best[2])

        if confidence < _CONFIDENCE_THRESHOLD:
            msg = _NEXT_CAMERA_MSG.format(road_id=road_id)
            result = self._make_result(
                track_id, plate_text, confidence, "plate_not_visible", msg, timestamp
            )
        else:
            result = self._make_result(track_id, plate_text, confidence, "ok", None, timestamp)

        self._cache[track_id] = result
        self._persist(result, violation_id)
        return result

    # ── Private helpers ────────────────────────────────────────────────────

    def _detect_plate(self, vehicle_crop: np.ndarray) -> np.ndarray | None:
        """
        Run plate YOLO on the vehicle crop.
        Falls back to the bottom-third of the crop when the model is unavailable.
        """
        if self._plate_model is None:
            h = vehicle_crop.shape[0]
            fallback = vehicle_crop[2 * h // 3 :, :]
            return fallback if fallback.size > 0 else None

        try:
            results = self._plate_model(vehicle_crop, verbose=False)
            if not results or results[0].boxes is None or len(results[0].boxes) == 0:
                return None
            best_box = max(results[0].boxes, key=lambda b: float(b.conf[0]))
            x1, y1, x2, y2 = (int(v) for v in best_box.xyxy[0])
            plate_crop = vehicle_crop[y1:y2, x1:x2]
            return plate_crop if plate_crop.size > 0 else None
        except Exception as exc:
            logger.warning("Plate YOLO inference failed: %s — using fallback.", exc)
            h = vehicle_crop.shape[0]
            return vehicle_crop[2 * h // 3 :, :]

    @staticmethod
    def _make_result(
        track_id: int,
        plate_text: str | None,
        confidence: float,
        status: str,
        message: str | None,
        timestamp: datetime,
    ) -> dict:
        return {
            "track_id":         track_id,
            "plate_text":       plate_text,
            "confidence_score": round(confidence, 4),
            "timestamp":        timestamp.isoformat(),
            "status":           status,
            "message":          message,
        }

    def _persist(self, result: dict, violation_id: int | None) -> None:
        """
        Save PlateResult row and update the parent Violation with plate_text.
        If violation_id was not passed, looks it up by track_id.
        """
        db = SessionLocal()
        try:
            vid = violation_id
            if vid is None:
                vid = find_violation_id_by_track(db, result["track_id"])

            if vid is None:
                logger.warning(
                    "No violation record found for track_id=%d — plate result not linked.",
                    result["track_id"],
                )
                return

            save_plate_result(
                db,
                violation_id=vid,
                track_id=result["track_id"],
                plate_text=result["plate_text"],
                confidence_score=result["confidence_score"],
                status=result["status"],
                message=result["message"],
                timestamp=datetime.fromisoformat(result["timestamp"]),
            )

            update_violation_plate(
                db,
                violation_id=vid,
                plate_text=result["plate_text"],
                plate_status=result["status"],
                confidence_score=result["confidence_score"],
            )
        except Exception as exc:
            logger.error(
                "DB persist failed for ANPR result track_id=%d: %s",
                result["track_id"], exc,
            )
        finally:
            db.close()
