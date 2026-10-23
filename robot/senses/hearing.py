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
except Exception:
    HAS_AUDIO = False

try:
    from vosk import Model, KaldiRecognizer

    HAS_VOSK = True
except Exception:
    HAS_VOSK = False

SpeechCallback = Callable[[str, str, str], None]


class HearingSystem:
    """Vosk STT bilingv RO/EN — microfon camera USB pe Pi."""

    def __init__(self, on_speech: Optional[SpeechCallback] = None):
        self.on_speech = on_speech
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._audio_queue: queue.Queue = queue.Queue()
        self._models: dict[str, Model] = {}
        self._recognizer: Optional[KaldiRecognizer] = None
        # Implicit ON — dashboard poate dezactiva daca alege microfon PC
        self._enabled = True
        self._route = "dashboard"
        self._lang = "ro"
        self._lock = threading.Lock()
        self._resample_state = None
        self._channels = 1
        self._disabled_warned = False

    def set_config(
        self,
        enabled: bool = True,
        route: str = "dashboard",
        lang: str = "ro",
    ):
        with self._lock:
            was = self._enabled
            self._enabled = enabled
            self._route = route
            lang = lang if lang in ("ro", "en") else "ro"
            if lang != self._lang:
                self._lang = lang
                self._recognizer = self._make_recognizer(lang)
            if was and not enabled:
                self._disabled_warned = False
        logger.info("STT config: enabled=%s route=%s lang=%s", enabled, route, lang)
        if not enabled:
            logger.warning(
                "STT pe robot OPRIT din dashboard — alege Microfon: Raspberry Pi (Vosk)"
            )

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

    def _try_open_settings(
        self, device: int | str, rate: int, channels: int
    ) -> tuple[int | str, int, int] | None:
        try:
            sd.check_input_settings(
                device=device,
                samplerate=rate,
                channels=channels,
                dtype="int16",
            )
            info = sd.query_devices(device, "input")
            logger.info(
                "Microfon OK: #%s %r @ %s Hz ch=%s",
                device,
                info.get("name"),
                rate,
                channels,
            )
            return device, rate, channels
        except Exception as exc:
            logger.debug(
                "Microfon skip #%s rate=%s ch=%s: %s", device, rate, channels, exc
            )
            return None

    def _resolve_input_settings(self) -> tuple[int | str, int, int] | None:
        """Returneaza (device, rate, channels). Camerele USB sunt deseori stereo @ 48k."""
        from utils.audio_input import find_usb_mic_index, list_input_devices

        preferred = config.AUDIO_INPUT_DEVICE
        usb_idx = find_usb_mic_index(sd, preferred)

        devices: list[int | str] = []
        if usb_idx is not None:
            devices.append(usb_idx)
        if (
            preferred not in (None, "", "auto", "usb", "camera", "default")
            and preferred not in devices
        ):
            devices.append(preferred)
        for i, _name, _ch in list_input_devices(sd):
            if i not in devices:
                devices.append(i)
        if "default" not in devices:
            devices.append("default")

        target = config.AUDIO_SAMPLERATE
        rates_for = lambda native: list(
            dict.fromkeys([target, native, 48000, 44100, 16000])
        )

        for device in devices:
            try:
                info = sd.query_devices(device, "input")
                native = int(info.get("default_samplerate") or target)
                max_ch = int(info.get("max_input_channels") or 1)
            except Exception:
                native = target
                max_ch = 2

            channel_opts = [1]
            if max_ch >= 2:
                channel_opts.append(2)

            for rate in rates_for(native):
                for ch in channel_opts:
                    got = self._try_open_settings(device, rate, ch)
                    if got:
                        return got

        logger.error("Niciun dispozitiv de intrare audio compatibil")
        try:
            for i, name, ch in list_input_devices(sd):
                logger.error("  input candidate #%s ch=%s %r", i, ch, name)
        except Exception:
            pass
        return None

    def _to_vosk_pcm(self, data: bytes, capture_rate: int, channels: int) -> bytes:
        # Downmix stereo -> mono pentru Vosk
        if channels == 2:
            data = audioop.tomono(data, 2, 0.5, 0.5)
        elif channels > 2:
            # ia primul canal
            data = audioop.tomono(data, 2, 1.0, 0.0)
        if capture_rate != config.AUDIO_SAMPLERATE:
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
                settings = self._resolve_input_settings()
                if not settings:
                    time.sleep(5)
                    continue
                device, capture_rate, channels = settings
                self._channels = channels
                self._resample_state = None
                logger.info(
                    "Deschid microfon device=%s rate=%s ch=%s",
                    device,
                    capture_rate,
                    channels,
                )

                with sd.RawInputStream(
                    samplerate=capture_rate,
                    blocksize=max(4000, capture_rate // 4),
                    dtype="int16",
                    channels=channels,
                    device=device,
                    callback=callback,
                ):
                    while self._running:
                        with self._lock:
                            enabled = self._enabled
                        if not enabled:
                            if not self._disabled_warned:
                                logger.warning(
                                    "Astept: STT disabled (microfon PC in dashboard). "
                                    "Selecteaza «Raspberry Pi (Vosk)»."
                                )
                                self._disabled_warned = True
                            time.sleep(0.5)
                            continue

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
                            pcm = self._to_vosk_pcm(data, capture_rate, channels)
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
