"""Encodere viteza OKY3278 (photo interrupter IR) — un pin OUT per roata.

Numara impulsuri (gauri disc) si calculeaza RPM + cm/s.
Foloseste polling (fara add_event_detect) — stabil pe Pi 5 / rpi-lgpio.
"""

import math
import threading
import time
from typing import Callable, Dict, Optional, Tuple

import config
from utils.gpio import GPIO, HAS_GPIO, setup_pin
from utils.logger import get_logger

logger = get_logger("Encoders")

PINS: Dict[str, int] = {
    "left": config.ENCODER_LEFT,
    "right": config.ENCODER_RIGHT,
}


class WheelEncoders:
    def __init__(self, motor_sign: Optional[Callable[[], Tuple[float, float]]] = None):
        self.motor_sign = motor_sign
        self._active = frozenset(getattr(config, "ENCODER_ACTIVE", set()) or set())
        self._has_gpio = False
        self._running = False
        self._lock = threading.Lock()
        self._poll_thread: Optional[threading.Thread] = None
        self._last_state: Dict[str, int] = {}

        self._left_total = 0
        self._right_total = 0
        self._left_delta = 0
        self._right_delta = 0
        self._left_rpm = 0.0
        self._right_rpm = 0.0
        self._left_cm_s = 0.0
        self._right_cm_s = 0.0
        self._left_pps = 0.0
        self._right_pps = 0.0
        self._speed_cm_s = 0.0

        if not self._active:
            logger.warning("Encodere DEZACTIVATE (ENCODER_ENABLED=0 sau ENCODER_ACTIVE=none)")
        elif HAS_GPIO:
            try:
                for side in self._active:
                    pin = PINS[side]
                    setup_pin(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
                    self._last_state[side] = GPIO.input(pin)
                self._has_gpio = True
                logger.info(
                    "Encodere OKY3278 activi: %s (PPR=%s, D=%scm)",
                    ", ".join(sorted(self._active)),
                    config.ENCODER_PPR,
                    config.ENCODER_WHEEL_DIAMETER_CM,
                )
            except Exception as exc:
                logger.warning("Init encodere esuat (%s)", exc)

    def _count_edge(self, side: str, pin: int):
        try:
            cur = GPIO.input(pin)
        except Exception:
            return
        prev = self._last_state.get(side, cur)
        # OKY3278 / LM393: impuls LOW cand gaura trece (beam intrerupt)
        if prev == GPIO.HIGH and cur == GPIO.LOW:
            with self._lock:
                if side == "left":
                    self._left_total += 1
                    self._left_delta += 1
                else:
                    self._right_total += 1
                    self._right_delta += 1
        self._last_state[side] = cur

    def _poll_loop(self):
        interval = max(0.001, float(getattr(config, "ENCODER_POLL_SEC", 0.002)))
        stats_every = max(0.1, float(config.ENCODER_SAMPLE_SEC))
        next_stats = time.monotonic() + stats_every

        while self._running:
            for side in self._active:
                self._count_edge(side, PINS[side])
            time.sleep(interval)

            now = time.monotonic()
            if now >= next_stats:
                self._update_stats(stats_every)
                next_stats = now + stats_every

    def has_hardware(self) -> bool:
        return self._has_gpio

    def active_names(self) -> list:
        return sorted(self._active)

    def _wheel_stats(self, delta: int, sign: float, interval: float) -> Tuple[float, float, float]:
        pps = delta / interval if interval > 0 else 0.0
        rpm_mag = (pps / max(1, config.ENCODER_PPR)) * 60.0
        circ = math.pi * config.ENCODER_WHEEL_DIAMETER_CM
        cm_s_mag = (pps / max(1, config.ENCODER_PPR)) * circ
        direction = sign if sign != 0 else 1.0
        return rpm_mag * direction, cm_s_mag * direction, pps

    def _update_stats(self, interval: float):
        sign_l, sign_r = (1.0, 1.0)
        if self.motor_sign:
            try:
                sign_l, sign_r = self.motor_sign()
            except Exception:
                pass

        with self._lock:
            l_d, r_d = self._left_delta, self._right_delta
            self._left_delta = 0
            self._right_delta = 0

        l_rpm, l_cm, l_pps = self._wheel_stats(l_d, sign_l, interval)
        r_rpm, r_cm, r_pps = self._wheel_stats(r_d, sign_r, interval)

        with self._lock:
            self._left_rpm, self._left_cm_s, self._left_pps = l_rpm, l_cm, l_pps
            self._right_rpm, self._right_cm_s, self._right_pps = r_rpm, r_cm, r_pps
            self._speed_cm_s = (l_cm + r_cm) / 2.0

    def start(self):
        if not self._active or not self._has_gpio:
            return
        self._running = True
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()
        logger.info("Loop encodere pornit (polling)")

    def stop(self):
        self._running = False

    def get_snapshot(self) -> dict:
        with self._lock:
            return {
                "left": {
                    "pulses": self._left_total,
                    "rpm": round(self._left_rpm, 1),
                    "cm_s": round(self._left_cm_s, 1),
                    "pps": round(self._left_pps, 1),
                },
                "right": {
                    "pulses": self._right_total,
                    "rpm": round(self._right_rpm, 1),
                    "cm_s": round(self._right_cm_s, 1),
                    "pps": round(self._right_pps, 1),
                },
                "speed_cm_s": round(self._speed_cm_s, 1),
                "active": self.active_names(),
                "hardware": self._has_gpio,
                "ppr": config.ENCODER_PPR,
            }

    def cleanup(self):
        self.stop()
