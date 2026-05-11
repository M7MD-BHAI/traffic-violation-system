"""
Standalone recalibration script.

Run this any time you want to re-draw the stop line or signal ROI:

    python -m backend.app.utils.line_selector

A window will open with the first frame of the configured video source.
Click 2 points for the stop line (RED), then 2 points for the signal ROI
(ORANGE), then press ENTER. The updated config is saved and the old one
is overwritten.
"""

import json
import sys
from pathlib import Path

# Allow running as  python -m backend.app.utils.line_selector
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from app.config import settings  # noqa: E402
from app.detection.violations.red_light import CalibrationTool  # noqa: E402

CONFIG_PATH = "calibration_config.json"


def main() -> None:
    source = settings.VIDEO_SOURCE
    cap_source: str | int = int(source) if source.isdigit() else source

    print("=" * 60)
    print("  STOP LINE + SIGNAL ROI CALIBRATION")
    print("=" * 60)
    print(f"  Video source : {source}")
    print(f"  Config file  : {CONFIG_PATH}")
    print()
    print("  Instructions:")
    print("    Clicks 1-2  → stop line (RED)   — the line cars must not cross")
    print("    Clicks 3-4  → signal ROI (ORANGE) — where the traffic light is")
    print("    ENTER       → save and exit")
    print("    ESC         → redo from scratch")
    print("=" * 60)

    tool = CalibrationTool()
    tool.run(str(cap_source))
    cfg = tool.save_config(CONFIG_PATH)

    print()
    print("Saved config:")
    print(json.dumps(cfg, indent=2))
    print()
    print("Restart the backend to apply the new calibration.")


if __name__ == "__main__":
    main()
