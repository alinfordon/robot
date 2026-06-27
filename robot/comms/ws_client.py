import asyncio
import json
import time

from utils.logger import get_logger

logger = get_logger("WS")

# Mesaje mici — prioritate la trimitere
_HIGH_PRIORITY = frozenset(
    {
        "STATE",
        "AI_RESPONSE",
        "SPEECH_RECOGNIZED",
        "TRANSLATION",
        "LOG",
    }
)


class RobotWSClient:
    """WebSocket client with automatic reconnect and bounded outbound traffic."""

    def __init__(self, url: str, command_handler, queue_max: int = 16):
        self.url = url
        self.command_handler = command_handler
        self.ws = None
        self.connected = False
        self.send_queue: asyncio.Queue = asyncio.Queue(maxsize=queue_max)
        self._pending_camera: dict | None = None
        self._dropped_camera = 0

    async def connect(self):
        delay = 1
        while True:
            try:
                import websockets

                async with websockets.connect(
                    self.url,
                    ping_interval=20,
                    ping_timeout=60,
                    max_size=8 * 1024 * 1024,
                ) as ws:
                    self.ws = ws
                    self.connected = True
                    delay = 1
                    self._pending_camera = None
                    logger.info("Conectat la PC: %s", self.url)
                    await asyncio.gather(self._receive_loop(), self._send_loop())
            except Exception as e:
                self.connected = False
                self.ws = None
                self._pending_camera = None
                logger.warning("Deconectat, retry in %ss: %s", delay, e)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)

    async def _receive_loop(self):
        async for message in self.ws:
            try:
                data = json.loads(message)
                if data.get("type") == "HEARTBEAT":
                    continue
                await self.command_handler(data)
            except json.JSONDecodeError:
                logger.error("Mesaj JSON invalid")

    async def _send_loop(self):
        while True:
            if self._pending_camera and self.ws and self.connected:
                msg = self._pending_camera
                self._pending_camera = None
                try:
                    await self.ws.send(json.dumps(msg))
                except Exception as e:
                    logger.error("Eroare trimitere camera: %s", e)

            try:
                message = await asyncio.wait_for(self.send_queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                continue

            if self.ws and self.connected:
                try:
                    await self.ws.send(json.dumps(message))
                except Exception as e:
                    logger.error("Eroare trimitere: %s", e)

    def _enqueue(self, message: dict):
        msg_type = message.get("type")

        if msg_type == "CAMERA_FRAME":
            if self._pending_camera is not None:
                self._dropped_camera += 1
            self._pending_camera = message
            return

        try:
            self.send_queue.put_nowait(message)
        except asyncio.QueueFull:
            if msg_type in _HIGH_PRIORITY:
                self._drop_low_priority()
                try:
                    self.send_queue.put_nowait(message)
                except asyncio.QueueFull:
                    logger.warning("Coada WS plina — mesaj %s pierdut", msg_type)
            # SENSORS / SYSTEM — ignora daca reteaua nu tine pasul

    def _drop_low_priority(self):
        kept = []
        while not self.send_queue.empty():
            try:
                item = self.send_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            if item.get("type") in _HIGH_PRIORITY:
                kept.append(item)
        for item in kept:
            try:
                self.send_queue.put_nowait(item)
            except asyncio.QueueFull:
                break

    def send(self, msg_type: str, payload: dict):
        if not self.connected:
            return
        message = {
            "type": msg_type,
            "payload": payload,
            "timestamp": int(time.time() * 1000),
        }
        try:
            loop = asyncio.get_running_loop()
            loop.call_soon(self._enqueue, message)
        except RuntimeError:
            pass

    async def send_async(self, msg_type: str, payload: dict):
        message = {
            "type": msg_type,
            "payload": payload,
            "timestamp": int(time.time() * 1000),
        }
        self._enqueue(message)
