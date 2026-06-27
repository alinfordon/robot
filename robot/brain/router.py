import re
from typing import Callable, Optional

from utils.logger import get_logger

logger = get_logger("Router")

MOVE_PATTERNS = [
    (r"\b(mergi|inainte|inainteaza|forward)\b", "forward"),
    (r"\b(inapoi|backward|reverse)\b", "backward"),
    (r"\b(stanga|left)\b", "left"),
    (r"\b(dreapta|right)\b", "right"),
    (r"\b(stop|opreste|oprire|stationeaza)\b", "stop"),
]


class VoiceRouter:
    def __init__(
        self,
        motor_move: Callable[[str, float], None],
        ai_handler: Callable,
        speaker_say: Callable,
    ):
        self.motor_move = motor_move
        self.ai_handler = ai_handler
        self.speaker_say = speaker_say

    async def route(self, text: str):
        text_lower = text.lower().strip()
        logger.info(f"Routez: {text_lower}")

        for pattern, direction in MOVE_PATTERNS:
            if re.search(pattern, text_lower):
                if direction == "stop":
                    self.motor_move("stop", 0)
                    await self.speaker_say("M-am oprit.")
                else:
                    self.motor_move(direction, 65)
                    await self.speaker_say(f"OK, merg {direction}.")
                return True

        await self.ai_handler(text)
        return False
