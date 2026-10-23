#!/usr/bin/env python3
"""Lista microfoane + test scurt pe camera USB.

    sudo systemctl stop robot
    cd /home/robot
    venv/bin/python test_mic.py
    venv/bin/python test_mic.py --seconds 5
"""

from __future__ import annotations

import argparse
import sys
import time

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
    print("=== Input devices (sounddevice) ===")
    inputs = list_input_devices(sd)
    if not inputs:
        print("Niciun device cu canale de intrare. Camera USB e conectata?")
        print("Verifica: arecord -l")
        return 1
    for i, name, ch in inputs:
        print(f"  #{i}  ch={ch}  {name}")

    chosen = find_usb_mic_index(sd, config.AUDIO_INPUT_DEVICE)
    print(f"\nAles: #{chosen}")
    if chosen is None:
        return 1

    info = sd.query_devices(chosen, "input")
    rate = int(info.get("default_samplerate") or config.AUDIO_SAMPLERATE)
    print(f"Name: {info.get('name')}")
    print(f"Rate: {rate} Hz — inregistreaza {args.seconds:.1f}s (vorbeşte)...")

    recording = sd.rec(
        int(args.seconds * rate),
        samplerate=rate,
        channels=1,
        dtype="float32",
        device=chosen,
    )
    sd.wait()
    peak = float(np.max(np.abs(recording))) if len(recording) else 0.0
    rms = float(np.sqrt(np.mean(recording**2))) if len(recording) else 0.0
    print(f"Peak={peak:.3f}  RMS={rms:.3f}")

    if peak < 0.01:
        print(
            "\nSemnal aproape zero. Verifica:\n"
            "  1. Camera USB e conectata (arecord -l)\n"
            "  2. Microfonul camerei nu e pe mute\n"
            "  3. In .env: AUDIO_INPUT_DEVICE=auto  (sau indexul din lista)\n"
            "  4. alsamixer -c <card_usb>  (Capture / Mic boost)\n"
        )
        return 2

    print("OK — microfonul primeste semnal.")
    # Reda pe MAX98357 daca e disponibil (loopback rapid)
    try:
        from utils.audio_device import resolve_playback_device

        device = resolve_playback_device(
            config.AUDIO_PLAYBACK_DEVICE,
            audio_output=getattr(config, "AUDIO_OUTPUT", "i2s"),
        )
        print(f"Redau inregistrarea pe {device}...")
        # salveaza temp wav via soundfile daca exista, altfel skip
        try:
            import soundfile as sf
            import tempfile
            from pathlib import Path
            import subprocess

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                path = Path(f.name)
            sf.write(str(path), recording, rate)
            subprocess.run(["aplay", "-D", device, str(path)], check=False)
            path.unlink(missing_ok=True)
        except ImportError:
            print("(soundfile lipsa — skip redare; pip install soundfile optional)")
    except Exception as exc:
        print(f"(skip redare: {exc})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
