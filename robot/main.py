#!/usr/bin/env python3
"""ROBO_V1 - Entry point for Raspberry Pi robot."""

import asyncio
import signal
import socket
import sys

import config
from actuators.display import RobotDisplay
from actuators.infrared import InfraredEmitter
from actuators.motors import MotorController
from actuators.speaker import Speaker
from brain.llm_client import ask
from brain.router import VoiceRouter
from brain.translator import Translator
from comms.ws_client import RobotWSClient
from senses.encoders import WheelEncoders
from senses.hearing import HearingSystem
from senses.proximity import ProximitySensors
from senses.vision import VisionSystem
from utils.logger import get_logger
from utils.gpio import cleanup_all
from utils.state import Mood, RobotContext, RobotMode, RobotState

logger = get_logger("Main")


class RoboV1:
    def __init__(self):
        self.ctx = RobotContext()
        self.proximity = ProximitySensors()
        self.motors = MotorController(proximity_check=self.proximity.is_clear)
        self.encoders = WheelEncoders(motor_sign=self.motors.wheel_signs)
        self.speaker = Speaker()
        self.infrared = InfraredEmitter()
        self.display: RobotDisplay | None = None
        try:
            if not config.MOCK_HARDWARE:
                self.display = RobotDisplay()
                self.display.show_boot()
        except Exception as e:
            logger.warning(f"Display indisponibil: {e}")
            self.display = None
        self.ws: RobotWSClient | None = None
        self.vision: VisionSystem | None = None
        self.hearing: HearingSystem | None = None
        self.router: VoiceRouter | None = None
        self.translator = Translator()
        self._chat_history: list = []
        self._running = True

    async def start(self):
        logger.info("ROBO_V1 porneste...")
        self.proximity.start()
        self.encoders.start()

        self.ws = RobotWSClient(config.WS_URL, self.handle_command)
        self.vision = VisionSystem(
            on_objects=self._on_objects,
            on_frame=self._on_frame,
            should_stream=lambda: bool(self.ws and self.ws.connected),
        )
        self.hearing = HearingSystem(on_speech=self._on_speech)
        self.hearing.start()

        self.router = VoiceRouter(
            motor_move=self._motor_move,
            ai_handler=self._ai_handler,
            speaker_say=self.speaker.say,
            motor_timed=self._timed_move,
        )

        tasks = [
            asyncio.create_task(self.ws.connect()),
            asyncio.create_task(self._sensor_loop()),
            asyncio.create_task(self._encoder_loop()),
            asyncio.create_task(self.vision.run_loop()),
            asyncio.create_task(self._system_monitor_loop()),
            asyncio.create_task(self._navigation_loop()),
        ]

        if self.display:
            tasks.append(asyncio.create_task(self._display_startup()))

        await asyncio.gather(*tasks, return_exceptions=True)

    async def _display_startup(self):
        """Arata IP-ul dupa boot, apoi porneste auto-update-ul display-ului."""
        try:
            self.display.show_ip_qr(self._get_local_ip())
            await asyncio.sleep(5)
            self.display.start_auto_update(self._get_display_state)
        except Exception as e:
            logger.warning(f"Pornire display esuata: {e}")

    @staticmethod
    def _get_local_ip() -> str:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    @staticmethod
    def _get_wifi() -> dict:
        """Semnal WiFi din /proc/net/wireless (ieftin, fara subprocese)."""
        info = {"connected": False, "percent": 0, "dbm": None}
        try:
            with open("/proc/net/wireless") as f:
                for line in f:
                    s = line.strip()
                    if s.startswith("wlan0"):
                        parts = s.replace(":", " ").split()
                        link = float(parts[2].rstrip("."))
                        level = float(parts[3].rstrip("."))
                        if link > 0:
                            pct = max(0, min(100, int(round(link / 70.0 * 100))))
                            info.update(connected=True, percent=pct, dbm=int(level))
                        break
        except Exception:
            pass
        return info

    def _get_display_state(self) -> dict:
        """Aduna datele necesare pentru show_status()."""
        cpu = ram = 0.0
        temp = 45.0
        try:
            import psutil

            cpu = psutil.cpu_percent(interval=None)
            ram = psutil.virtual_memory().percent
        except Exception:
            pass
        try:
            with open("/sys/class/thermal/thermal_zone0/temp") as f:
                temp = int(f.read()) / 1000
        except OSError:
            pass

        readings = {}
        try:
            readings = self.proximity.get_readings() or {}
        except Exception:
            pass

        def _pick(*keys, default=150.0):
            for k in keys:
                if k in readings:
                    try:
                        return float(readings[k])
                    except (TypeError, ValueError):
                        pass
            return default

        sensors = {
            "front": _pick("front", "front_center"),
            "left": _pick("left"),
            "right": _pick("right"),
            "back": _pick("back"),
        }

        uptime_s = int(self.ctx.uptime())
        uptime = f"{uptime_s // 3600:02d}:{(uptime_s % 3600) // 60:02d}:{uptime_s % 60:02d}"

        return {
            "mood": self.ctx.mood.value,
            "mode": self.ctx.mode.value,
            "ip": self._get_local_ip(),
            "temp": temp,
            "cpu": cpu,
            "ram": ram,
            "battery": 100.0,
            "ws_connected": bool(self.ws and self.ws.connected),
            "wifi": self._get_wifi(),
            "sensors": sensors,
            "ai_provider": "ollama",
            "uptime": uptime,
        }

    async def handle_command(self, data: dict):
        msg_type = data.get("type", "")
        payload = data.get("payload", {})
        logger.info(f"Comanda: {msg_type}")

        if msg_type == "MOVE":
            direction = payload.get("direction", "stop")
            speed = float(payload.get("speed", config.MOTOR_SPEED_DEFAULT))
            distance_cm = payload.get("distance_cm")
            duration_ms = payload.get("duration_ms")
            degrees = payload.get("degrees")
            if direction != "stop" and (distance_cm or duration_ms or degrees):
                await self._timed_move(direction, speed, distance_cm, duration_ms, degrees)
            else:
                await asyncio.to_thread(self._motor_move, direction, speed)

        elif msg_type == "SPEAK":
            text = payload.get("text", "")
            lang = payload.get("lang", "ro")
            self.ctx.set_state(RobotState.SPEAKING, Mood.TALKING)
            self._send_state()
            await self.speaker.say(text, lang=lang)
            self.ctx.set_state(RobotState.IDLE, Mood.STANDBY)
            self._send_state()

        elif msg_type == "SET_STT_CONFIG":
            if self.hearing:
                self.hearing.set_config(
                    enabled=bool(payload.get("enabled", True)),
                    route=payload.get("route", "dashboard"),
                    lang=payload.get("lang", self.translator.stt_lang()),
                )

        elif msg_type == "SET_TRANSLATOR":
            self.translator.configure(
                active=bool(payload.get("active", False)),
                listen_lang=payload.get("listenLang", payload.get("listen_lang", "ro")),
                speak_lang=payload.get("speakLang", payload.get("speak_lang", "en")),
            )
            if self.hearing:
                self.hearing.set_config(
                    enabled=True,
                    route=self.translator.stt_route(),
                    lang=self.translator.stt_lang(),
                )

        elif msg_type == "TRANSLATE_SPEAK":
            text = payload.get("text", "")
            source = payload.get("sourceLang", payload.get("source_lang", "ro"))
            target = payload.get("targetLang", payload.get("target_lang", "en"))
            translated = await self.translator.translate(text, source, target)
            self.ctx.set_state(RobotState.SPEAKING, Mood.TALKING)
            self._send_state()
            await self.speaker.say(translated, lang=target)
            if self.ws:
                self.ws.send(
                    "TRANSLATION",
                    {
                        "original": text,
                        "translation": translated,
                        "sourceLang": source,
                        "targetLang": target,
                        "spoken_on_robot": True,
                    },
                )
            self.ctx.set_state(RobotState.IDLE, Mood.STANDBY)
            self._send_state()

        elif msg_type == "SET_MODE":
            mode = payload.get("mode", "manual")
            try:
                self.ctx.set_mode(RobotMode(mode))
            except ValueError:
                pass
            self._send_state()

        elif msg_type == "SET_SPEED":
            left = float(payload.get("left", 0))
            right = float(payload.get("right", 0))
            await asyncio.to_thread(self.motors.set_speed, left, right)

        elif msg_type == "IR_SEND":
            await self.infrared.send(payload.get("code", ""))

        elif msg_type == "RESET":
            self.ctx.reset()
            self.motors.stop()
            self._send_state()
            await self.ws.send_async("LOG", {"level": "info", "message": "Reset complet", "module": "main"})

        elif msg_type == "DETECTED_OBJECTS":
            objects = payload.get("objects", [])
            if self.vision:
                self.vision.set_detected_objects(objects)

    async def _timed_move(self, direction, speed, distance_cm=None, duration_ms=None, degrees=None):
        """Misca pe o distanta/unghi/timp dat, apoi opreste automat."""
        if duration_ms:
            secs = float(duration_ms) / 1000.0
        elif degrees and direction in ("left", "right"):
            secs = float(degrees) / max(1.0, config.MOTOR_DEG_PER_SEC)
        elif distance_cm:
            secs = float(distance_cm) / max(1.0, config.MOTOR_CM_PER_SEC)
        else:
            secs = 0.5
        secs = max(0.1, min(secs, config.MOTOR_MOVE_MAX_SEC))

        await asyncio.to_thread(self._motor_move, direction, speed)
        await asyncio.sleep(secs)
        await asyncio.to_thread(self._motor_move, "stop", 0)

    def _motor_move(self, direction: str, speed: float):
        if direction == "stop":
            self.motors.stop()
            self.ctx.set_state(RobotState.IDLE, Mood.STANDBY)
        else:
            self.ctx.set_state(RobotState.MOVING, Mood.HAPPY)
            if direction == "forward":
                self.motors.forward(speed)
            elif direction == "backward":
                self.motors.backward(speed)
            elif direction == "left":
                self.motors.turn_left(speed)
            elif direction == "right":
                self.motors.turn_right(speed)
        self._send_state()

    def _on_objects(self, objects: list):
        if self.ws:
            self.ws.send("DETECTED_OBJECTS", {"objects": objects})

    def _on_frame(self, b64: str, width: int, height: int):
        if self.ws and self.ws.connected:
            self.ws.send("CAMERA_FRAME", {"base64": b64, "width": width, "height": height})

    def _on_speech(self, text: str, lang: str = "ro", route: str = "dashboard"):
        if self.ws:
            self.ws.send(
                "SPEECH_RECOGNIZED",
                {"text": text, "lang": lang, "route": route},
            )
        self.ctx.set_state(RobotState.LISTENING, Mood.LISTENING)
        self._send_state()

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._process_speech(text, lang, route))
        except RuntimeError:
            pass

    async def _process_speech(self, text: str, lang: str = "ro", route: str = "dashboard"):
        if self.translator.active or route == "translator":
            target = self.translator.output_lang(lang)
            translated = await self.translator.translate(text, lang, target)
            if self.ws:
                self.ws.send(
                    "TRANSLATION",
                    {
                        "original": text,
                        "translation": translated,
                        "sourceLang": lang,
                        "targetLang": target,
                        "spoken_on_robot": True,
                    },
                )
            self.ctx.set_state(RobotState.SPEAKING, Mood.TALKING)
            self._send_state()
            await self.speaker.say(translated, lang=target)
            self.ctx.set_state(RobotState.IDLE, Mood.STANDBY)
            self._send_state()
            return

        if self.router:
            await self.router.route(text)

    async def _ai_handler(self, text: str):
        self.ctx.set_state(RobotState.THINKING, Mood.THINKING)
        self._send_state()

        robot_context = {
            "sensors": self.proximity.get_readings(),
            "objects": self.vision.last_objects if self.vision else [],
            "state": self.ctx.state.value,
            "mode": self.ctx.mode.value,
        }

        image_b64 = None
        if self.vision:
            image_b64 = self.vision.get_last_frame_b64()

        reply, model, provider = await ask(
            text, self._chat_history, image_b64, robot_context
        )
        self._chat_history.append({"role": "user", "content": text})
        self._chat_history.append({"role": "assistant", "content": reply})

        if self.ws:
            self.ws.send(
                "AI_RESPONSE",
                {
                    "text": reply,
                    "model": model,
                    "provider": provider,
                    "spoken_on_robot": True,
                },
            )

        self.ctx.set_state(RobotState.SPEAKING, Mood.TALKING)
        self._send_state()
        await self.speaker.say(reply, lang="ro")
        self.ctx.set_state(RobotState.IDLE, Mood.STANDBY)
        self._send_state()

    def _send_state(self):
        if self.ws:
            self.ws.send("STATE", self.ctx.to_dict())

    async def _sensor_loop(self):
        while self._running:
            readings = self.proximity.get_readings()
            if self.ws and self.ws.connected:
                self.ws.send(
                    "SENSORS",
                    {
                        **readings,
                        "active": self.proximity.active_names(),
                        "hardware": self.proximity.has_hardware(),
                    },
                )

                if self.proximity.has_obstacle_ahead():
                    self.ctx.mood = Mood.ALERT
                    self._send_state()

            await asyncio.sleep(config.SENSOR_INTERVAL_SEC)

    async def _encoder_loop(self):
        interval = getattr(config, "ENCODER_SAMPLE_SEC", 0.5)
        while self._running:
            if self.ws and self.ws.connected:
                self.ws.send("ENCODERS", self.encoders.get_snapshot())
            await asyncio.sleep(interval)

    async def _system_monitor_loop(self):
        while self._running:
            try:
                import psutil

                cpu = psutil.cpu_percent(interval=0.5)
                ram = psutil.virtual_memory().percent
                temp = 45.0
                try:
                    with open("/sys/class/thermal/thermal_zone0/temp") as f:
                        temp = int(f.read()) / 1000
                except OSError:
                    pass

                if self.ws and self.ws.connected:
                    self.ws.send(
                        "SYSTEM",
                        {
                            "cpu": cpu,
                            "ram": ram,
                            "temp": temp,
                            "battery": 100.0,
                            "uptime": self.ctx.uptime(),
                        },
                    )
            except Exception as e:
                logger.error(f"Monitor eroare: {e}")

            await asyncio.sleep(5)

    async def _navigation_loop(self):
        """Autonomous obstacle avoidance when mode is auto or patrol."""
        while self._running:
            if self.ctx.mode in (RobotMode.AUTO, RobotMode.PATROL):
                if not self.proximity.is_clear("forward"):
                    self.ctx.set_state(RobotState.AVOIDING, Mood.ALERT)
                    self._send_state()
                    await asyncio.to_thread(self.motors.turn_right, 50)
                    await asyncio.sleep(0.5)
                    await asyncio.to_thread(self.motors.stop)
                    self.ctx.set_state(RobotState.IDLE, Mood.STANDBY)
                    self._send_state()
                elif self.ctx.mode == RobotMode.AUTO:
                    await asyncio.to_thread(
                        self.motors.forward, config.MOTOR_SPEED_DEFAULT
                    )
                    await asyncio.sleep(0.3)
            await asyncio.sleep(0.2)

    def shutdown(self):
        logger.info("Oprire ROBO_V1...")
        self._running = False
        self.proximity.cleanup()
        self.encoders.cleanup()
        self.motors.cleanup()
        self.infrared.cleanup()
        if self.vision:
            self.vision.stop()
        if self.display:
            self.display.stop()
        cleanup_all()


async def main():
    robot = RoboV1()

    def signal_handler(sig, frame):
        robot.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    await robot.start()


if __name__ == "__main__":
    asyncio.run(main())
