"""Traducator RO↔EN — coordonare STT/TTS cu dashboard PC."""

from __future__ import annotations

import aiohttp

import config
from utils.logger import get_logger

logger = get_logger("Translator")


class Translator:
    def __init__(self):
        self.active = False
        self.listen_lang = "ro"
        self.speak_lang = "en"

    def configure(
        self,
        active: bool = False,
        listen_lang: str = "ro",
        speak_lang: str = "en",
    ):
        self.active = active
        self.listen_lang = listen_lang if listen_lang in ("ro", "en") else "ro"
        self.speak_lang = speak_lang if speak_lang in ("ro", "en") else "en"
        logger.info(
            "Traducator: active=%s listen=%s speak=%s",
            active,
            self.listen_lang,
            self.speak_lang,
        )

    def stt_lang(self) -> str:
        return self.listen_lang if self.active else "ro"

    def stt_route(self) -> str:
        return "translator" if self.active else "dashboard"

    def output_lang(self, heard_lang: str) -> str:
        if not self.active:
            return heard_lang
        if heard_lang == self.listen_lang:
            return self.speak_lang
        return self.listen_lang

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        payload = {
            "text": text,
            "sourceLang": source_lang,
            "targetLang": target_lang,
        }
        try:
            timeout = aiohttp.ClientTimeout(total=30)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(config.TRANSLATE_URL, json=payload) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        logger.error("Translate API %s: %s", resp.status, body[:200])
                        return text
                    data = await resp.json()
                    return data.get("translation") or data.get("text") or text
        except Exception as exc:
            logger.error("Translate esuat: %s", exc)
            return text
