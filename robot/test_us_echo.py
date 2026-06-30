#!/usr/bin/env python3
"""Diagnostic hardware HC-SR04 (TRIG/ECHO/divizor).

Ruleaza cu robotul oprit:
  sudo systemctl stop robot
  ~/robot/robot/venv/bin/python3 test_us_echo.py
"""

import time

import config
from utils.gpio import GPIO, HAS_GPIO, cleanup_all, setup_pin

TRIG = config.US_FRONT_TRIG
ECHO = config.US_FRONT_ECHO


def main():
    print(f"TRIG=GPIO{TRIG}  ECHO=GPIO{ECHO}\n")
    if not HAS_GPIO:
        print("[EROARE] RPi.GPIO indisponibil")
        return 1

    try:
        setup_pin(TRIG, GPIO.OUT, initial=GPIO.LOW)
        setup_pin(ECHO, GPIO.IN)
    except Exception as e:
        print(f"[EROARE] setup GPIO: {e}")
        return 1

    idle = GPIO.input(ECHO)
    print(f"1) ECHO idle (fara TRIG): {idle}  ({'LOW OK' if idle == 0 else 'HIGH — verifica divizor/cablaj'})")

    print("\n2) 10 impulsuri TRIG — urmareste daca ECHO trece la 1:")
    hits = 0
    for i in range(10):
        GPIO.output(TRIG, GPIO.LOW)
        time.sleep(0.002)
        GPIO.output(TRIG, GPIO.HIGH)
        time.sleep(0.00002)
        GPIO.output(TRIG, GPIO.LOW)

        saw_high = False
        t0 = time.perf_counter()
        while time.perf_counter() - t0 < 0.05:
            if GPIO.input(ECHO) == GPIO.HIGH:
                saw_high = True
                break
        if saw_high:
            hits += 1
        print(f"   impuls {i + 1}: ECHO={'HIGH (OK)' if saw_high else 'ramane LOW'}")
        time.sleep(0.06)

    print(f"\n   Rezultat: {hits}/10 impulsuri cu raspuns ECHO")
    if hits == 0:
        print(
            "\n[DIAGNOSTIC] ECHO nu raspunde deloc. Verifica:\n"
            "  - VCC senzor la 5V (Pin 2), GND comun\n"
            "  - TRIG pe GPIO5, ECHO prin divizor pe GPIO6 (nu invers)\n"
            "  - Divizor: ECHO --[1k]-- GPIO6 --[2k]-- GND\n"
            "  - Senzor montat cu etichete TRIG/ECHO corecte\n"
            "  - Incearca alt HC-SR04 (unele sunt defecte)"
        )
    else:
        print("\n[OK] ECHO raspunde — ruleaza test_us_front.py din nou.")

    cleanup_all()
    return 0 if hits > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
