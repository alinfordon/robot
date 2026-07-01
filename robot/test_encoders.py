#!/usr/bin/env python3
"""Test live encodere OKY3278 — ruleaza cu robotul OPRIT.

    cd /home/robot
    sudo systemctl stop robot
    venv/bin/python test_encoders.py

Invarte manual fiecare roata si verifica ca numarul de impulsuri creste.
"""

from __future__ import annotations

import sys
import time

import config
from utils.gpio import GPIO, HAS_GPIO, setup_pin


def level_str(v: int | None) -> str:
    if v is None:
        return "?"
    return "HIGH" if v else "LOW"


def main() -> int:
    if not HAS_GPIO:
        print("GPIO indisponibil (MOCK_HARDWARE=1?)")
        return 1

    pins = {"left": config.ENCODER_LEFT, "right": config.ENCODER_RIGHT}
    edges = {
        "left": getattr(config, "ENCODER_EDGE_LEFT", "falling"),
        "right": getattr(config, "ENCODER_EDGE_RIGHT", "falling"),
    }

    print("=== Test encodere OKY3278 ===")
    for side, pin in pins.items():
        print(f"  {side:5} -> GPIO{pin}  edge={edges[side]}")

    last: dict[str, int] = {}
    counts: dict[str, int] = {"left": 0, "right": 0}
    changes: dict[str, int] = {"left": 0, "right": 0}

    for side, pin in pins.items():
        setup_pin(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        last[side] = GPIO.input(pin)
        print(f"Init {side} GPIO{pin}: {level_str(last[side])}")

    print("\nInvarte roata stanga, apoi dreapta (Ctrl+C opreste).\n")
    print(f"{'t':>6}  {'L pin':>5} {'L +':>5} {'R pin':>5} {'R +':>5}")
    t0 = time.monotonic()
    next_print = t0

    try:
        while True:
            for side, pin in pins.items():
                cur = GPIO.input(pin)
                prev = last[side]
                if cur != prev:
                    changes[side] += 1
                    mode = edges[side]
                    pulse = False
                    if mode == "both":
                        pulse = True
                    elif mode == "rising":
                        pulse = prev == GPIO.LOW and cur == GPIO.HIGH
                    else:
                        pulse = prev == GPIO.HIGH and cur == GPIO.LOW
                    if pulse:
                        counts[side] += 1
                    last[side] = cur

            now = time.monotonic()
            if now >= next_print:
                elapsed = now - t0
                print(
                    f"{elapsed:6.1f}s  "
                    f"{level_str(last['left']):>5} {counts['left']:5d} "
                    f"{level_str(last['right']):>5} {counts['right']:5d}",
                    end="\r",
                )
                next_print = now + 0.5
            time.sleep(0.001)
    except KeyboardInterrupt:
        print("\n\n=== Rezultat ===")
        for side in ("left", "right"):
            pin = pins[side]
            stuck = changes[side] == 0
            print(
                f"{side}: GPIO{pin} impulsuri={counts[side]} tranzitii={changes[side]} "
                f"nivel={level_str(last[side])}"
                + ("  <- PIN BLOCAT (verifica cablaj/senzor)" if stuck else "")
            )
        if counts["left"] > 0 and counts["right"] == 0:
            print(
                "\nSugestii dreapta=0:\n"
                "  1. Verifica OUT senzor -> GPIO16 (pin fizic 36)\n"
                "  2. Aliniere disc in fanta senzorului\n"
                "  3. In .env: ENCODER_EDGE_RIGHT=rising  (logic invers)\n"
                "  4. In .env: ENCODER_RIGHT=20 ENCODER_LEFT=16  (pini inversati)"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
