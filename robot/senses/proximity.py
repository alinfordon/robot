import threading
import time
from typing import Callable, Dict, Optional, Tuple

import config
from utils.gpio import GPIO, HAS_GPIO, cleanup_all, setup_pin
from utils.logger import get_logger

logger = get_logger("Proximity")

SENSORS: Dict[str, Tuple[int, int]] = {
    "front": (config.US_FRONT_TRIG, config.US_FRONT_ECHO),
    "left": (config.US_LEFT_TRIG, config.US_LEFT_ECHO),
    "right": (config.US_RIGHT_TRIG, config.US_RIGHT_ECHO),
    "back": (config.US_BACK_TRIG, config.US_BACK_ECHO),
}


class ProximitySensors:
    def __init__(self, on_update: Optional[Callable[[dict], None]] = None):
        self.on_update = on_update
        self.distances: Dict[str, float] = {k: 999.0 for k in SENSORS}
        self._running = False
        self._threads: list = []
        self._lock = threading.Lock()

        self._active = frozenset(getattr(config, "US_ACTIVE", set()) or set())
        self._has_gpio = False
        if not self._active:
            logger.warning("Senzori ultrasonici DEZACTIVATI (US_ENABLED=0 sau US_ACTIVE=none)")
        elif HAS_GPIO:
            try:
                for name in self._active:
                    trig, echo = SENSORS[name]
                    setup_pin(trig, GPIO.OUT, initial=GPIO.LOW)
                    setup_pin(echo, GPIO.IN)
                self._has_gpio = True
                logger.info("HC-SR04 activi: %s", ", ".join(sorted(self._active)))
            except Exception as exc:
                logger.warning(
                    "Init senzori esuat (%s) - verifica cablaj si ca robotul "
                    "nu ruleaza deja (gpioinfo gpiochip4). Pinii fata: TRIG=%s ECHO=%s",
                    exc,
                    config.US_FRONT_TRIG,
                    config.US_FRONT_ECHO,
                )
        else:
            logger.warning("Mod simulare senzori")

    def _read_distance(self, trig: int, echo: int) -> float:
        if not self._has_gpio:
            return 999.0

        GPIO.output(trig, GPIO.HIGH)
        time.sleep(0.00001)
        GPIO.output(trig, GPIO.LOW)

        timeout = time.time() + 0.03
        pulse_start = time.time()
        while GPIO.input(echo) == 0:
            if time.time() > timeout:
                return 999.0
            pulse_start = time.time()

        timeout = time.time() + 0.03
        pulse_end = time.time()
        while GPIO.input(echo) == 1:
            if time.time() > timeout:
                return 999.0
            pulse_end = time.time()

        try:
            duration = pulse_end - pulse_start
            return round(duration * 17150, 1)
        except Exception:
            return 999.0

    def _sensor_loop(self, name: str, trig: int, echo: int):
        while self._running:
            dist = self._read_distance(trig, echo)
            with self._lock:
                self.distances[name] = dist
            time.sleep(0.1)

    def start(self):
        if not self._active:
            logger.info("Loop senzori sarit (niciun senzor activ)")
            return
        if not self._has_gpio:
            logger.error("Loop senzori sarit: GPIO neinitializat (citiri vor ramane 999)")
            return
        self._running = True
        for name in self._active:
            trig, echo = SENSORS[name]
            t = threading.Thread(
                target=self._sensor_loop, args=(name, trig, echo), daemon=True
            )
            t.start()
            self._threads.append(t)
        logger.info("Loop senzori pornit: %s", ", ".join(sorted(self._active)))

    def stop(self):
        self._running = False

    def get_readings(self) -> dict:
        with self._lock:
            return dict(self.distances)

    def is_clear(self, direction: str) -> bool:
        readings = self.get_readings()
        threshold = config.OBSTACLE_DISTANCE_CM

        if direction == "forward":
            return readings.get("front", 999) > threshold
        if direction == "backward":
            return readings.get("back", 999) > threshold
        if direction == "left":
            return readings.get("left", 999) > threshold
        if direction == "right":
            return readings.get("right", 999) > threshold
        return True

    def has_obstacle_ahead(self) -> bool:
        return not self.is_clear("forward")

    def cleanup(self):
        self.stop()
        # Pinii sunt eliberati la shutdown global (main -> cleanup_all)
