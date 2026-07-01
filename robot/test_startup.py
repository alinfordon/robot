#!/usr/bin/env python3
"""Diagnostic pornire ROBO_V1 — ruleaza pe Pi inainte de systemctl start.

    cd ~/robot/robot
    venv/bin/python test_startup.py
"""

from __future__ import annotations

import os
import sys
import traceback

STEPS = [
    ("config", "import config"),
    ("gpio", "from utils.gpio import HAS_GPIO"),
    ("proximity", "from senses.proximity import ProximitySensors"),
    ("motors", "from actuators.motors import MotorController"),
    ("encoders", "from senses.encoders import WheelEncoders"),
    ("display", "from actuators.display import RobotDisplay"),
    ("vision", "from senses.vision import VisionSystem"),
    ("hearing", "from senses.hearing import HearingSystem"),
    ("main", "import main"),
]


def run_step(name: str, code: str) -> bool:
    print(f"\n=== {name} ===")
    try:
        exec(code, {"__name__": "__main__"})
        print(f"[OK] {name}")
        return True
    except Exception as exc:
        print(f"[FAIL] {name}: {exc}")
        traceback.print_exc()
        return False


def main() -> int:
    print("ROBO_V1 startup diagnostic")
    print(f"Python: {sys.version}")
    print(f"CWD: {os.getcwd()}")

    failed = []
    for name, code in STEPS:
        if not run_step(name, code):
            failed.append(name)

    print("\n=== Init RoboV1 (fara asyncio) ===")
    try:
        import config

        from actuators.motors import MotorController
        from senses.encoders import WheelEncoders
        from senses.proximity import ProximitySensors

        prox = ProximitySensors()
        motors = MotorController(proximity_check=prox.is_clear)
        enc = WheelEncoders(motor_sign=motors.wheel_signs)
        print(
            "[OK] hardware init: "
            f"US active={prox.active_names()} "
            f"encoders={enc.active_names()}"
        )
    except Exception as exc:
        print(f"[FAIL] init: {exc}")
        traceback.print_exc()
        failed.append("init")

    if failed:
        print(f"\nEsuat la: {', '.join(failed)}")
        return 1

    print("\nToate verificarile au trecut. Incearca: venv/bin/python main.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
