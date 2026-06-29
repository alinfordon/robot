import re
from typing import Awaitable, Callable, Optional

from utils.logger import get_logger

logger = get_logger("Router")

MOVE_PATTERNS = [
    (r"\b(stop|opreste|oprire|stationeaza)\b", "stop"),
    (r"\b(inapoi|backward|reverse)\b", "backward"),
    (r"\b(stanga|left)\b", "left"),
    (r"\b(dreapta|right)\b", "right"),
    (r"\b(mergi|inainte|inainteaza|forward|fata)\b", "forward"),
]

_DIR_RO = {
    "forward": "inainte",
    "backward": "inapoi",
    "left": "la stanga",
    "right": "la dreapta",
}


def _parse_amount(text: str):
    """Extrage distanta (cm), unghi (grade) sau durata (ms) din text."""
    deg = re.search(r"(\d+(?:[.,]\d+)?)\s*(grade|grad|deg)", text)
    if deg:
        return {"degrees": float(deg.group(1).replace(",", "."))}
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(centimetr\w*|cm|metri|metru|secund\w*|sec|s|m)\b", text)
    if not m:
        return {}
    val = float(m.group(1).replace(",", "."))
    unit = m.group(2)
    if re.fullmatch(r"secund\w*|sec|s", unit):
        return {"duration_ms": val * 1000.0}
    if re.fullmatch(r"metri|metru|m", unit):
        return {"distance_cm": val * 100.0}
    return {"distance_cm": val}


class VoiceRouter:
    def __init__(
        self,
        motor_move: Callable[[str, float], None],
        ai_handler: Callable,
        speaker_say: Callable,
        motor_timed: Optional[Callable[..., Awaitable[None]]] = None,
    ):
        self.motor_move = motor_move
        self.ai_handler = ai_handler
        self.speaker_say = speaker_say
        self.motor_timed = motor_timed

    async def route(self, text: str):
        text_lower = text.lower().strip()
        logger.info(f"Routez: {text_lower}")

        for pattern, direction in MOVE_PATTERNS:
            if re.search(pattern, text_lower):
                if direction == "stop":
                    self.motor_move("stop", 0)
                    await self.speaker_say("M-am oprit.")
                    return True

                amount = _parse_amount(text_lower)
                if amount and self.motor_timed:
                    await self.motor_timed(direction, 65, **amount)
                else:
                    self.motor_move(direction, 65)

                extra = ""
                if "distance_cm" in amount:
                    extra = f" {int(amount['distance_cm'])} cm"
                elif "degrees" in amount:
                    extra = f" {int(amount['degrees'])} grade"
                await self.speaker_say(f"OK, merg {_DIR_RO[direction]}{extra}.")
                return True

        await self.ai_handler(text)
        return False
