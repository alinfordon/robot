"""Decizie navigare autonoma AI — apel catre dashboard PC."""

from __future__ import annotations

import json
import re

import aiohttp

import config
from utils.logger import get_logger

logger = get_logger("AiNav")

VALID = frozenset({"forward", "backward", "left", "right", "stop"})


async def get_navigation_decision(robot_context: dict) -> dict:
    """Returneaza {direction, reason} de la /api/ai-navigate."""
    url = getattr(config, "AI_NAVIGATE_URL", config.AI_URL.replace("/api/chat", "/api/ai-navigate"))
    payload = {"robotContext": robot_context}

    try:
        timeout = aiohttp.ClientTimeout(total=25)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                data = await response.json()
                direction = str(data.get("direction", "stop")).lower()
                if direction not in VALID:
                    direction = "stop"
                return {
                    "direction": direction,
                    "reason": data.get("reason", ""),
                    "model": data.get("model", ""),
                }
    except Exception as exc:
        logger.warning("AI navigate esuat (%s) — opresc", exc)
        return {"direction": "stop", "reason": str(exc), "model": "error"}


def parse_move_tag(text: str) -> str | None:
    m = re.search(r"\[\[MOVE:(forward|backward|left|right|stop)", text, re.I)
    return m.group(1).lower() if m else None
