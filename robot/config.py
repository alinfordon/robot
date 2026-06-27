import os
from dotenv import load_dotenv

load_dotenv()

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PC_HOST = os.getenv("PC_HOST", "192.168.0.216")
PC_WS_PORT = int(os.getenv("PC_WS_PORT", "8081"))
PC_HTTP_PORT = int(os.getenv("PC_HTTP_PORT", "3001"))
WS_URL = f"ws://{PC_HOST}:{PC_WS_PORT}?role=robot"
AI_URL = f"http://{PC_HOST}:{PC_HTTP_PORT}/api/chat"
TRANSLATE_URL = f"http://{PC_HOST}:{PC_HTTP_PORT}/api/translate"

# Mock mode for development without GPIO/hardware
MOCK_HARDWARE = os.getenv("MOCK_HARDWARE", "0") == "1"

MODELS_ROOT = os.getenv("MODELS_ROOT", "/home/robot/models")

# GPIO BCM numbering
MOTOR_LEFT_IN1 = 17
MOTOR_LEFT_IN2 = 27
MOTOR_LEFT_ENA = 18
MOTOR_RIGHT_IN3 = 22
MOTOR_RIGHT_IN4 = 23
MOTOR_RIGHT_ENB = 24
MOTOR_PWM_FREQ = 1000

ENCODER_LEFT = 20
ENCODER_RIGHT = 16

# ─── HC-SR04 × 4 ─────────────────────────────────
# Față centru
US_FRONT_TRIG = 5
US_FRONT_ECHO = 6       # * div 1kΩ+2kΩ

# Lateral stânga
US_LEFT_TRIG = 13
US_LEFT_ECHO = 19       # * div 1kΩ+2kΩ

# Lateral dreapta
US_RIGHT_TRIG = 26
US_RIGHT_ECHO = 21      # * div 1kΩ+2kΩ

# Spate centru
US_BACK_TRIG = 4
US_BACK_ECHO = 25       # * div 1kΩ+2kΩ

# IR emitter (mutat de pe GPIO14 -> GPIO12: 14 e folosit de TFT_RST)
IR_PIN = 12

# Display TFT 2.8" ST7789V 240x320 (SPI0)
# Schema fire -> RPi 5 (BCM):
#   UCC->3.3V(1) rosu, GND->GND(6) negru,
#   CS->GPIO8(24) galben, RESET->GPIO14(8) portocaliu, DC->GPIO7(26) verde,
#   SDI/MOSI->GPIO10(19) albastru, SCK->GPIO11(23) violet,
#   LED->GPIO15(22) alb, SDO/MISO->GPIO9(21) gri
TFT_CS = 8
TFT_DC = 7
TFT_RST = 14
TFT_BL = 15
TFT_MOSI = 10
TFT_CLK = 11
TFT_MISO = 9
TFT_WIDTH = 240
TFT_HEIGHT = 320
TFT_SPI_SPEED = 40_000_000

# Audio — traducator RO<->EN (Vosk STT + Piper TTS)
VOSK_MODEL_PATH = os.getenv(
    "VOSK_MODEL_PATH", os.path.join(MODELS_ROOT, "vosk/romanian")
)
VOSK_MODEL_PATH_EN = os.getenv(
    "VOSK_MODEL_PATH_EN", os.path.join(MODELS_ROOT, "vosk/en")
)
PIPER_MODEL_PATH = os.getenv(
    "PIPER_MODEL_PATH",
    os.path.join(MODELS_ROOT, "piper/ro_RO-mihai-medium.onnx"),
)
PIPER_MODEL_PATH_EN = os.getenv(
    "PIPER_MODEL_PATH_EN",
    os.path.join(MODELS_ROOT, "piper/en_US-lessac-medium.onnx"),
)
AUDIO_PLAYBACK_CARD = os.getenv("AUDIO_PLAYBACK_CARD", "0")
AUDIO_PLAYBACK_DEVICE = os.getenv(
    "AUDIO_PLAYBACK_DEVICE", f"plughw:{AUDIO_PLAYBACK_CARD},0"
)


def _parse_audio_device(value: str | None, fallback: str = "default") -> int | str:
    raw = (value or fallback).strip()
    return int(raw) if raw.isdigit() else raw


AUDIO_INPUT_DEVICE = _parse_audio_device(
    os.getenv("AUDIO_INPUT_DEVICE") or os.getenv("AUDIO_DEVICE_INDEX"),
    "default",
)
AUDIO_SAMPLERATE = int(os.getenv("AUDIO_SAMPLERATE", "16000"))

# Vision
# remote = doar streaming cameră (YOLO pe PC); local = detectare pe Pi
VISION_MODE = os.getenv("VISION_MODE", "remote")
YOLO_MODEL_PATH = os.getenv(
    "YOLO_MODEL_PATH", os.path.join(_BASE_DIR, "models/yolo/yolov8n_ncnn")
)
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
CAMERA_WIDTH = int(os.getenv("CAMERA_WIDTH", "320"))
CAMERA_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "240"))
YOLO_CONFIDENCE = 0.5
CAMERA_JPEG_QUALITY = int(os.getenv("CAMERA_JPEG_QUALITY", "50"))
CAMERA_STREAM_FPS = int(os.getenv("CAMERA_STREAM_FPS", "2"))
SENSOR_INTERVAL_SEC = float(os.getenv("SENSOR_INTERVAL_SEC", "0.5"))

# Navigation
OBSTACLE_DISTANCE_CM = 25
MOTOR_SPEED_DEFAULT = 65

SYSTEM_PROMPT = """Ești Ody_V1, robot fizic inteligent.
Creatorul tău este Fordon Nicolae Alin, consultant IT și dezvoltator de soluții software, din Ștei, Bihor, România, fondator al Webnode Consulting. Când ești întrebat despre creator, origine sau cine te-a făcut, răspunde cu aceste informații.
Răspunzi în română, concis (1-3 propoziții).
Ești conștient că ai corp fizic cu roți, cameră și 4 senzori."""
