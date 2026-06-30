#!/usr/bin/env python3
"""Test senzor ultrasonic fata (HC-SR04 pe GPIO5/GPIO6).

Ruleaza cu robotul OPRIT:
  sudo systemctl stop robot
  ~/robot/robot/venv/bin/python3 test_us_front.py
"""

import time

import config
from senses.proximity import ProximitySensors


def main():
    print("US_ACTIVE:", config.US_ACTIVE)
    print("Pin fata: TRIG=GPIO%d  ECHO=GPIO%d" % (config.US_FRONT_TRIG, config.US_FRONT_ECHO))
    print("(Opreste serviciul robot inainte de test)\n")

    p = ProximitySensors()
    if not p._has_gpio:
        print("[EROARE] GPIO neinitializat.")
        print("Verifica: sudo systemctl stop robot")
        print("          gpioinfo gpiochip4 | grep -E 'line\\s+5:|line\\s+6:'")
        return 1

    p.start()
    print("Citiri (misca obiectul in fata senzorului):\n")
    try:
        for i in range(20):
            d = p.get_readings().get("front", 999)
            bar = "#" * max(0, min(40, int(200 / max(d, 1))))
            print(f"  front: {d:6.1f} cm  {bar}")
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        p.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
