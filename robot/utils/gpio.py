import config
from utils.logger import get_logger

logger = get_logger("GPIO")

GPIO = None
HAS_GPIO = False

if not config.MOCK_HARDWARE:
    try:
        import RPi.GPIO as _GPIO

        GPIO = _GPIO
        HAS_GPIO = True
    except ImportError as exc:
        logger.warning("RPi.GPIO indisponibil (%s) - mod simulare", exc)
