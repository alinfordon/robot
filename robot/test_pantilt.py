#!/usr/bin/env python3
"""Test pan & tilt (PCA9685) — ruleaza cu robotul OPRIT.

    cd /home/robot
    sudo systemctl stop robot
    venv/bin/python test_pantilt.py

Daca placa nu apare, verifica intai adresa: i2cdetect -y 1
"""

from __future__ import annotations

import time

import config
from actuators.pantilt import PanTilt


def _wiring() -> str:
    return (
        f"  I2C{config.PCA9685_I2C_BUS} @ 0x{config.PCA9685_ADDRESS:02X}, "
        f"{config.PCA9685_PWM_FREQ} Hz\n"
        f"  Pan  = canal {config.PANTILT_PAN_CHANNEL}  "
        f"({config.PANTILT_PAN_MIN_DEG:.0f}..{config.PANTILT_PAN_MAX_DEG:.0f}°)\n"
        f"  Tilt = canal {config.PANTILT_TILT_CHANNEL}  "
        f"({config.PANTILT_TILT_MIN_DEG:.0f}..{config.PANTILT_TILT_MAX_DEG:.0f}°)\n"
        f"  Impuls {config.PANTILT_PULSE_MIN_US}-{config.PANTILT_PULSE_MAX_US} us"
    )


def _step(head: PanTilt, label: str, **kwargs) -> None:
    print(f"\n>>> {label}")
    state = head.set_angles(**kwargs)
    print(f"    pan={state['pan']}°  tilt={state['tilt']}°")
    time.sleep(1.0)


def main() -> int:
    if config.MOCK_HARDWARE:
        print("MOCK_HARDWARE=1 — nu se comanda hardware real.")
        return 1
    if not config.PANTILT_ENABLED:
        print("PANTILT_ENABLED=0 — activeaza in .env inainte de test.")
        return 1

    print("=== Test pan & tilt PCA9685 ===")
    print(_wiring())
    print(
        "\nVerificari inainte de pornire:\n"
        "  • Servourile alimentate pe V+ (5V/2A), NU din 3.3V al Pi\n"
        "  • GND comun Pi ↔ PCA9685 ↔ sursa servo\n"
        "  • Camera libera sa se roteasca (fara fire intinse)\n"
    )

    head = PanTilt()
    if not head.available:
        print("EROARE: PCA9685 negasit. Ruleaza `i2cdetect -y 1` si verifica adresa.")
        return 1

    try:
        input("ENTER pentru centrare... ")
        _step(head, "CENTRU", pan=config.PANTILT_PAN_CENTER_DEG,
              tilt=config.PANTILT_TILT_CENTER_DEG)

        input("ENTER pentru baleiaj PAN (stanga -> dreapta)... ")
        _step(head, "PAN minim", pan=config.PANTILT_PAN_MIN_DEG)
        _step(head, "PAN maxim", pan=config.PANTILT_PAN_MAX_DEG)
        _step(head, "PAN centru", pan=config.PANTILT_PAN_CENTER_DEG)

        input("ENTER pentru baleiaj TILT (jos -> sus)... ")
        _step(head, "TILT minim", tilt=config.PANTILT_TILT_MIN_DEG)
        _step(head, "TILT maxim", tilt=config.PANTILT_TILT_MAX_DEG)
        _step(head, "TILT centru", tilt=config.PANTILT_TILT_CENTER_DEG)

        input("ENTER pentru test pas relativ (look)... ")
        for direction in ("left", "right", "up", "down", "center"):
            state = head.look(direction)
            print(f"    look({direction}): pan={state['pan']}° tilt={state['tilt']}°")
            time.sleep(0.8)

        print("\n=== Interpretare ===")
        print("  Axa se misca invers      -> PANTILT_PAN_INVERT / PANTILT_TILT_INVERT=1")
        print("  Servo bate in capat/zbarnaie -> ingusteaza limitele MIN/MAX_DEG")
        print("  Cursa prea mica/mare     -> calibreaza PANTILT_PULSE_MIN_US/MAX_US")
        print("  Se misca amandoua la fel -> canalele PAN/TILT sunt inversate")
    except KeyboardInterrupt:
        print("\nOprit.")
    finally:
        head.cleanup()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
