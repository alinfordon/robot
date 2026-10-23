#!/usr/bin/env python3
"""Lista microfoane + test pe camera USB (stereo OK).

    sudo systemctl stop robot
    cd /home/robot
    venv/bin/python test_mic.py
    arecord -l
"""

from __future__ import annotations

import argparse
import sys

import config


def main() -> int:
    parser = argparse.ArgumentParser(description="Test microfon USB (camera)")
    parser.add_argument("--seconds", type=float, default=3.0)
    args = parser.parse_args()

    try:
        import sounddevice as sd
        import numpy as np
    except ImportError as exc:
        print(f"Lipsesc dependinte: {exc}")
        return 1

    from utils.audio_input import find_usb_mic_index, list_input_devices

    print(f"AUDIO_INPUT_DEVICE (env)={config.AUDIO_INPUT_DEVICE!r}")
    print("=== arecord -l (ALSA capture) ===")
    import subprocess

    subprocess.run(["arecord", "-l"], check=False)
    print()
    print("=== Input devices (sounddevice / PortAudio) ===")
    inputs = list_input_devices(sd)
    if not inputs:
        print("Niciun device cu canale de intrare. Camera USB e conectata?")
        return 1
    for i, name, ch in inputs:
        print(f"  #{i}  ch={ch}  {name}")

    chosen = find_usb_mic_index(sd, config.AUDIO_INPUT_DEVICE)
    print(f"\nAles: #{chosen}")
    if chosen is None:
        return 1

    info = sd.query_devices(chosen, "input")
    rate = int(info.get("default_samplerate") or 48000)
    max_ch = int(info.get("max_input_channels") or 1)
    channels = 2 if max_ch >= 2 else 1
    print(f"Name: {info.get('name')}")
    print(f"Rate: {rate} Hz  channels={channels}")
    print(f"Inregistreaza {args.seconds:.1f}s — vorbeste langa camera...")

    try:
        recording = sd.rec(
            int(args.seconds * rate),
            samplerate=rate,
            channels=channels,
            dtype="float32",
            device=chosen,
        )
        sd.wait()
    except Exception as exc:
        print(f"EROARE deschidere microfon: {exc}")
        if channels == 2:
            print("Reincerc mono...")
            channels = 1
            recording = sd.rec(
                int(args.seconds * rate),
                samplerate=rate,
                channels=1,
                dtype="float32",
                device=chosen,
            )
            sd.wait()
        else:
            return 1

    if recording.ndim > 1:
        mono = recording.mean(axis=1)
    else:
        mono = recording.reshape(-1)
    peak = float(np.max(np.abs(mono))) if len(mono) else 0.0
    rms = float(np.sqrt(np.mean(mono**2))) if len(mono) else 0.0
    print(f"Peak={peak:.3f}  RMS={rms:.3f}")

    if peak < 0.01:
        print(
            "\nSemnal aproape zero. Verifica:\n"
            "  1. Camera USB conectata (arecord -l)\n"
            "  2. Vorbesti spre microfonul de pe camera\n"
            "  3. alsamixer -c N  (Capture / Mic, nu e pe mute)\n"
            "  4. In .env: AUDIO_INPUT_DEVICE=<index din lista>\n"
        )
        return 2

    print("OK — microfonul primeste semnal.")
    print(
        "\nIn dashboard: Audio → Microfon chat vocal → «Raspberry Pi (Vosk)»"
        "\n(daca e pe PC, robotul NU asculta)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
