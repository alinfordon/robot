import asyncio
import audioop
import json
import queue
import re
import threading
import time
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

SpeechCallback = Callable[[str, str, str], None]


class HearingSystem:
    """Vosk STT bilingv RO/EN pentru dashboard si traducator."""

    def __init__(self, on_speech: Optional[SpeechCallback] = None):
        self.on_speech = on_speech
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._audio_queue: queue.Queue = queue.Queue()
        self._models: dict[str, Model] = {}
        self._recognizer: Optional[KaldiRecognizer] = None
        self._enabled = True
        self._route = "dashboard"
        self._lang = "ro"
        self._lock = threading.Lock()
        self._resample_state = None

    def set_config(
        self,
        enabled: bool = True,
        route: str = "dashboard",
        lang: str = "ro",
    ):
        with self._lock:
            self._enabled = enabled
            self._route = route
            lang = lang if lang in ("ro", "en") else "ro"
            if lang != self._lang:
                self._lang = lang
                self._recognizer = self._make_recognizer(lang)
        logger.info("STT config: enabled=%s route=%s lang=%s", enabled, route, lang)

    def _load_models(self) -> bool:
        if not HAS_VOSK:
            logger.warning("Vosk indisponibil")
            return False

        paths = {
            "ro": Path(config.VOSK_MODEL_PATH),
            "en": Path(config.VOSK_MODEL_PATH_EN),
        }
        loaded = False
        for lang, path in paths.items():
            if not path.exists():
                logger.warning("Model Vosk %s negasit: %s", lang, path)
                continue
            self._models[lang] = Model(str(path))
            logger.info("Model Vosk %s incarcat", lang)
            loaded = True

        if loaded:
            self._recognizer = self._make_recognizer(self._lang)
        return loaded

    def _make_recognizer(self, lang: str) -> Optional[KaldiRecognizer]:
        model = self._models.get(lang)
        if not model:
            fallback = "ro" if "ro" in self._models else next(iter(self._models), None)
            if fallback:
                model = self._models[fallback]
                self._lang = fallback
            else:
                return None
        return KaldiRecognizer(model, config.AUDIO_SAMPLERATE)

    def start(self):
        if not self._load_models() and not config.MOCK_HARDWARE:
            return
        self._running = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        logger.info("STT pornit (lang=%s)", self._lang)

    def stop(self):
        self._running = False

    def _resolve_input_settings(self) -> tuple[int | str, int]:
        preferred = config.AUDIO_INPUT_DEVICE
        candidates: list[tuple[int | str, int]] = [
            (preferred, config.AUDIO_SAMPLERATE),
            ("default", config.AUDIO_SAMPLERATE),
        ]

        for device, rate in candidates:
            try:
                sd.check_input_settings(
                    device=device,
                    samplerate=rate,
                    channels=1,
                    dtype="int16",
                )
                if device != preferred or rate != config.AUDIO_SAMPLERATE:
                    logger.info(
                        "Microfon: device=%s samplerate=%s (config: %s @ %s)",
                        device,
                        rate,
                        preferred,
                        config.AUDIO_SAMPLERATE,
                    )
                return device, rate
            except Exception:
                continue

        for device in (preferred, "default"):
            try:
                info = sd.query_devices(device, "input")
                native = int(info["default_samplerate"])
                sd.check_input_settings(
                    device=device,
                    samplerate=native,
                    channels=1,
                    dtype="int16",
                )
                logger.info(
                    "Microfon native %s Hz pe device=%s — resample la %s",
                    native,
                    device,
                    config.AUDIO_SAMPLERATE,
                )
                return device, native
            except Exception:
                continue

        raise RuntimeError("Niciun dispozitiv de intrare audio compatibil")

    def _to_vosk_pcm(self, data: bytes, capture_rate: int) -> bytes:
        if capture_rate == config.AUDIO_SAMPLERATE:
            return data
        data, self._resample_state = audioop.ratecv(
            data,
            2,
            1,
            capture_rate,
            config.AUDIO_SAMPLERATE,
            self._resample_state,
        )
        return data

    def _listen_loop(self):
        if config.MOCK_HARDWARE or not HAS_AUDIO or not self._models:
            logger.info("Mod simulare auz - STT dezactivat")
            return

        def callback(indata, frames, time_info, status):
            if status:
                logger.warning("Audio status: %s", status)
            with self._lock:
                if self._enabled:
                    self._audio_queue.put(bytes(indata))

        while self._running:
            try:
                device, capture_rate = self._resolve_input_settings()
                self._resample_state = None
                logger.info(
                    "Deschid microfon device=%s rate=%s", device, capture_rate
                )

                with sd.RawInputStream(
                    samplerate=capture_rate,
                    blocksize=max(4000, capture_rate // 4),
                    dtype="int16",
                    channels=1,
                    device=device,
                    callback=callback,
                ):
                    while self._running:
                        try:
                            data = self._audio_queue.get(timeout=1)
                        except queue.Empty:
                            continue

                        with self._lock:
                            if not self._enabled or not self._recognizer:
                                continue
                            recognizer = self._recognizer
                            route = self._route
                            lang = self._lang

                        try:
                            pcm = self._to_vosk_pcm(data, capture_rate)
                            if recognizer.AcceptWaveform(pcm):
                                result = json.loads(recognizer.Result())
                                text = result.get("text", "").strip()
                                if text and self.on_speech:
                                    logger.info("Recunoscut [%s]: %s", lang, text)
                                    self.on_speech(text, lang, route)
                        except Exception as exc:
                            logger.error("Eroare STT: %s", exc)
            except Exception as exc:
                logger.error("Microfon indisponibil: %s — retry in 5s", exc)
                time.sleep(5)

    @staticmethod
    def guess_lang(text: str) -> str:
        if re.search(r"[ăâîșțĂÂÎȘȚ]", text):
            return "ro"
        return "en"

    async def run_mock_loop(self):
        if not config.MOCK_HARDWARE:
            return
        while self._running:
            await asyncio.sleep(60)
