"""Context senzori pentru AI — snapshot la momentul intrebarii."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import config

if TYPE_CHECKING:
    from senses.encoders import WheelEncoders
    from senses.proximity import ProximitySensors
    from senses.vision import VisionSystem
    from utils.state import RobotContext


def build_robot_context(
    proximity: "ProximitySensors",
    encoders: "WheelEncoders",
    vision: "VisionSystem | None",
    ctx: "RobotContext",
    metrics: dict | None = None,
) -> dict[str, Any]:
    readings = proximity.get_readings()
    enc_snap = encoders.get_snapshot()

    return {
        "sensors": {
            "front": readings.get("front", 999.0),
            "left": readings.get("left", 999.0),
            "right": readings.get("right", 999.0),
            "back": readings.get("back", 999.0),
        },
        "sensorMeta": {
            "active": proximity.active_names(),
            "hardware": proximity.has_hardware(),
        },
        "encoders": {
            "left": enc_snap.get("left", {}),
            "right": enc_snap.get("right", {}),
            "speed_cm_s": enc_snap.get("speed_cm_s", 0.0),
        },
        "encoderMeta": {
            "active": enc_snap.get("active", []),
            "hardware": enc_snap.get("hardware", False),
            "ppr": enc_snap.get("ppr", config.ENCODER_PPR),
        },
        "objects": vision.last_objects if vision else [],
        "state": "idle",
        "mode": ctx.mode.value,
        "mood": ctx.mood.value,
        "metrics": metrics,
        "uptime": ctx.uptime(),
        "connected": True,
    }
