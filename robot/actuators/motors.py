import threading
import time
from typing import Callable, Optional

import config
from utils.gpio import GPIO, HAS_GPIO, setup_pin
from utils.logger import get_logger

logger = get_logger("Motors")


class MotorController:
    def __init__(self, proximity_check: Optional[Callable[[str], bool]] = None):
        self.proximity_check = proximity_check
        self._left_speed = 0
        self._right_speed = 0
        self._lock = threading.Lock()
        self._initialized = False

        if HAS_GPIO:
            try:
                self._setup_gpio()
            except Exception as exc:
                logger.warning("Init motoare esuat (%s) - mod simulare", exc)

    def _setup_gpio(self):
        pins = [
            config.MOTOR_LEFT_IN1,
            config.MOTOR_LEFT_IN2,
            config.MOTOR_RIGHT_IN3,
            config.MOTOR_RIGHT_IN4,
        ]
        for pin in pins:
            setup_pin(pin, GPIO.OUT, initial=GPIO.LOW)
        setup_pin(config.MOTOR_LEFT_ENA, GPIO.OUT, initial=GPIO.LOW)
        setup_pin(config.MOTOR_RIGHT_ENB, GPIO.OUT, initial=GPIO.LOW)
        self.pwm_left = GPIO.PWM(config.MOTOR_LEFT_ENA, config.MOTOR_PWM_FREQ)
        self.pwm_right = GPIO.PWM(config.MOTOR_RIGHT_ENB, config.MOTOR_PWM_FREQ)
        self.pwm_left.start(0)
        self.pwm_right.start(0)
        self._initialized = True
        logger.info("Motoare initializate")

    def _check_clear(self, direction: str) -> bool:
        if self.proximity_check:
            return self.proximity_check(direction)
        return True

    def _set_motor(self, in1: int, in2: int, pwm, speed: float):
        speed = max(0, min(100, speed))
        duty = speed
        if speed == 0:
            if HAS_GPIO:
                GPIO.output(in1, GPIO.LOW)
                GPIO.output(in2, GPIO.LOW)
            pwm.ChangeDutyCycle(0) if HAS_GPIO else None
        elif speed > 0:
            if HAS_GPIO:
                GPIO.output(in1, GPIO.HIGH)
                GPIO.output(in2, GPIO.LOW)
                pwm.ChangeDutyCycle(duty)
        else:
            if HAS_GPIO:
                GPIO.output(in1, GPIO.LOW)
                GPIO.output(in2, GPIO.HIGH)
                pwm.ChangeDutyCycle(abs(duty))

    def set_speed(self, left: float, right: float):
        with self._lock:
            self._left_speed = left
            self._right_speed = right
            if HAS_GPIO:
                if left >= 0:
                    self._set_motor(
                        config.MOTOR_LEFT_IN1,
                        config.MOTOR_LEFT_IN2,
                        self.pwm_left,
                        left,
                    )
                else:
                    self._set_motor(
                        config.MOTOR_LEFT_IN2,
                        config.MOTOR_LEFT_IN1,
                        self.pwm_left,
                        abs(left),
                    )
                if right >= 0:
                    self._set_motor(
                        config.MOTOR_RIGHT_IN3,
                        config.MOTOR_RIGHT_IN4,
                        self.pwm_right,
                        right,
                    )
                else:
                    self._set_motor(
                        config.MOTOR_RIGHT_IN4,
                        config.MOTOR_RIGHT_IN3,
                        self.pwm_right,
                        abs(right),
                    )
            else:
                logger.debug(f"Mock motors: L={left} R={right}")

    def stop(self):
        self.set_speed(0, 0)

    def smooth_move(self, direction: str, speed: float, duration: Optional[float] = None):
        if not self._check_clear(direction) and direction != "stop":
            logger.warning(f"Obstacol detectat - nu pot merge {direction}")
            self.stop()
            return False

        speed = max(0, min(100, speed))
        steps = 10
        target_left, target_right = self._direction_to_speeds(direction, speed)

        for i in range(1, steps + 1):
            factor = i / steps
            self.set_speed(target_left * factor, target_right * factor)
            time.sleep(0.05)

        if duration:
            time.sleep(duration)
            self._ramp_down()
        return True

    def _ramp_down(self):
        for i in range(10, 0, -1):
            factor = i / 10
            self.set_speed(self._left_speed * factor, self._right_speed * factor)
            time.sleep(0.03)
        self.stop()

    def _direction_to_speeds(self, direction: str, speed: float):
        if direction == "forward":
            return speed, speed
        if direction == "backward":
            return -speed, -speed
        if direction == "left":
            return -speed * 0.6, speed * 0.6
        if direction == "right":
            return speed * 0.6, -speed * 0.6
        if direction == "spin_left":
            return -speed, speed
        if direction == "spin_right":
            return speed, -speed
        return 0, 0

    def forward(self, speed: float = None):
        speed = speed or config.MOTOR_SPEED_DEFAULT
        return self.smooth_move("forward", speed)

    def backward(self, speed: float = None):
        speed = speed or config.MOTOR_SPEED_DEFAULT
        return self.smooth_move("backward", speed)

    def turn_left(self, speed: float = None):
        speed = speed or config.MOTOR_SPEED_DEFAULT
        return self.smooth_move("left", speed)

    def turn_right(self, speed: float = None):
        speed = speed or config.MOTOR_SPEED_DEFAULT
        return self.smooth_move("right", speed)

    def spin_left(self, speed: float = None):
        speed = speed or config.MOTOR_SPEED_DEFAULT
        return self.smooth_move("spin_left", speed)

    def spin_right(self, speed: float = None):
        speed = speed or config.MOTOR_SPEED_DEFAULT
        return self.smooth_move("spin_right", speed)

    def wheel_signs(self) -> tuple[float, float]:
        """Semn directie roata din comanda motor (-1, 0, +1)."""
        with self._lock:
            def _sign(v: float) -> float:
                if v > 0:
                    return 1.0
                if v < 0:
                    return -1.0
                return 0.0

            return _sign(self._left_speed), _sign(self._right_speed)

    def cleanup(self):
        self.stop()
        if HAS_GPIO and self._initialized:
            self.pwm_left.stop()
            self.pwm_right.stop()
            self._initialized = False
