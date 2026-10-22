"""Rezolva dispozitivul ALSA de redare (MAX98357 / USB), independent de indexul cardului."""

from __future__ import annotations

import re
from pathlib import Path

_I2S_NAME_RE = re.compile(r"MAX98357|hifiberry|IQaudIO|snd_rpi", re.I)
_HDMI_RE = re.compile(r"hdmi|vc4", re.I)


def _iter_cards() -> list[tuple[int, str]]:
    path = Path("/proc/asound/cards")
    if not path.exists():
        return []
    cards: list[tuple[int, str]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        # " 1 [MAX98357A    ]: MAX98357A - ..."
        m = re.match(r"\s*(\d+)\s+\[([^\]]+)\]", line)
        if m:
            cards.append((int(m.group(1)), m.group(2).strip()))
    return cards


def find_i2s_card_id() -> int | None:
    for cid, name in _iter_cards():
        if _I2S_NAME_RE.search(name):
            return cid
    return None


def find_i2s_card_name() -> str | None:
    for _cid, name in _iter_cards():
        if _I2S_NAME_RE.search(name):
            return name
    return None


def alsa_plughw(card: int | str, device: int = 0) -> str:
    """card numeric sau nume ALSA (ex. MAX98357A)."""
    if isinstance(card, int) or str(card).isdigit():
        return f"plughw:{card},{device}"
    return f"plughw:CARD={card},DEV={device}"


def resolve_playback_device(
    configured: str | None,
    *,
    audio_output: str = "i2s",
    card_hint: str | None = None,
) -> str:
    """Alege dispozitivul de redare.

    Preferă CARD=NUME (stabil la reboot). Dacă .env pointează spre HDMI sau un
    card lipsă, trece automat pe MAX98357.
    """
    configured = (configured or "").strip()
    output = (audio_output or "i2s").strip().lower()

    if output == "i2s":
        name = find_i2s_card_name()
        if name:
            preferred = alsa_plughw(name)
            # Daca .env e gol, HDMI, sau alt card gresit -> foloseste MAX98357
            if not configured or _HDMI_RE.search(configured):
                return preferred
            # plughw:2,0 cand 2 e HDMI
            m = re.match(r"plughw:(\d+),", configured)
            if m:
                cid = int(m.group(1))
                cards = {c: n for c, n in _iter_cards()}
                if cid not in cards or _HDMI_RE.search(cards[cid]) or not _I2S_NAME_RE.search(
                    cards.get(cid, "")
                ):
                    return preferred
            return configured
        if card_hint and not str(card_hint).isdigit():
            return alsa_plughw(card_hint)
        return configured or "plughw:CARD=MAX98357A,DEV=0"

    return configured or "default"
