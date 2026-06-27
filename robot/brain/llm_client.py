import aiohttp

import config
from utils.logger import get_logger

logger = get_logger("LLM")


async def ask(message: str, history: list, image_b64: str = None, robot_context: dict = None):
    """Send AI request to PC dashboard - no local models on RPi."""
    payload = {
        "messages": history[-10:] + [{"role": "user", "content": message}],
        "imageBase64": image_b64,
        "provider": "ollama",
        "robotContext": robot_context or {},
        "speak": False,
    }

    try:
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(config.AI_URL, json=payload) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                data = await response.json()
                return (
                    data.get("reply", "Nu am putut genera raspuns."),
                    data.get("model", "unknown"),
                    data.get("provider", "ollama"),
                )
    except Exception as e:
        logger.error(f"Eroare AI: {e}")
        return ("Scuze, nu ma pot conecta la creierul din PC.", "error", "none")
