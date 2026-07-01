"""GPIO partajat (RPi.GPIO / rpi-lgpio pe Pi 5).

Pe Pi 5 un pin poate fi rezervat o singura data per proces. Nu apelam
GPIO.cleanup() per-modul — doar cleanup_all() la oprirea robotului.
"""

import config
from utils.logger import get_logger

logger = get_logger("GPIO")

GPIO = None
HAS_GPIO = False
_initialized = False
_claimed_pins: set[int] = set()

if not config.MOCK_HARDWARE:
    try:
        import RPi.GPIO as _GPIO

        GPIO = _GPIO
        HAS_GPIO = True
    except ImportError as exc:
        logger.warning("RPi.GPIO indisponibil (%s) - mod simulare", exc)


def ensure_bcm() -> bool:
    global _initialized
    if not HAS_GPIO:
        return False
    if not _initialized:
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        _initialized = True
    return True


def setup_pin(pin: int, mode, initial=None, pull_up_down=None) -> None:
    """Rezerva un pin BCM (idempotent in acelasi proces)."""
    if not ensure_bcm():
        raise RuntimeError("GPIO indisponibil")
    if pin in _claimed_pins:
        return
    kwargs = {}
    if pull_up_down is not None:
        kwargs["pull_up_down"] = pull_up_down
    if initial is not None:
        GPIO.setup(pin, mode, initial=initial, **kwargs)
    else:
        GPIO.setup(pin, mode, **kwargs)
    _claimed_pins.add(pin)


def cleanup_all() -> None:
    """Elibereaza toti pinii — doar la shutdown, o singura data."""
    global _initialized
    if HAS_GPIO and _claimed_pins:
        try:
            GPIO.cleanup(list(_claimed_pins))
        except TypeError:
            GPIO.cleanup()
        except Exception as exc:
            logger.warning("GPIO cleanup esuat: %s", exc)
    _claimed_pins.clear()
    _initialized = False
