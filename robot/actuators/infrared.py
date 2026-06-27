import asyncio

import config
from utils.logger import get_logger

logger = get_logger("IR")

try:
    if not config.MOCK_HARDWARE:
        import RPi.GPIO as GPIO

        HAS_GPIO = True
    else:
        HAS_GPIO = False
except ImportError:
    HAS_GPIO = False


class InfraredEmitter:
    """OKY3273 IR emitter control via GPIO."""

    def __init__(self):
        if HAS_GPIO:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(config.IR_PIN, GPIO.OUT)
            logger.info("Emițător IR initializat")

    async def send(self, code: str):
        logger.info(f"Trimit cod IR: {code}")
        if config.MOCK_HARDWARE or not HAS_GPIO:
            logger.info(f"[Mock IR] {code}")
            return

        try:
            import pigpio

            pi = pigpio.pi()
            if not pi.connected:
                logger.error("pigpio daemon nu ruleaza")
                return
            # NEC protocol placeholder - adapt to actual remote codes
            logger.warning(f"Cod IR '{code}' - configureaza protocolul NEC in productie")
            pi.stop()
        except Exception as e:
            logger.error(f"Eroare IR: {e}")

    def cleanup(self):
        if HAS_GPIO:
            GPIO.cleanup(config.IR_PIN)
