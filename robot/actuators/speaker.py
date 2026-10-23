import array
import asyncio
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
        self._volume = int(getattr(config, "AUDIO_VOLUME_DEFAULT", 40))
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
        logger.info(
            "Volum TTS initial: %s%% (factor=%.3f)",
            self._volume,
            self._amplitude_factor(),
        )

    @property
    def volume(self) -> int:
        return self._volume

    def set_volume(self, percent: float | int) -> int:
        self._volume = max(0, min(100, int(round(float(percent)))))
        logger.info(
            "Volum TTS: %s%% (amplitudine=%.1f%%)",
            self._volume,
            self._amplitude_factor() * 100,
        )
        return self._volume

    def _amplitude_factor(self) -> float:
        """Slider 0-100 -> amplitudine WAV.

        MAX98357 e tare la gain hardware; curbă pătratică + plafon master
        ca 50 pe slider să fie clar mai încet, nu doar -6 dB.
        """
        linear = self._volume / 100.0
        if linear <= 0:
            return 0.0
        master = float(getattr(config, "AUDIO_VOLUME_MASTER", 0.40))
        master = max(0.05, min(1.0, master))
        # putere 2.2 ≈ mai agresiv spre volume mici
        return (linear**2.2) * master

    def _resolve_model(self, lang: str) -> Path:
        lang = lang if lang in self._models else "ro"
        path = self._models[lang]
        if path.exists():
            return path
        fallback = self._models["ro"] if self._models["ro"].exists() else self._models["en"]
        return fallback

    def _apply_volume(self, wav_path: str) -> None:
        """Scaleaza PCM int16/int8 (fara audioop — mai fiabil pe Pi)."""
        factor = self._amplitude_factor()
        try:
            with wave.open(wav_path, "rb") as reader:
                nch = reader.getnchannels()
                sw = reader.getsampwidth()
                rate = reader.getframerate()
                nframes = reader.getnframes()
                frames = reader.readframes(nframes)

            if sw == 2:
                samples = array.array("h")
                samples.frombytes(frames)
                if factor <= 0:
                    for i in range(len(samples)):
                        samples[i] = 0
                elif abs(factor - 1.0) >= 0.001:
                    for i in range(len(samples)):
                        v = int(samples[i] * factor)
                        if v > 32767:
                            v = 32767
                        elif v < -32768:
                            v = -32768
                        samples[i] = v
                out = samples.tobytes()
            elif sw == 1:
                samples = array.array("B")
                samples.frombytes(frames)
                if factor <= 0:
                    for i in range(len(samples)):
                        samples[i] = 128
                elif abs(factor - 1.0) >= 0.001:
                    for i in range(len(samples)):
                        centered = samples[i] - 128
                        v = int(centered * factor) + 128
                        samples[i] = max(0, min(255, v))
                out = samples.tobytes()
            else:
                logger.warning("WAV sampwidth=%s neacceptat pentru volum — redare neschimbata", sw)
                return

            peak = 0
            if sw == 2 and samples:
                peak = max(abs(s) for s in samples[:: max(1, len(samples) // 2000)])
            logger.info(
                "Volum aplicat: slider=%s%% factor=%.3f peak~%s",
                self._volume,
                factor,
                peak,
            )

            with wave.open(wav_path, "wb") as writer:
                writer.setnchannels(nch)
                writer.setsampwidth(sw)
                writer.setframerate(rate)
                writer.writeframes(out)
        except Exception as exc:
            logger.warning("Nu am putut aplica volumul pe WAV: %s", exc)

    async def say(self, text: str, lang: str = "ro"):
        if not text.strip():
            return
        if self._volume <= 0 or self._amplitude_factor() <= 0:
            logger.info("Vorbesc (mut): [%s] %s...", lang, text[:40])
            self._speaking = False
            return

        self._speaking = True
        model_path = self._resolve_model(lang)
        logger.info(
            "Vorbesc [%s] vol=%s%% amp=%.1f%%: %s...",
            lang,
            self._volume,
            self._amplitude_factor() * 100,
            text[:60],
        )

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
                logger.info("Redare [%s] pe %s @ slider %s%%", lang, self._device, self._volume)
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
