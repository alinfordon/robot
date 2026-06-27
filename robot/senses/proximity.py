import threading
import time
from typing import Callable, Dict, Optional, Tuple

import config
from utils.logger import get_logger

logger = get_logger("Proximity")

try:
    if not config.MOCK_HARDWARE:
        import RPi.GPIO as GPIO

        HAS_GPIO = True
    else:
        HAS_GPIO = False
except ImportError:
    HAS_GPIO = False

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

        if HAS_GPIO:
            GPIO.setmode(GPIO.BCM)
            GPIO.setwarnings(False)
            for name, (trig, echo) in SENSORS.items():
                GPIO.setup(trig, GPIO.OUT)
                GPIO.setup(echo, GPIO.IN)
                GPIO.output(trig, GPIO.LOW)
            logger.info("4 senzori HC-SR04 initializati")
        else:
            logger.warning("Mod simulare senzori")

    def _read_distance(self, trig: int, echo: int) -> float:
        if not HAS_GPIO:
            import random

            return random.uniform(30, 120)

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
        self._running = True
        for name, (trig, echo) in SENSORS.items():
            t = threading.Thread(
                target=self._sensor_loop, args=(name, trig, echo), daemon=True
            )
            t.start()
            self._threads.append(t)
        logger.info("Loop senzori pornit")

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
        if HAS_GPIO:
            GPIO.cleanup()
