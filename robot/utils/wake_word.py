"""Wake word «ODI» — filtreaza vorbirea continua inainte de AI/comenzi."""

from __future__ import annotations

import re
from typing import Iterable


def _normalize(text: str) -> str:
    t = text.lower().strip()
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
    """Doar aliasuri stricte — «audi»/«hody» dadeau false positive."""
    words: list[str] = []
    for part in [primary, *(extra or "").split(",")]:
        p = part.strip().lower()
        if p and p not in words:
            words.append(p)
    for w in ("odi", "ody", "odie"):
        if w not in words:
            words.append(w)
    return words


def match_wake(
    text: str,
    aliases: Iterable[str],
    *,
    max_word_index: int = 3,
) -> re.Match[str] | None:
    """Wake doar in primele N cuvinte (evita coincidente in vorbe lungi)."""
    norm = _normalize(text)
    words = norm.split()
    head = " ".join(words[: max(1, max_word_index + 1)])
    for alias in aliases:
        a = _normalize(alias)
        if not a:
            continue
        m = re.search(rf"(?<!\w){re.escape(a)}(?!\w)", head)
        if m:
            # remapeaza pe textul full pentru end()
            m_full = re.search(rf"(?<!\w){re.escape(a)}(?!\w)", norm)
            return m_full or m
    return None


def extract_command(
    text: str,
    aliases: Iterable[str],
    *,
    max_word_index: int = 3,
) -> tuple[bool, str]:
    """Returneaza (are_wake, comanda_fara_wake)."""
    m = match_wake(text, aliases, max_word_index=max_word_index)
    if not m:
        return False, text.strip()

    words = text.strip().split()
    alias_set = {_normalize(a) for a in aliases}
    out: list[str] = []
    seen_wake = False
    for w in words:
        token = _normalize(re.sub(r"[^\w]", "", w))
        if not seen_wake and token in alias_set:
            seen_wake = True
            continue
        if seen_wake:
            out.append(w)
    return True, " ".join(out).strip(" ,.;:!?")


def is_plausible_followup(text: str, *, max_words: int = 12) -> bool:
    """In fereastra dupa wake: respinge monoloagele Vosk (zgomot lung)."""
    words = text.strip().split()
    if not words or len(words) > max_words:
        return False
    # prea scurt / gunoi tipic
    if len(text.strip()) < 2:
        return False
    return True
