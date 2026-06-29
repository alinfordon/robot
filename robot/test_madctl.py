#!/usr/bin/env python3
"""Test orientare display (MADCTL) pentru panouri ST7789V / ILI9341 240x320.

Deseneaza un model usor de interpretat si cicleaza prin valorile MADCTL uzuale.
Pentru fiecare valoare se afiseaza pe ecran hex-ul curent ~3 secunde.

Cauti valoarea la care:
  - bara ROSIE "TOP" e sus,
  - bara ALBASTRA e pe stanga,
  - colturile sunt etichetate corect (TL stanga-sus, BR dreapta-jos),
  - chenarul verde se vede pe toate cele 4 laturi (umple tot ecranul),
  - NU exista banda de zgomot in dreapta/jos,
  - textul NU e in oglinda.

Utilizare:
    python3 test_madctl.py             # cicleaza lista de valori
    python3 test_madctl.py 0x48        # testeaza o singura valoare
    python3 test_madctl.py 0x48 320 240  # forteaza si W H (landscape)
"""

import sys
import time

import config

# Valori MADCTL uzuale (portret + landscape, RGB/BGR, flip-uri)
MADCTL_LIST = [0x00, 0x08, 0x40, 0x48, 0x80, 0x88, 0xC0, 0xC8,
               0x20, 0x28, 0x60, 0x68, 0xA0, 0xA8, 0xE0, 0xE8]


def _build_disp(width, height):
    import st7789

    disp = st7789.ST7789(
        port=0,
        cs=getattr(config, "TFT_SPI_CS", 0),
        dc=config.TFT_DC,
        rst=config.TFT_RST,
        backlight=config.TFT_BL,
        width=width,
        height=height,
        rotation=0,
        spi_speed_hz=config.TFT_SPI_SPEED,
        invert=getattr(config, "TFT_INVERT", True),
    )
    mode = getattr(config, "TFT_SPI_MODE", 3)
    if mode is not None:
        disp._spi.mode = mode
        disp.reset()
        disp._init()
    return disp


def _draw(disp, Image, ImageDraw, ImageFont, W, H, label):
    img = Image.new("RGB", (W, H), (12, 14, 30))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22
        )
        small = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14
        )
    except Exception:
        font = small = ImageFont.load_default()

    # Chenar verde pe tot ecranul
    d.rectangle((0, 0, W - 1, H - 1), outline=(0, 255, 0), width=3)
    # Bara rosie SUS
    d.rectangle((0, 0, W - 1, 26), fill=(255, 0, 0))
    d.text((6, 5), "TOP", font=small, fill=(255, 255, 255))
    # Bara albastra STANGA
    d.rectangle((0, 0, 26, H - 1), fill=(0, 80, 255))
    # Colturi
    d.text((30, 30), "TL", font=small, fill=(255, 255, 0))
    d.text((W - 30, 30), "TR", font=small, fill=(255, 255, 0))
    d.text((30, H - 22), "BL", font=small, fill=(255, 255, 0))
    d.text((W - 30, H - 22), "BR", font=small, fill=(255, 255, 0))
    # Eticheta centrala (valoarea MADCTL)
    d.text((W // 2 - 34, H // 2 - 12), label, font=font, fill=(255, 255, 255))
    d.text((W // 2 - 40, H // 2 + 14), f"{W}x{H}", font=small, fill=(180, 180, 180))

    out = img
    if getattr(config, "TFT_BGR", True):
        r, g, b = img.split()
        out = Image.merge("RGB", (b, g, r))
    disp.display(out)


def main():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as e:
        print(f"[EROARE] Lipsa Pillow: {e}")
        return

    # Argumente: [madctl] [W H]
    single = None
    W, H = config.TFT_WIDTH, config.TFT_HEIGHT
    args = sys.argv[1:]
    if len(args) >= 1:
        single = int(args[0], 16) if args[0].lower().startswith("0x") else int(args[0])
    if len(args) >= 3:
        W, H = int(args[1]), int(args[2])

    values = [single] if single is not None else MADCTL_LIST

    try:
        disp = _build_disp(W, H)
    except Exception as e:
        import traceback

        print(f"[EROARE] Init display esuat: {e}")
        traceback.print_exc()
        return

    print(f"Buffer {W}x{H}. Trec prin {len(values)} valori MADCTL.")
    print("Noteaza-ti hex-ul la care arata corect (TOP sus, fara zgomot, umple tot).")
    try:
        for v in values:
            label = f"0x{v:02X}"
            print(f"  -> MADCTL {label}")
            try:
                disp.command(0x36)  # MADCTL
                disp.data(v)
                _draw(disp, Image, ImageDraw, ImageFont, W, H, label)
            except Exception as e:
                print(f"     esuat: {e}")
            time.sleep(3.0 if single is None else 6.0)
    except KeyboardInterrupt:
        print("\nOprit.")

    print("Gata. Spune-mi la ce valoare arata corect.")


if __name__ == "__main__":
    main()
