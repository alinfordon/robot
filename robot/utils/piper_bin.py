"""Calea la executabilul Piper din venv (nu depinde de PATH)."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path


def resolve_piper_bin() -> str:
    here = Path(sys.executable).resolve().parent
    for name in ("piper", "piper.exe"):
        candidate = here / name
        if candidate.is_file():
            return str(candidate)
    found = shutil.which("piper")
    if found:
        return found
    # Ultimul fallback: langa proiect (/home/robot/venv/bin/piper)
    root = Path(__file__).resolve().parents[1]
    for name in ("piper", "piper.exe"):
        candidate = root / "venv" / "bin" / name
        if candidate.is_file():
            return str(candidate)
    return "piper"
