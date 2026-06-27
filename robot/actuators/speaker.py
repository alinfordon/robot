import asyncio
import subprocess
import tempfile
import os
from pathlib import Path

import config
from utils.logger import get_logger

logger = get_logger("Speaker")


class Speaker:
    def __init__(self):
        self._speaking = False
        self.model_ro = Path(config.PIPER_MODEL_PATH)
        en_path = getattr(config, "PIPER_MODEL_PATH_EN", "") or ""
        self.model_en = Path(en_path) if en_path else None

    def _model_for_lang(self, lang: str) -> Path:
        lang = (lang or "ro").lower()
        if lang.startswith("en"):
            if self.model_en and self.model_en.exists():
                return self.model_en
            logger.warning(
                "Model Piper EN lipseste (%s) — instaleaza PIPER_MODEL_PATH_EN pe Pi",
                self.model_en or "nedefinit",
            )
        return self.model_ro

    async def say(self, text: str, lang: str = "ro"):
        if not text.strip():
            return
        self._speaking = True
        model_path = self._model_for_lang(lang)
        used_en = lang.startswith("en") and self.model_en and model_path == self.model_en
        logger.info(f"Vorbesc [{'EN' if used_en else 'RO'}/{lang}]: {text[:60]}...")

        if config.MOCK_HARDWARE or not model_path.exists():
            logger.info(f"[Mock TTS/{lang}] {text}")
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
                play = await asyncio.create_subprocess_exec(
                    "aplay",
                    "-D",
                    f"plughw:{config.AUDIO_DEVICE_INDEX},0",
                    wav_path,
                )
                await play.wait()
            os.unlink(wav_path)
        except Exception as e:
            logger.error(f"Eroare TTS: {e}")
        finally:
            self._speaking = False

    @property
    def is_speaking(self) -> bool:
        return self._speaking
