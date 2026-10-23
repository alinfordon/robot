import asyncio
import audioop
import os
import tempfile
import wave
from pathlib import Path

import config
from utils.audio_device import resolve_playback_device
from utils.logger import get_logger
from utils.piper_bin import resolve_piper_bin

logger = get_logger("Speaker")


class Speaker:
    """Piper TTS bilingv RO/EN pe MAX98357 (I2S) sau USB Audio."""

    def __init__(self):
        self._speaking = False
        self._volume = int(getattr(config, "AUDIO_VOLUME_DEFAULT", 80))
        self._volume = max(0, min(100, self._volume))
        self._models = {
            "ro": Path(config.PIPER_MODEL_PATH),
            "en": Path(config.PIPER_MODEL_PATH_EN),
        }
        self._piper = resolve_piper_bin()
        self._device = resolve_playback_device(
            config.AUDIO_PLAYBACK_DEVICE,
            audio_output=getattr(config, "AUDIO_OUTPUT", "i2s"),
            card_hint=getattr(config, "AUDIO_PLAYBACK_CARD", "MAX98357A"),
        )
        if self._device != config.AUDIO_PLAYBACK_DEVICE:
            logger.info(
                "Audio device corectat: %s -> %s",
                config.AUDIO_PLAYBACK_DEVICE,
                self._device,
            )
        logger.info("Volum TTS initial: %s%%", self._volume)

    @property
    def volume(self) -> int:
        return self._volume

    def set_volume(self, percent: float | int) -> int:
        self._volume = max(0, min(100, int(round(float(percent)))))
        logger.info("Volum TTS: %s%%", self._volume)
        return self._volume

    def _resolve_model(self, lang: str) -> Path:
        lang = lang if lang in self._models else "ro"
        path = self._models[lang]
        if path.exists():
            return path
        fallback = self._models["ro"] if self._models["ro"].exists() else self._models["en"]
        return fallback

    def _apply_volume(self, wav_path: str) -> None:
        """Scaleaza amplitudinea WAV (MAX98357 nu are mixer ALSA util)."""
        factor = self._volume / 100.0
        if abs(factor - 1.0) < 0.005:
            return
        try:
            with wave.open(wav_path, "rb") as reader:
                params = reader.getparams()
                frames = reader.readframes(reader.getnframes())
            if factor <= 0:
                frames = b"\x00" * len(frames)
            else:
                frames = audioop.mul(frames, params.sampwidth, factor)
            with wave.open(wav_path, "wb") as writer:
                writer.setparams(params)
                writer.writeframes(frames)
        except Exception as exc:
            logger.warning("Nu am putut aplica volumul pe WAV: %s", exc)

    async def say(self, text: str, lang: str = "ro"):
        if not text.strip():
            return
        if self._volume <= 0:
            logger.info("Vorbesc (mut): [%s] %s...", lang, text[:40])
            self._speaking = False
            return

        self._speaking = True
        model_path = self._resolve_model(lang)
        logger.info("Vorbesc [%s] vol=%s%%: %s...", lang, self._volume, text[:60])

        if config.MOCK_HARDWARE or not model_path.exists():
            logger.warning("TTS indisponibil (model lipsa: %s)", model_path)
            logger.info("[Mock TTS %s] %s", lang, text)
            await asyncio.sleep(min(len(text) * 0.05, 5))
            self._speaking = False
            return

        if self._piper == "piper" or not Path(self._piper).exists():
            logger.error(
                "Piper lipsa (%s). Ruleaza: pip install 'piper-tts>=1.2.0' in venv",
                self._piper,
            )
            self._speaking = False
            return

        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                wav_path = f.name

            proc = await asyncio.create_subprocess_exec(
                self._piper,
                "--model",
                str(model_path),
                "--output_file",
                wav_path,
                stdin=asyncio.subprocess.PIPE,
            )
            await proc.communicate(input=text.encode("utf-8"))

            if proc.returncode == 0:
                await asyncio.to_thread(self._apply_volume, wav_path)
                logger.info("Redare [%s] pe %s @ %s%%", lang, self._device, self._volume)
                play = await asyncio.create_subprocess_exec(
                    "aplay",
                    "-q",
                    "-D",
                    self._device,
                    wav_path,
                )
                await play.wait()
            os.unlink(wav_path)
        except Exception as exc:
            logger.error("Eroare TTS: %s", exc)
        finally:
            self._speaking = False

    @property
    def is_speaking(self) -> bool:
        return self._speaking
