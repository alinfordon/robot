import asyncio
import json
import queue
import threading
from pathlib import Path
from typing import Callable, Optional

import config
from utils.logger import get_logger

logger = get_logger("Hearing")

try:
    import sounddevice as sd

    HAS_AUDIO = True
except ImportError:
    HAS_AUDIO = False

try:
    from vosk import Model, KaldiRecognizer

    HAS_VOSK = True
except ImportError:
    HAS_VOSK = False


class HearingSystem:
    def __init__(self, on_speech: Optional[Callable[[str], None]] = None):
        self.on_speech = on_speech
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self.model = None
        self._audio_queue: queue.Queue = queue.Queue()
        self.enabled = True
        self.route = "local"  # "local" | "dashboard" | "translator"
        self.lang = "ro"  # "ro" | "en"
        self._paused = False

    def pause(self):
        """Opreste procesarea STT cat timp robotul vorbeste (anti-feedback)."""
        self._paused = True
        self._drain_queue()
        logger.debug("STT pe pauza (TTS activ)")

    def resume(self):
        if not self._paused:
            return
        self._paused = False
        self._drain_queue()
        logger.debug("STT reluat")

    def _drain_queue(self):
        while True:
            try:
                self._audio_queue.get_nowait()
            except queue.Empty:
                break

    def configure(self, enabled: bool, route: str = "local", lang: str = "ro"):
        route = route if route in ("local", "dashboard", "translator") else "local"
        lang = lang if lang in ("ro", "en", "auto") else "ro"
        lang_changed = lang != self.lang
        route_changed = route != self.route

        if route_changed:
            self.route = route
            logger.info(f"STT route: {route}")

        if lang_changed:
            self.lang = lang
            logger.info(f"STT lang: {lang}")

        if enabled == self.enabled and not lang_changed and self._thread and self._thread.is_alive():
            return

        self.enabled = enabled
        if enabled:
            if lang_changed and self._thread and self._thread.is_alive():
                self.stop()
            if not self._thread or not self._thread.is_alive():
                self.start()
        else:
            self.stop()
            logger.info("STT oprit")

    def _load_model(self) -> bool:
        if not HAS_VOSK:
            logger.warning("Vosk indisponibil")
            return False
        if self.lang == "en" and config.VOSK_MODEL_PATH_EN:
            model_path = Path(config.VOSK_MODEL_PATH_EN)
            if not model_path.exists():
                logger.warning(f"Model Vosk EN negasit: {model_path}, folosesc RO")
                model_path = Path(config.VOSK_MODEL_PATH)
        else:
            model_path = Path(config.VOSK_MODEL_PATH)
        if not model_path.exists():
            logger.warning(f"Model Vosk negasit: {model_path}")
            return config.MOCK_HARDWARE
        self.model = Model(str(model_path))
        logger.info(f"Model Vosk incarcat ({self.lang}): {model_path}")
        return True

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        if not self._load_model() and not config.MOCK_HARDWARE:
            return
        self._running = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        logger.info("STT pornit")

    def stop(self):
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None

    def _listen_loop(self):
        if config.MOCK_HARDWARE or not HAS_AUDIO or not self.model:
            logger.info("Mod simulare auz - STT dezactivat")
            return

        recognizer = KaldiRecognizer(self.model, config.AUDIO_SAMPLERATE)
        recognizer.SetWords(True)

        def callback(indata, frames, time_info, status):
            if status:
                logger.warning(f"Audio status: {status}")
            if self._paused:
                return
            self._audio_queue.put(bytes(indata))

        with sd.RawInputStream(
            samplerate=config.AUDIO_SAMPLERATE,
            blocksize=8000,
            dtype="int16",
            channels=1,
            device=config.AUDIO_DEVICE_INDEX,
            callback=callback,
        ):
            while self._running:
                try:
                    data = self._audio_queue.get(timeout=1)
                    if self._paused:
                        continue
                    if recognizer.AcceptWaveform(data):
                        result = json.loads(recognizer.Result())
                        text = result.get("text", "").strip()
                        if text and self.on_speech:
                            logger.info(f"Recunoscut: {text}")
                            self.on_speech(text)
                    else:
                        partial = json.loads(recognizer.PartialResult())
                        partial_text = partial.get("partial", "")
                        if partial_text:
                            pass  # optional: streaming partial results
                except queue.Empty:
                    continue
                except Exception as e:
                    logger.error(f"Eroare STT: {e}")

    async def run_mock_loop(self):
        """Placeholder for testing without microphone."""
        if not config.MOCK_HARDWARE:
            return
        while self._running:
            await asyncio.sleep(60)
