#!/usr/bin/env python3
"""Diagnostic avansat pentru ST7789V 240x320 generic (ecran gol).

Incearca mai multe variante si se opreste cu pauza la fiecare, ca sa vezi
CARE aprinde / afiseaza ceva pe ecran.

    cd ~/robot
    sudo systemctl stop robot
    venv/bin/python test_display2.py
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402

from PIL import Image  # noqa: E402
import st7789  # noqa: E402

CS = getattr(config, "TFT_SPI_CS", 0)
DC = config.TFT_DC
RST = config.TFT_RST
BL = config.TFT_BL
SPEED = config.TFT_SPI_SPEED


def make_disp(**extra):
    return st7789.ST7789(
        port=0, cs=CS, dc=DC, rst=RST, backlight=BL,
        width=240, height=320, rotation=0, spi_speed_hz=SPEED, **extra
    )


def show(disp, color, secs=6):
    disp.display(Image.new("RGB", (240, 320), color))
    time.sleep(secs)


def attempt(name, **extra):
    print(f"\n=== {name} ===")
    try:
        d = make_disp(**extra)
        try:
            d.set_backlight(1)
            print("  set_backlight(1) OK")
        except Exception as e:
            print(f"  set_backlight indisponibil: {e}")
        print("  -> ALB 6s (uita-te la ecran)")
        show(d, (255, 255, 255))
        print("  -> ROSU 4s")
        show(d, (255, 0, 0), 4)
        return d
    except Exception as e:
        print(f"  [EROARE] {e}")
        return None


if __name__ == "__main__":
    print(f"Pini: CS(idx)={CS} DC={DC} RST={RST} BL={BL} @ {SPEED}Hz")

    # 1. Backlight separat, ca sa vedem daca panoul se lumineaza deloc
    print("\n=== BACKLIGHT direct (GPIO15) ===")
    try:
        d0 = make_disp()
        d0.set_backlight(1)
        print("  Backlight ON 6s - vezi o lumina alba slaba pe panou?")
        time.sleep(6)
    except Exception as e:
        print(f"  [EROARE] {e}")

    # 2. Init implicit
    attempt("VARIANTA A: init implicit")

    # 3. SPI mode 3 (multe panouri ST7789V au nevoie de mode 3)
    d = attempt("VARIANTA B: SPI mode 3")
    if d is not None:
        try:
            d._spi.mode = 3
            d.reset()
            d._init()
            d.set_backlight(1)
            show(d, (0, 255, 0))
        except Exception as e:
            print(f"  mode3 manual esuat: {e}")

    # 4. invert=False
    attempt("VARIANTA C: invert=False", invert=False)

    # 5. offset (unele panouri 240x320 au offset)
    attempt("VARIANTA D: offset_left/top variabil", offset_left=0, offset_top=0)

    print("\nGata. Spune-mi care varianta a afisat ceva (sau lumina backlight).")
