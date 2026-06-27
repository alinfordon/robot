#!/usr/bin/env python3
"""Diagnostic ST7789V 240x320 - O SINGURA varianta per rulare (fara busy).

Utilizare (opreste intai serviciul ca sa elibereze pinii):
    cd ~/robot
    sudo systemctl stop robot
    venv/bin/python test_display2.py bl     # doar backlight (panoul se lumineaza?)
    venv/bin/python test_display2.py a      # init implicit
    venv/bin/python test_display2.py b       # SPI mode 3
    venv/bin/python test_display2.py c       # invert=False
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

variant = (sys.argv[1] if len(sys.argv) > 1 else "a").lower()
print(f"Varianta: {variant} | CS(idx)={CS} DC={DC} RST={RST} BL={BL} @ {SPEED}Hz")

extra = {}
if variant == "c":
    extra["invert"] = False

disp = st7789.ST7789(
    port=0, cs=CS, dc=DC, rst=RST, backlight=BL,
    width=240, height=320, rotation=0, spi_speed_hz=SPEED, **extra,
)

try:
    disp.set_backlight(1)
    print("set_backlight(1) OK")
except Exception as e:
    print(f"set_backlight indisponibil: {e}")

if variant == "bl":
    print(">>> Doar BACKLIGHT 10s. Panoul se lumineaza alb slab? (DA/NU)")
    time.sleep(10)
    sys.exit(0)

if variant == "b":
    try:
        disp._spi.mode = 3
        disp.reset()
        disp._init()
        disp.set_backlight(1)
        print("SPI mode 3 aplicat")
    except Exception as e:
        print(f"mode3 esuat: {e}")

for name, color in (("ALB", (255, 255, 255)), ("ROSU", (255, 0, 0)),
                    ("VERDE", (0, 255, 0)), ("ALBASTRU", (0, 0, 255))):
    print(f">>> {name} 5s")
    disp.display(Image.new("RGB", (240, 320), color))
    time.sleep(5)

print("Gata. Ai vazut culorile? (sau backlight aprins fara imagine?)")
