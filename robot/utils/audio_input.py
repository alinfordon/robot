"""Selecteaza microfonul de pe camera USB (sau alt capture) pentru sounddevice/Vosk."""

from __future__ import annotations

import re
from typing import Any

_USB_MIC_RE = re.compile(
    r"usb|camera|webcam|uac|microphone|mic\b|hd webcam|logitech|c920|c270",
    re.I,
)
_SKIP_RE = re.compile(r"hdmi|vc4|monitor|max98357|hifiberry", re.I)


def _device_name(dev: dict[str, Any]) -> str:
    return str(dev.get("name") or "")


def list_input_devices(sd_module) -> list[tuple[int, str, int]]:
    """Returneaza (index, name, max_input_channels) pentru device-uri cu intrare."""
    out: list[tuple[int, str, int]] = []
    try:
        devices = sd_module.query_devices()
    except Exception:
        return out
    for i, dev in enumerate(devices):
        ch = int(dev.get("max_input_channels") or 0)
        if ch > 0:
            out.append((i, _device_name(dev), ch))
    return out


def find_usb_mic_index(sd_module, preferred: int | str | None = None) -> int | str | None:
    """Alege microfonul USB (camera) daca exista.

    preferred: index numeric, nume partial, sau 'auto'/'default'/None.
    """
    inputs = list_input_devices(sd_module)
    if not inputs:
        return None

    # Preferinta explicita din .env (index sau substring)
    if preferred is not None and preferred != "" and str(preferred).lower() not in (
        "auto",
        "default",
        "usb",
        "camera",
    ):
        if isinstance(preferred, int) or str(preferred).isdigit():
            idx = int(preferred)
            if any(i == idx for i, _n, _c in inputs):
                return idx
        pref = str(preferred).lower()
        for i, name, _ch in inputs:
            if pref in name.lower():
                return i

    # Camera USB / UAC
    for i, name, _ch in inputs:
        if _SKIP_RE.search(name):
            continue
        if _USB_MIC_RE.search(name):
            return i

    # Primul input care nu e HDMI / DAC
    for i, name, _ch in inputs:
        if not _SKIP_RE.search(name):
            return i

    return inputs[0][0]
