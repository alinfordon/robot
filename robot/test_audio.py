#!/usr/bin/env python3
"""Test redare MAX98357 (I2S) / ALSA — ruleaza cu robotul OPRIT.

    sudo systemctl stop robot
    cd /home/robot
    venv/bin/python test_audio.py
    venv/bin/python test_audio.py --tts "Salut"
    venv/bin/python test_audio.py --loud   # ton stereo maxim, 3s
"""

from __future__ import annotations

import argparse
import subprocess
import tempfile
import wave
from pathlib import Path

import config
from utils.audio_device import find_i2s_card_name, resolve_playback_device
from utils.piper_bin import resolve_piper_bin


def list_cards() -> None:
    print("=== aplay -l ===")
    subprocess.run(["aplay", "-l"], check=False)
    print()


def tone_wav(
    path: Path,
    *,
    seconds: float = 2.0,
    freq: float = 440.0,
    rate: int = 44100,
    stereo: bool = True,
    amplitude: float = 0.9,
) -> None:
    """Genereaza ton. Stereo: acelasi semnal pe L+R (MAX98357 foloseste tipic canalul stang)."""
    import math
    import struct

    n = int(rate * seconds)
    channels = 2 if stereo else 1
    with wave.open(str(path), "w") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        for i in range(n):
            env = 1.0
            fade = int(rate * 0.02)
            if i < fade:
                env = i / fade
            elif i > n - fade:
                env = (n - i) / fade
            sample = int(env * amplitude * 32767 * math.sin(2 * math.pi * freq * i / rate))
            sample = max(-32767, min(32767, sample))
            if stereo:
                w.writeframes(struct.pack("<hh", sample, sample))
            else:
                w.writeframes(struct.pack("<h", sample))


def play_file(path: Path, device: str) -> int:
    print(f"Redau pe {device}: {path}")
    r = subprocess.run(["aplay", "-D", device, str(path)], check=False)
    return r.returncode


def tts_wav(text: str, out: Path) -> bool:
    model = Path(config.PIPER_MODEL_PATH)
    if not model.exists():
        print(f"Model Piper lipsa: {model}")
        return False
    piper = resolve_piper_bin()
    if not Path(piper).exists() and piper == "piper":
        print(
            "Executabil Piper lipsa. Instaleaza in venv:\n"
            "  source venv/bin/activate && pip install 'piper-tts>=1.2.0'\n"
            "  # sau: bash setup/03_audio.sh"
        )
        return False
    print(f"Piper: {piper}")
    proc = subprocess.run(
        [piper, "--model", str(model), "--output_file", str(out)],
        input=text.encode("utf-8"),
        check=False,
    )
    if proc.returncode != 0:
        print(f"Piper a esuat (exit {proc.returncode})")
    return proc.returncode == 0


def print_silent_checklist() -> None:
    print(
        """
=== aplay OK dar NU se aude — verifica hardware (in ordine) ===
  1. SD_MODE pe modul -> 3.3V (sau VIN/5V). Daca plutesc, amplificatorul e STINS.
     (no-sdmode in config.txt NU trage pinul automat — trebuie fir!)
  2. VIN -> 5V (pin fizic 2), GND -> GND (pin 6)
  3. Difuzor 4-8 ohm pe bornele OUT+ / OUT- ale modulului
  4. BCLK->GPIO18 (pin 12), LRC->GPIO19 (pin 35), DIN->GPIO21 (pin 40)
  5. Pe L298N: JUMPER pe ENA, fara fir pe GPIO18
  6. sudo systemctl stop robot   (apoi retesteaza)
  7. speaker-test -D plughw:CARD=MAX98357A,DEV=0 -c 2 -t sine -f 440
"""
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Test audio MAX98357 / ALSA")
    parser.add_argument("--tts", default="", help="Text TTS Piper (RO)")
    parser.add_argument(
        "--loud",
        action="store_true",
        help="Ton stereo 3s la amplitudine maxima",
    )
    args = parser.parse_args()

    device = resolve_playback_device(
        config.AUDIO_PLAYBACK_DEVICE,
        audio_output=getattr(config, "AUDIO_OUTPUT", "i2s"),
        card_hint=getattr(config, "AUDIO_PLAYBACK_CARD", "MAX98357A"),
    )
    i2s_name = find_i2s_card_name()
    print(f"AUDIO_OUTPUT={getattr(config, 'AUDIO_OUTPUT', '?')}")
    print(f"AUDIO_PLAYBACK_DEVICE (env)={config.AUDIO_PLAYBACK_DEVICE}")
    print(f"AUDIO_PLAYBACK_DEVICE (resolved)={device}")
    print(f"Card I2S detectat: {i2s_name or 'NICIUNUL'}")
    print(
        "Pin I2S asteptati: BCLK=GPIO18  LRC=GPIO19  DIN=GPIO21  "
        f"(MOTOR_LEFT_ENA={config.MOTOR_LEFT_ENA})"
    )
    print()
    list_cards()

    if getattr(config, "AUDIO_OUTPUT", "i2s") == "i2s" and not i2s_name:
        print("EROARE: card MAX98357 nu apare in aplay -l. Reboot dupa dtoverlay?")
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        tone = Path(tmp) / "tone.wav"
        secs = 3.0 if args.loud else 2.0
        amp = 0.95 if args.loud else 0.85
        tone_wav(tone, seconds=secs, stereo=True, amplitude=amp)
        print(f">>> Ton 440 Hz stereo ~{secs:.0f}s @ amp={amp}")
        rc = play_file(tone, device)
        if rc != 0:
            print(
                "\nEROARE aplay. Verifica:\n"
                "  1. dtoverlay=max98357a,no-sdmode in /boot/firmware/config.txt + reboot\n"
                "  2. Cablaj BCLK/LRC/DIN pe 18/19/21\n"
                "  3. JUMPER pe ENA (L298N) — GPIO18 nu trebuie folosit de motor\n"
                f"  4. Test: aplay -D plughw:CARD={i2s_name or 'MAX98357A'},DEV=0 "
                "/usr/share/sounds/alsa/Front_Center.wav\n"
            )
            return rc

        if args.tts.strip():
            speech = Path(tmp) / "tts.wav"
            print(f">>> TTS: {args.tts!r}")
            if tts_wav(args.tts.strip(), speech):
                play_file(speech, device)
            else:
                return 1

    print_silent_checklist()
    print("Daca totusi nu se aude: aproape sigur SD_MODE neconectat sau difuzor/VIN.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
