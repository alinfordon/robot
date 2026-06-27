import asyncio
import os
import tempfile
from pathlib import Path

import config
from utils.logger import get_logger

logger = get_logger("Speaker")


class Speaker:
    """Piper TTS bilingv RO/EN pe USB Audio."""

    def __init__(self):
        self._speaking = False
        self._models = {
            "ro": Path(config.PIPER_MODEL_PATH),
            "en": Path(config.PIPER_MODEL_PATH_EN),
        }

    def _resolve_model(self, lang: str) -> Path:
        lang = lang if lang in self._models else "ro"
        path = self._models[lang]
        if path.exists():
            return path
        fallback = self._models["ro"] if self._models["ro"].exists() else self._models["en"]
        return fallback

    async def say(self, text: str, lang: str = "ro"):
        if not text.strip():
            return
        self._speaking = True
        model_path = self._resolve_model(lang)
        logger.info("Vorbesc [%s]: %s...", lang, text[:60])

        if config.MOCK_HARDWARE or not model_path.exists():
            logger.warning("TTS indisponibil (model lipsa: %s)", model_path)
            logger.info("[Mock TTS %s] %s", lang, text)
            await asyncio.sleep(min(len(text) * 0.05, 5))
            self._speaking = False
            return

        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                wav_path = f.name

            proc = await asyncio.create_subprocess_exec(
                "piper",
                "--model",
                str(model_path),
                "--output_file",
                wav_path,
                stdin=asyncio.subprocess.PIPE,
            )
            await proc.communicate(input=text.encode("utf-8"))

            if proc.returncode == 0:
                logger.info("Redare [%s] pe %s", lang, config.AUDIO_PLAYBACK_DEVICE)
                play = await asyncio.create_subprocess_exec(
                    "aplay",
                    "-q",
                    "-D",
                    config.AUDIO_PLAYBACK_DEVICE,
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
