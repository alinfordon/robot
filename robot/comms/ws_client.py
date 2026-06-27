import asyncio
import json
import time
from utils.logger import get_logger

logger = get_logger("WS")


class RobotWSClient:
    """WebSocket client with automatic reconnect."""

    def __init__(self, url: str, command_handler):
        self.url = url
        self.command_handler = command_handler
        self.ws = None
        self.connected = False
        self.send_queue: asyncio.Queue = asyncio.Queue()
        self._loop: asyncio.AbstractEventLoop | None = None

    async def connect(self):
        delay = 1
        while True:
            try:
                import websockets

                async with websockets.connect(self.url, ping_interval=20) as ws:
                    self.ws = ws
                    self.connected = True
                    delay = 1
                    logger.info(f"Conectat la PC: {self.url}")
                    await asyncio.gather(self._receive_loop(), self._send_loop())
            except Exception as e:
                self.connected = False
                self.ws = None
                logger.warning(f"Deconectat, retry in {delay}s: {e}")
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
            message = await self.send_queue.get()
            if self.ws and self.connected:
                try:
                    await self.ws.send(json.dumps(message))
                except Exception as e:
                    logger.error(f"Eroare trimitere: {e}")

    def send(self, msg_type: str, payload: dict):
        message = {
            "type": msg_type,
            "payload": payload,
            "timestamp": int(time.time() * 1000),
        }
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.send_queue.put(message))
        except RuntimeError:
            pass

    async def send_async(self, msg_type: str, payload: dict):
        message = {
            "type": msg_type,
            "payload": payload,
            "timestamp": int(time.time() * 1000),
        }
        await self.send_queue.put(message)
