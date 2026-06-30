import asyncio

import config
from utils.gpio import GPIO, HAS_GPIO, setup_pin
from utils.logger import get_logger

logger = get_logger("IR")


class InfraredEmitter:
    """OKY3273 IR emitter control via GPIO."""

    def __init__(self):
        self._has_gpio = False
        if HAS_GPIO:
            try:
                setup_pin(config.IR_PIN, GPIO.OUT, initial=GPIO.LOW)
                self._has_gpio = True
                logger.info("Emițător IR initializat")
            except Exception as exc:
                logger.warning("Init IR esuat (%s) - mod simulare", exc)

    async def send(self, code: str):
        logger.info(f"Trimit cod IR: {code}")
        if config.MOCK_HARDWARE or not self._has_gpio:
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
        pass  # eliberare la shutdown global
