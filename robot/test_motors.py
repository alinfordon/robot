#!/usr/bin/env python3
"""Test motoare L298N — ruleaza cu robotul OPRIT.

    cd /home/robot
    sudo systemctl stop robot
    venv/bin/python test_motors.py

Testeaza fiecare canal separat ca sa vezi daca problema e hardware sau software.
"""

from __future__ import annotations

import sys
import time

import config
from actuators.motors import MotorController
from utils.gpio import cleanup_all


def _pin_table() -> str:
    return (
        f"  Stanga: IN1=GPIO{config.MOTOR_LEFT_IN1}  IN2=GPIO{config.MOTOR_LEFT_IN2}  "
        f"ENA=GPIO{config.MOTOR_LEFT_ENA}\n"
        f"  Dreapta: IN3=GPIO{config.MOTOR_RIGHT_IN3}  IN4=GPIO{config.MOTOR_RIGHT_IN4}  "
        f"ENB=GPIO{config.MOTOR_RIGHT_ENB}"
    )


def _run_step(motors: MotorController, label: str, left: float, right: float, secs: float = 2.0) -> None:
    print(f"\n>>> {label}  (L={left:.0f}%  R={right:.0f}%) — {secs:.0f}s")
    print("    Uitati-va care roata se invarte...")
    motors.set_speed(left, right)
    time.sleep(secs)
    motors.stop()
    time.sleep(0.5)


def main() -> int:
    if config.MOCK_HARDWARE:
        print("MOCK_HARDWARE=1 — nu se comanda hardware real.")
        return 1

    print("=== Test motoare L298N ===")
    print(_pin_table())
    print(
        "\nVerificati pe modul L298N:\n"
        "  • Jumper ENA/ENB: daca e scos, firul ENA trebuie pe GPIO18, ENB pe GPIO24\n"
        "  • Motor stanga pe OUT1/OUT2, motor dreapta pe OUT3/OUT4\n"
        "  • GND comun RPi ↔ L298N\n"
    )

    motors = MotorController()
    if not motors._initialized:
        print("EROARE: motoarele nu s-au initializat (GPIO/PWM).")
        return 1

    try:
        input("Apasa ENTER pentru test roata STANGA (dreapta oprit)... ")
        _run_step(motors, "Doar STANGA", 65, 0)

        input("Apasa ENTER pentru test roata DREAPTA (stanga oprit)... ")
        _run_step(motors, "Doar DREAPTA", 0, 65)

        input("Apasa ENTER pentru test INAINTE (ambele)... ")
        _run_step(motors, "INAINTE", 65, 65)

        input("Apasa ENTER pentru test INVERS (ambele)... ")
        _run_step(motors, "INVERS", -65, -65)

        print("\n=== Interpretare ===")
        print("  STANGA nu merge, DREAPTA da  -> cablaj/canale OUT1/OUT2 sau ENA (GPIO18)")
        print("  DREAPTA nu merge, STANGA da  -> OUT3/OUT4 sau ENB (GPIO24)")
        print("  Ambele merg aici, dashboard nu -> update cod + mod MANUAL")
        print("  Niciuna nu merge              -> alimentare L298N / GND / driver ars")
    except KeyboardInterrupt:
        print("\nOprit.")
    finally:
        motors.cleanup()
        cleanup_all()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
