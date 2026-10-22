"""Pan & tilt camera pe PCA9685 (driver PWM I2C, 16 canale).

Scriem direct in registrele PCA9685 prin smbus2, ca sa nu tragem stiva Blinka
pentru doua servo-uri. Toate metodele publice sunt blocante (dorm intre pasi),
deci din asyncio se apeleaza prin asyncio.to_thread.
"""

import threading
import time
from typing import Optional

import config
from utils.logger import get_logger

logger = get_logger("PanTilt")

_MODE1 = 0x00
_MODE2 = 0x01
_PRESCALE = 0xFE
_LED0_ON_L = 0x06

_MODE1_RESTART = 0x80
_MODE1_AI = 0x20  # auto-increment registru (scriere pe 4 octeti)
_MODE1_SLEEP = 0x10
_MODE2_OUTDRV = 0x04  # iesiri totem-pole, obligatoriu pentru servo

_OSC_HZ = 25_000_000
_TICKS = 4096
_FULL_OFF = 0x10  # bit 4 din OFF_H: canal oprit complet
_UPDATE_HZ = 50  # rata de refresh in miscarea lina


def _clamp(value: float, low: float, high: float) -> float:
    if low > high:
        low, high = high, low
    return max(low, min(high, value))


class PanTilt:
    """Cap pan & tilt: doua servo-uri pe canalele PCA9685 din config."""

    def __init__(self):
        self._bus = None
        self._lock = threading.RLock()
        self._pan = float(config.PANTILT_PAN_CENTER_DEG)
        self._tilt = float(config.PANTILT_TILT_CENTER_DEG)
        self._released = True
        self._positioned = False  # pozitia reala e necunoscuta pana la prima comanda
        self._release_timer: Optional[threading.Timer] = None

        if not config.PANTILT_ENABLED:
            logger.info("Pan&tilt dezactivat (PANTILT_ENABLED=0)")
            return
        if config.MOCK_HARDWARE:
            logger.info("Pan&tilt in simulare (MOCK_HARDWARE=1)")
            return

        try:
            from smbus2 import SMBus

            self._bus = SMBus(config.PCA9685_I2C_BUS)
            self._reset()
            logger.info(
                "PCA9685 initializat: I2C%d @0x%02X, %d Hz, pan=ch%d, tilt=ch%d",
                config.PCA9685_I2C_BUS,
                config.PCA9685_ADDRESS,
                config.PCA9685_PWM_FREQ,
                config.PANTILT_PAN_CHANNEL,
                config.PANTILT_TILT_CHANNEL,
            )
            self.center()
        except Exception as exc:
            self._close_bus()
            logger.warning("Init PCA9685 esuat (%s) - mod simulare", exc)

    @property
    def available(self) -> bool:
        return self._bus is not None

    # ─── registre PCA9685 ────────────────────────────

    def _read(self, reg: int) -> int:
        return self._bus.read_byte_data(config.PCA9685_ADDRESS, reg)

    def _write(self, reg: int, value: int) -> None:
        self._bus.write_byte_data(config.PCA9685_ADDRESS, reg, value & 0xFF)

    def _reset(self) -> None:
        self._write(_MODE1, _MODE1_AI)
        self._write(_MODE2, _MODE2_OUTDRV)
        time.sleep(0.005)
        self._set_freq(config.PCA9685_PWM_FREQ)

    def _set_freq(self, freq_hz: int) -> None:
        freq_hz = int(_clamp(freq_hz, 24, 1526))
        prescale = max(3, int(round(_OSC_HZ / (_TICKS * freq_hz))) - 1)
        mode1 = self._read(_MODE1)
        # Prescale se poate scrie doar cu oscilatorul in sleep
        self._write(_MODE1, (mode1 & ~_MODE1_RESTART) | _MODE1_SLEEP)
        self._write(_PRESCALE, prescale)
        self._write(_MODE1, mode1)
        time.sleep(0.005)
        self._write(_MODE1, mode1 | _MODE1_RESTART | _MODE1_AI)

    def _write_channel(self, channel: int, ticks: Optional[int]) -> None:
        """ticks=None taie semnalul (full-off), altfel impuls de la tick 0."""
        if ticks is None:
            data = [0, 0, 0, _FULL_OFF]
        else:
            ticks = int(_clamp(ticks, 0, _TICKS - 1))
            data = [0, 0, ticks & 0xFF, ticks >> 8]
        self._bus.write_i2c_block_data(
            config.PCA9685_ADDRESS, _LED0_ON_L + 4 * channel, data
        )

    def _angle_to_ticks(self, angle: float, invert: bool) -> int:
        if invert:
            angle = 180.0 - angle
        span_us = config.PANTILT_PULSE_MAX_US - config.PANTILT_PULSE_MIN_US
        pulse_us = config.PANTILT_PULSE_MIN_US + span_us * (_clamp(angle, 0, 180) / 180.0)
        return int(round(pulse_us * config.PCA9685_PWM_FREQ * _TICKS / 1_000_000))

    def _apply(self, pan: float, tilt: float) -> None:
        if not self.available:
            return
        try:
            self._write_channel(
                config.PANTILT_PAN_CHANNEL,
                self._angle_to_ticks(pan, config.PANTILT_PAN_INVERT),
            )
            self._write_channel(
                config.PANTILT_TILT_CHANNEL,
                self._angle_to_ticks(tilt, config.PANTILT_TILT_INVERT),
            )
            self._released = False
        except OSError as exc:
            logger.error("Scriere PCA9685 esuata: %s", exc)

    # ─── control ─────────────────────────────────────

    def set_angles(
        self,
        pan: Optional[float] = None,
        tilt: Optional[float] = None,
        *,
        smooth: bool = True,
    ) -> dict:
        """Pozitie absoluta in grade (None = axa ramane pe loc). Valorile se limiteaza."""
        with self._lock:
            target_pan = self._pan if pan is None else _clamp(
                float(pan), config.PANTILT_PAN_MIN_DEG, config.PANTILT_PAN_MAX_DEG
            )
            target_tilt = self._tilt if tilt is None else _clamp(
                float(tilt), config.PANTILT_TILT_MIN_DEG, config.PANTILT_TILT_MAX_DEG
            )

            self._cancel_release()
            # Prima comanda merge direct: nu stim de unde pleaca servo-ul
            if smooth and self.available and self._positioned:
                self._sweep(target_pan, target_tilt)
            else:
                self._apply(target_pan, target_tilt)

            self._pan, self._tilt = target_pan, target_tilt
            self._positioned = True
            if not self.available:
                logger.debug("[Mock pan&tilt] pan=%.0f tilt=%.0f", target_pan, target_tilt)
            self._schedule_release()
            return self.snapshot()

    def _sweep(self, target_pan: float, target_tilt: float) -> None:
        """Interpolare la PANTILT_SPEED_DEG_PER_SEC — fara salturi bruste."""
        start_pan, start_tilt = self._pan, self._tilt
        delta = max(abs(target_pan - start_pan), abs(target_tilt - start_tilt))
        speed = max(1.0, config.PANTILT_SPEED_DEG_PER_SEC)
        steps = int(round(delta / speed * _UPDATE_HZ))
        if steps < 1:
            self._apply(target_pan, target_tilt)
            return
        for i in range(1, steps + 1):
            f = i / steps
            self._apply(
                start_pan + (target_pan - start_pan) * f,
                start_tilt + (target_tilt - start_tilt) * f,
            )
            time.sleep(1.0 / _UPDATE_HZ)

    def move_by(self, pan_delta: float = 0.0, tilt_delta: float = 0.0) -> dict:
        with self._lock:
            return self.set_angles(self._pan + pan_delta, self._tilt + tilt_delta)

    def look(self, direction: str, step: Optional[float] = None) -> dict:
        """Comanda relativa: left/right/up/down/center. Pan creste spre dreapta."""
        step = config.PANTILT_STEP_DEG if step is None else float(step)
        if direction == "center":
            return self.center()
        if direction == "left":
            return self.move_by(pan_delta=-step)
        if direction == "right":
            return self.move_by(pan_delta=step)
        if direction == "up":
            return self.move_by(tilt_delta=step)
        if direction == "down":
            return self.move_by(tilt_delta=-step)
        logger.warning("Directie pan&tilt necunoscuta: %s", direction)
        return self.snapshot()

    def center(self) -> dict:
        return self.set_angles(
            config.PANTILT_PAN_CENTER_DEG,
            config.PANTILT_TILT_CENTER_DEG,
        )

    # ─── taiere semnal in repaus ─────────────────────

    def _schedule_release(self) -> None:
        delay = config.PANTILT_IDLE_RELEASE_SEC
        if delay <= 0 or not self.available:
            return
        self._release_timer = threading.Timer(delay, self.release)
        self._release_timer.daemon = True
        self._release_timer.start()

    def _cancel_release(self) -> None:
        if self._release_timer:
            self._release_timer.cancel()
            self._release_timer = None

    def release(self) -> None:
        """Opreste PWM pe ambele canale: servo-ul tace si nu se mai incalzeste."""
        with self._lock:
            self._cancel_release()
            if not self.available or self._released:
                return
            try:
                self._write_channel(config.PANTILT_PAN_CHANNEL, None)
                self._write_channel(config.PANTILT_TILT_CHANNEL, None)
                self._released = True
            except OSError as exc:
                logger.error("Release pan&tilt esuat: %s", exc)

    # ─── stare / oprire ──────────────────────────────

    def snapshot(self) -> dict:
        """Stare + limite, ca dashboard-ul sa nu duplice configul robotului."""
        return {
            "pan": round(self._pan, 1),
            "tilt": round(self._tilt, 1),
            "hardware": self.available,
            "enabled": bool(config.PANTILT_ENABLED),
            "step": config.PANTILT_STEP_DEG,
            "limits": {
                "pan_min": config.PANTILT_PAN_MIN_DEG,
                "pan_max": config.PANTILT_PAN_MAX_DEG,
                "tilt_min": config.PANTILT_TILT_MIN_DEG,
                "tilt_max": config.PANTILT_TILT_MAX_DEG,
            },
        }

    def _close_bus(self) -> None:
        if self._bus is not None:
            try:
                self._bus.close()
            except Exception:
                pass
            self._bus = None

    def cleanup(self) -> None:
        self.release()
        self._close_bus()
