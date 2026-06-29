#!/usr/bin/env python3
"""Test functional pentru display-ul TFT ST7789V.

Ruleaza pe Raspberry Pi (cu SPI activat):
    cd ~/robot
    venv/bin/python test_display.py

Etape:
  1. Verifica /dev/spidev si pinii din config.py
  2. Test RAW st7789: umple ecranul cu rosu / verde / albastru
  3. Test RobotDisplay: parcurge toate ecranele (boot, IP, status,
     vorbire, ascultare, gandire, alerta, obiecte)
"""

import glob
import os
import sys
import time
import traceback

# Permite rularea din orice director
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config  # noqa: E402


def step(msg):
    print(f"\n=== {msg} ===")


def check_spi():
    step("1. Verificare SPI + pini")
    dev = "/dev/spidev0.0"
    if os.path.exists(dev):
        print(f"[OK] {dev} exista")
    else:
        print(f"[EROARE] {dev} LIPSESTE - activeaza SPI:")
        print("        echo 'dtparam=spi=on' | sudo tee -a /boot/firmware/config.txt")
        print("        sudo reboot")
    print(
        f"Pini config: CS={config.TFT_CS} DC={config.TFT_DC} RST={config.TFT_RST} "
        f"BL={config.TFT_BL} | {config.TFT_WIDTH}x{config.TFT_HEIGHT} @ "
        f"{config.TFT_SPI_SPEED} Hz  rotation={getattr(config, 'TFT_ROTATION', 0)}"
    )
    chips = sorted(glob.glob("/dev/gpiochip*"))
    print(f"GPIO chips: {chips if chips else 'NICIUNUL'}")
    try:
        import st7789

        print(f"st7789 versiune: {getattr(st7789, '__version__', '?')}")
    except Exception as e:
        print(f"st7789 import esuat: {e}")


def test_raw():
    step("2. Test RAW st7789 (rosu/verde/albastru)")
    try:
        import st7789
        from PIL import Image
    except ImportError as e:
        print(f"[EROARE] Lipsa librarie: {e}")
        print("        venv/bin/pip install st7789 pillow")
        return False

    try:
        disp = st7789.ST7789(
            port=0,
            cs=getattr(config, "TFT_SPI_CS", 0),
            dc=config.TFT_DC,
            rst=config.TFT_RST,
            backlight=config.TFT_BL,
            width=config.TFT_WIDTH,
            height=config.TFT_HEIGHT,
            rotation=getattr(config, "TFT_ROTATION", 0),
            spi_speed_hz=config.TFT_SPI_SPEED,
            invert=getattr(config, "TFT_INVERT", True),
        )
        mode = getattr(config, "TFT_SPI_MODE", 3)
        if mode is not None:
            disp._spi.mode = mode
            disp.reset()
            disp._init()
        madctl = getattr(config, "TFT_MADCTL", 0x00)
        if madctl is not None:
            disp.command(0x36)  # MADCTL: portret real 240x320 (lib hardcodeaza 0x70)
            disp.data(madctl)
    except Exception as e:
        print(f"[EROARE] Init ST7789 esuat: {e}")
        print("--- traceback complet ---")
        traceback.print_exc()
        print("-------------------------")
        return False

    for name, color in (("ROSU", (255, 0, 0)), ("VERDE", (0, 255, 0)), ("ALBASTRU", (0, 0, 255))):
        print(f"  -> {name}")
        img = Image.new("RGB", (config.TFT_WIDTH, config.TFT_HEIGHT), color)
        disp.display(img)
        time.sleep(1.2)
    print("[OK] Daca ai vazut 3 culori, hardware-ul + cablajul sunt corecte.")
    return True


def test_screens():
    step("3. Test ecrane RobotDisplay")
    try:
        from actuators.display import RobotDisplay
    except Exception as e:
        print(f"[EROARE] Import RobotDisplay: {e}")
        return

    d = RobotDisplay()
    if d.disp is None and not config.MOCK_HARDWARE:
        print("[ATENTIE] Display hardware neinitializat (vezi mesajele de mai sus).")

    state = {
        "mood": "talking",
        "mode": "auto",
        "ip": "192.168.0.50",
        "temp": 52.3,
        "cpu": 37.0,
        "ram": 48.0,
        "battery": 82.0,
        "ws_connected": True,
        "sensors": {"front": 45, "left": 80, "right": 18, "back": 120},
        "ai_provider": "ollama",
        "uptime": "00:42:15",
    }

    print("  -> boot + progress")
    d.show_boot()
    for p in range(0, 101, 20):
        d.update_boot_progress(p)
        time.sleep(0.3)

    print("  -> show_ip_qr")
    d.show_ip_qr(state["ip"])
    time.sleep(2)

    print("  -> show_status")
    d.show_status(state)
    time.sleep(3)

    print("  -> show_speech (vorbeste)")
    d.show_speech("Salut! Sunt Ody, robotul tau inteligent.", is_listening=False)
    time.sleep(3)

    print("  -> show_speech (asculta)")
    d.show_speech("", is_listening=True)
    time.sleep(2)

    print("  -> show_ai_thinking")
    d.show_ai_thinking("ollama")
    time.sleep(2)

    print("  -> show_objects")
    d.show_objects([
        {"label": "person", "confidence": 0.92},
        {"label": "chair", "confidence": 0.71},
        {"label": "cup", "confidence": 0.55},
    ])
    time.sleep(2)

    print("  -> show_alert")
    d.show_alert("Obstacol detectat in fata", 14)
    time.sleep(3)

    print("  -> revenire la status")
    d.show_status(state)
    print("[OK] Test ecrane terminat.")


if __name__ == "__main__":
    check_spi()
    if test_raw():
        test_screens()
    print("\nTest display complet.")
