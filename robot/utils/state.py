from enum import Enum
from dataclasses import dataclass, field
from typing import Optional
import time


class RobotState(str, Enum):
    IDLE = "idle"
    MOVING = "moving"
    THINKING = "thinking"
    SPEAKING = "speaking"
    LISTENING = "listening"
    AVOIDING = "avoiding"
    ERROR = "error"


class RobotMode(str, Enum):
    AUTO = "auto"
    MANUAL = "manual"
    VISION = "vision"
    PATROL = "patrol"


class Mood(str, Enum):
    HAPPY = "happy"
    THINKING = "thinking"
    LISTENING = "listening"
    TALKING = "talking"
    STANDBY = "standby"
    ALERT = "alert"


@dataclass
class RobotContext:
    state: RobotState = RobotState.IDLE
    mode: RobotMode = RobotMode.MANUAL
    mood: Mood = Mood.STANDBY
    ai_navigate_enabled: bool = False
    start_time: float = field(default_factory=time.time)

    def uptime(self) -> float:
        return time.time() - self.start_time

    def set_state(self, state: RobotState, mood: Optional[Mood] = None):
        self.state = state
        if mood:
            self.mood = mood

    def set_mode(self, mode: RobotMode):
        self.mode = mode

    def set_ai_navigate(self, enabled: bool):
        self.ai_navigate_enabled = enabled

    def reset(self):
        self.state = RobotState.IDLE
        self.mode = RobotMode.MANUAL
        self.mood = Mood.STANDBY
        self.ai_navigate_enabled = False

    def to_dict(self):
        return {
            "state": self.state.value,
            "mode": self.mode.value,
            "mood": self.mood.value,
            "aiNavigateEnabled": self.ai_navigate_enabled,
        }
