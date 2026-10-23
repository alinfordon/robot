"""Wake word «ODI» — filtreaza vorbirea continua inainte de AI/comenzi."""

from __future__ import annotations

import re
from typing import Iterable


def _normalize(text: str) -> str:
    t = text.lower().strip()
    # diacritice / variante frecvente la Vosk
    for a, b in (
        ("ă", "a"),
        ("â", "a"),
        ("î", "i"),
        ("ș", "s"),
        ("ş", "s"),
        ("ț", "t"),
        ("ţ", "t"),
    ):
        t = t.replace(a, b)
    return t


def wake_aliases(primary: str, extra: str = "") -> list[str]:
    words = [primary.strip().lower()] if primary.strip() else []
    for part in (extra or "").split(","):
        p = part.strip().lower()
        if p and p not in words:
            words.append(p)
    # confuzii tipice Vosk EN/RO pentru «odi»
    for w in ("odi", "ody", "odie", "audi", "hody", "oddy", "ohdy"):
        if w not in words:
            words.append(w)
    return words


def match_wake(text: str, aliases: Iterable[str]) -> re.Match[str] | None:
    """Gaseste primul wake word ca token (nu substring in alt cuvant)."""
    norm = _normalize(text)
    for alias in aliases:
        a = _normalize(alias)
        if not a:
            continue
        m = re.search(rf"(?<!\w){re.escape(a)}(?!\w)", norm)
        if m:
            return m
    return None


def extract_command(text: str, aliases: Iterable[str]) -> tuple[bool, str]:
    """Returneaza (are_wake, comanda_fara_wake).

    «odi mergi inainte» -> (True, «mergi inainte»)
    «odi»             -> (True, «»)
    «mergi inainte»   -> (False, «mergi inainte»)
    """
    m = match_wake(text, aliases)
    if not m:
        return False, text.strip()
    # taie wake-ul din textul original pe pozitie aproximativa
    # lucram pe text normalizat pentru pozitie, pe original pentru rest
    norm = _normalize(text)
    after = norm[m.end() :].strip(" ,.;:!?-")
    # reconstruieste din cuvintele dupa wake din textul original
    words = text.strip().split()
    alias_set = {_normalize(a) for a in aliases}
    out: list[str] = []
    seen_wake = False
    for w in words:
        if not seen_wake and _normalize(re.sub(r"[^\w]", "", w)) in alias_set:
            seen_wake = True
            continue
        if seen_wake:
            out.append(w)
    cmd = " ".join(out).strip(" ,.;:!?")
    if not cmd and after:
        cmd = after
    return True, cmd
