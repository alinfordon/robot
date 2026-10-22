#!/usr/bin/env python3
"""Test redare MAX98357 (I2S) / ALSA — ruleaza cu robotul OPRIT.

    cd /home/robot
    sudo systemctl stop robot
    venv/bin/python test_audio.py
    venv/bin/python test_audio.py --tts "Salut, eu sunt robotul"
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import config


def list_cards() -> None:
    print("=== aplay -l ===")
    subprocess.run(["aplay", "-l"], check=False)
    print()


def tone_wav(path: Path, seconds: float = 1.5, freq: float = 440.0, rate: int = 22050) -> None:
    import math
    import struct

    n = int(rate * seconds)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        for i in range(n):
            # Fade in/out scurt ca sa nu pocneasca
            env = 1.0
            if i < rate * 0.05:
                env = i / (rate * 0.05)
            elif i > n - rate * 0.05:
                env = (n - i) / (rate * 0.05)
            sample = int(env * 0.35 * 32767 * math.sin(2 * math.pi * freq * i / rate))
            w.writeframes(struct.pack("<h", sample))


def play_file(path: Path) -> int:
    device = config.AUDIO_PLAYBACK_DEVICE
    print(f"Redau pe {device}: {path}")
    r = subprocess.run(["aplay", "-q", "-D", device, str(path)], check=False)
    return r.returncode


def tts_wav(text: str, out: Path) -> bool:
    model = Path(config.PIPER_MODEL_PATH)
    if not model.exists():
        print(f"Model Piper lipsa: {model}")
        return False
    proc = subprocess.run(
        ["piper", "--model", str(model), "--output_file", str(out)],
        input=text.encode("utf-8"),
        check=False,
    )
    return proc.returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Test audio MAX98357 / ALSA")
    parser.add_argument("--tts", default="", help="Text TTS Piper (RO)")
    args = parser.parse_args()

    print(f"AUDIO_OUTPUT={getattr(config, 'AUDIO_OUTPUT', '?')}")
    print(f"AUDIO_PLAYBACK_DEVICE={config.AUDIO_PLAYBACK_DEVICE}")
    print(
        "Pin I2S asteptati: BCLK=GPIO18  LRC=GPIO19  DIN=GPIO21  "
        f"(MOTOR_LEFT_ENA={config.MOTOR_LEFT_ENA})"
    )
    print()
    list_cards()

    with tempfile.TemporaryDirectory() as tmp:
        tone = Path(tmp) / "tone.wav"
        tone_wav(tone)
        print(">>> Ton 440 Hz ~1.5s (ar trebui auzit pe difuzor MAX98357)")
        rc = play_file(tone)
        if rc != 0:
            print(
                "\nEROARE aplay. Verifica:\n"
                "  1. dtoverlay=max98357a,no-sdmode in /boot/firmware/config.txt + reboot\n"
                "  2. Cablaj BCLK/LRC/DIN pe 18/19/21\n"
                "  3. JUMPER pe ENA (L298N) — GPIO18 nu trebuie folosit de motor\n"
                "  4. aplay -l  (cauta card MAX98357 / hifiberry)\n"
            )
            return rc

        if args.tts.strip():
            speech = Path(tmp) / "tts.wav"
            print(f">>> TTS: {args.tts!r}")
            if tts_wav(args.tts.strip(), speech):
                play_file(speech)
            else:
                return 1

    print("\nOK — daca ai auzit tonul, MAX98357 e functional.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
