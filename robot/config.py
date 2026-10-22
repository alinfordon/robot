import os
from dotenv import load_dotenv

load_dotenv()


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_hex(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, hex(default)), 0)
    except (TypeError, ValueError):
        return default


_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PC_HOST = os.getenv("PC_HOST", "192.168.0.216")
PC_WS_PORT = _env_int("PC_WS_PORT", 8081)
PC_HTTP_PORT = _env_int("PC_HTTP_PORT", 3001)
WS_URL = f"ws://{PC_HOST}:{PC_WS_PORT}?role=robot"
AI_URL = f"http://{PC_HOST}:{PC_HTTP_PORT}/api/chat"
TRANSLATE_URL = f"http://{PC_HOST}:{PC_HTTP_PORT}/api/translate"

# Mock mode for development without GPIO/hardware
MOCK_HARDWARE = os.getenv("MOCK_HARDWARE", "0") == "1"

MODELS_ROOT = os.getenv("MODELS_ROOT", "/home/robot/models")

# GPIO BCM numbering (suprascriere in .env daca firele difera)
#
# MAX98357 I2S (dtoverlay=max98357a) rezerva fix: BCLK=18, LRCLK=19, DIN=21.
# Remapare fata de schema veche (USB audio):
#   ENA stanga  -> jumper pe L298N (MOTOR_LEFT_ENA=-1), GPIO18 liber pentru BCLK
#   US left ECHO  19 -> 12 (elibereaza LRCLK)
#   US right ECHO 21 -> 16 (elibereaza DIN; encoder dreapta dezactivat)
#   IR pe GPIO12  -> dezactivat (IR_ENABLED=0) cat timp ECHO stanga e pe 12
MOTOR_LEFT_IN1 = _env_int("MOTOR_LEFT_IN1", 17)
MOTOR_LEFT_IN2 = _env_int("MOTOR_LEFT_IN2", 27)
# -1 = jumper pe ENA (fara PWM pe GPIO18) — necesar pentru MAX98357
MOTOR_LEFT_ENA = _env_int("MOTOR_LEFT_ENA", -1)
MOTOR_RIGHT_IN3 = _env_int("MOTOR_RIGHT_IN3", 22)
MOTOR_RIGHT_IN4 = _env_int("MOTOR_RIGHT_IN4", 23)
MOTOR_RIGHT_ENB = _env_int("MOTOR_RIGHT_ENB", 24)
MOTOR_PWM_FREQ = _env_int("MOTOR_PWM_FREQ", 1000)

ENCODER_LEFT = _env_int("ENCODER_LEFT", 20)
ENCODER_RIGHT = _env_int("ENCODER_RIGHT", 16)

# ─── HC-SR04 × 4 ─────────────────────────────────
# Față centru
US_FRONT_TRIG = _env_int("US_FRONT_TRIG", 5)
US_FRONT_ECHO = _env_int("US_FRONT_ECHO", 6)  # * div 1kΩ+2kΩ

# Lateral stânga (ECHO mutat pe 12 ca sa elibereze I2S LRCLK=19)
US_LEFT_TRIG = _env_int("US_LEFT_TRIG", 13)
US_LEFT_ECHO = _env_int("US_LEFT_ECHO", 12)

# Lateral dreapta (ECHO mutat pe 16 ca sa elibereze I2S DIN=21)
US_RIGHT_TRIG = _env_int("US_RIGHT_TRIG", 26)
US_RIGHT_ECHO = _env_int("US_RIGHT_ECHO", 16)

# Spate centru
US_BACK_TRIG = _env_int("US_BACK_TRIG", 4)
US_BACK_ECHO = _env_int("US_BACK_ECHO", 25)

# IR emitter — conflict cu US_LEFT_ECHO pe 12 cand AUDIO_OUTPUT=i2s
IR_ENABLED = os.getenv("IR_ENABLED", "0") == "1"
IR_PIN = _env_int("IR_PIN", 12)

# ─── PCA9685 -> pan & tilt camera ────────────────
# Placa PWM I2C 16 canale pe I2C1: SDA->GPIO2(3), SCL->GPIO3(5), VCC->3.3V, GND->GND.
# Servourile se alimenteaza separat pe V+ (5V/2A), masa comuna cu Pi.
PANTILT_ENABLED = os.getenv("PANTILT_ENABLED", "1") == "1"
PCA9685_I2C_BUS = _env_int("PCA9685_I2C_BUS", 1)
# Adresa implicita 0x40 (fara punti A0-A5 lipite); verifica cu `i2cdetect -y 1`
PCA9685_ADDRESS = _env_hex("PCA9685_ADDRESS", 0x40)
PCA9685_PWM_FREQ = _env_int("PCA9685_PWM_FREQ", 50)  # servo analogic standard
PANTILT_PAN_CHANNEL = _env_int("PANTILT_PAN_CHANNEL", 0)
PANTILT_TILT_CHANNEL = _env_int("PANTILT_TILT_CHANNEL", 1)
# Latime impuls (us) pentru 0 si 180 grade - calibrare per servo (SG90 tipic 500-2500)
PANTILT_PULSE_MIN_US = _env_int("PANTILT_PULSE_MIN_US", 500)
PANTILT_PULSE_MAX_US = _env_int("PANTILT_PULSE_MAX_US", 2500)
# Limite mecanice: peste ele servo forteaza in sasiu
PANTILT_PAN_MIN_DEG = _env_float("PANTILT_PAN_MIN_DEG", 10)
PANTILT_PAN_MAX_DEG = _env_float("PANTILT_PAN_MAX_DEG", 170)
PANTILT_TILT_MIN_DEG = _env_float("PANTILT_TILT_MIN_DEG", 45)
PANTILT_TILT_MAX_DEG = _env_float("PANTILT_TILT_MAX_DEG", 135)
# Pozitie de repaus (centrare la pornire si la comanda "center")
PANTILT_PAN_CENTER_DEG = _env_float("PANTILT_PAN_CENTER_DEG", 90)
PANTILT_TILT_CENTER_DEG = _env_float("PANTILT_TILT_CENTER_DEG", 90)
# Inversare sens daca servo e montat oglindit
PANTILT_PAN_INVERT = os.getenv("PANTILT_PAN_INVERT", "0") == "1"
PANTILT_TILT_INVERT = os.getenv("PANTILT_TILT_INVERT", "0") == "1"
# Pas pentru comenzi relative si viteza de baleiaj (miscare lina, nu salt)
PANTILT_STEP_DEG = _env_float("PANTILT_STEP_DEG", 10)
PANTILT_SPEED_DEG_PER_SEC = _env_float("PANTILT_SPEED_DEG_PER_SEC", 120)
# Taie semnalul PWM dupa oprire: elimina zumzetul si incalzirea servo (0 = mereu activ)
PANTILT_IDLE_RELEASE_SEC = _env_float("PANTILT_IDLE_RELEASE_SEC", 1.0)

# Display TFT 2.8" ST7789V 240x320 (SPI0)
# Schema fire -> RPi 5 (BCM):
#   UCC->3.3V(1) rosu, GND->GND(6) negru,
#   CS->GPIO8(24) galben, RESET->GPIO14(8) portocaliu, DC->GPIO7(26) verde,
#   SDI/MOSI->GPIO10(19) albastru, SCK->GPIO11(23) violet,
#   LED->GPIO15(10) alb, SDO/MISO->GPIO9(21) gri
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
TFT_ROTATION = 0  # 240x320: doar 0 sau 180 (st7789 nu accepta 90/270)
# Index hardware CE pentru spidev (NU pinul GPIO!): 0=CE0/GPIO8, 1=CE1/GPIO7
TFT_SPI_CS = 0
# Panou ST7789V generic 240x320: SPI mode 3 (None = default librarie)
TFT_SPI_MODE = 3
# MADCTL: libraria st7789 hardcodeaza 0x70 (MV=1, orientare patrata 240x240).
# Pentru portret real 240x320 fara swap rand/coloana: 0x00.
# Variante: 0x00 portret, 0xC0 portret 180, 0x60/0xA0 landscape (necesita W/H swap).
TFT_MADCTL = 0x00
# Panou BGR: schimba R<->B la afisare (daca rosu/albastru sunt inversate)
TFT_BGR = True
# Inversare luminozitate INVON (de obicei True la panourile IPS)
TFT_INVERT = True

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
# Redare: i2s = MAX98357 (implicit), usb = dongle ALSA vechi
# Folosim CARD=NUME (nu index) — indexul se schimba dupa reboot (HDMI vs MAX98357).
AUDIO_OUTPUT = os.getenv("AUDIO_OUTPUT", "i2s").strip().lower()
AUDIO_PLAYBACK_CARD = os.getenv("AUDIO_PLAYBACK_CARD", "MAX98357A")
_raw_playback = os.getenv("AUDIO_PLAYBACK_DEVICE", "").strip()
try:
    from utils.audio_device import resolve_playback_device

    AUDIO_PLAYBACK_DEVICE = resolve_playback_device(
        _raw_playback or None,
        audio_output=AUDIO_OUTPUT,
        card_hint=AUDIO_PLAYBACK_CARD,
    )
except Exception:
    AUDIO_PLAYBACK_DEVICE = _raw_playback or (
        f"plughw:CARD={AUDIO_PLAYBACK_CARD},DEV=0"
        if AUDIO_OUTPUT == "i2s"
        else f"plughw:{AUDIO_PLAYBACK_CARD},0"
    )


def _parse_audio_device(value: str | None, fallback: str = "default") -> int | str:
    raw = (value or fallback).strip()
    return int(raw) if raw.isdigit() else raw


AUDIO_INPUT_DEVICE = _parse_audio_device(
    os.getenv("AUDIO_INPUT_DEVICE") or os.getenv("AUDIO_DEVICE_INDEX"),
    "default",
)
AUDIO_SAMPLERATE = _env_int("AUDIO_SAMPLERATE", 16000)

# Vision
# remote = doar streaming cameră (YOLO pe PC); local = detectare pe Pi
VISION_MODE = os.getenv("VISION_MODE", "remote")
YOLO_MODEL_PATH = os.getenv(
    "YOLO_MODEL_PATH", os.path.join(_BASE_DIR, "models/yolo/yolov8n_ncnn")
)
CAMERA_INDEX = _env_int("CAMERA_INDEX", 0)
CAMERA_WIDTH = _env_int("CAMERA_WIDTH", 320)
CAMERA_HEIGHT = _env_int("CAMERA_HEIGHT", 240)
YOLO_CONFIDENCE = 0.5
CAMERA_JPEG_QUALITY = _env_int("CAMERA_JPEG_QUALITY", 50)
CAMERA_STREAM_FPS = _env_int("CAMERA_STREAM_FPS", 2)
SENSOR_INTERVAL_SEC = _env_float("SENSOR_INTERVAL_SEC", 0.5)
# Senzori ultrasonici HC-SR04
# US_ENABLED=0  -> dezactiveaza tot (fara thread-uri, fara busy-wait)
# US_ACTIVE     -> lista virgula: front,left,right,back  sau "all"
# Exemplu doar fata montata: US_ENABLED=1 si US_ACTIVE=front
US_ENABLED = os.getenv("US_ENABLED", "1") == "1"
_us_active_raw = os.getenv("US_ACTIVE", "").strip().lower()
if _us_active_raw == "all":
    US_ACTIVE = frozenset({"front", "left", "right", "back"})
elif _us_active_raw in ("", "none"):
    US_ACTIVE = frozenset({"front", "left", "right", "back"}) if US_ENABLED else frozenset()
else:
    US_ACTIVE = frozenset(
        s.strip() for s in _us_active_raw.split(",") if s.strip() in ("front", "left", "right", "back")
    )

# Encodere viteza OKY3278 (photo interrupter, OUT digital per roata)
# ENCODER_ACTIVE=left,right  |  ENCODER_PPR = gauri pe disc (ex. 20)
ENCODER_ENABLED = os.getenv("ENCODER_ENABLED", "1") == "1"
# Implicit doar stanga: GPIO16 e reutilizat de US_RIGHT_ECHO (MAX98357 pe DIN=21)
_enc_active_raw = os.getenv("ENCODER_ACTIVE", "left").strip().lower()
if _enc_active_raw == "all":
    ENCODER_ACTIVE = frozenset({"left", "right"})
elif _enc_active_raw in ("", "none"):
    ENCODER_ACTIVE = frozenset({"left", "right"}) if ENCODER_ENABLED else frozenset()
else:
    ENCODER_ACTIVE = frozenset(
        s.strip() for s in _enc_active_raw.split(",") if s.strip() in ("left", "right")
    )
ENCODER_PPR = _env_int("ENCODER_PPR", 20)
ENCODER_WHEEL_DIAMETER_CM = _env_float("ENCODER_WHEEL_DIAMETER_CM", 6.5)
ENCODER_SAMPLE_SEC = _env_float("ENCODER_SAMPLE_SEC", 0.5)
ENCODER_POLL_SEC = _env_float("ENCODER_POLL_SEC", 0.002)
# Front detectat: falling=LOW la gaura (OKY3278 tipic), rising=logic invers, both=orice tranzitie
_encoder_edge_default = os.getenv("ENCODER_EDGE", "falling").strip().lower()
if _encoder_edge_default not in ("falling", "rising", "both"):
    _encoder_edge_default = "falling"
ENCODER_EDGE = _encoder_edge_default
_left_edge = os.getenv("ENCODER_EDGE_LEFT", ENCODER_EDGE).strip().lower()
_right_edge = os.getenv("ENCODER_EDGE_RIGHT", ENCODER_EDGE).strip().lower()
ENCODER_EDGE_LEFT = _left_edge if _left_edge in ("falling", "rising", "both") else ENCODER_EDGE
ENCODER_EDGE_RIGHT = _right_edge if _right_edge in ("falling", "rising", "both") else ENCODER_EDGE

# Navigation
OBSTACLE_DISTANCE_CM = 25
MOTOR_SPEED_DEFAULT = 65
# Calibrare miscare pe distanta/timp (aprox, la MOTOR_SPEED_DEFAULT)
MOTOR_CM_PER_SEC = _env_float("MOTOR_CM_PER_SEC", 20)
MOTOR_DEG_PER_SEC = _env_float("MOTOR_DEG_PER_SEC", 120)
MOTOR_MOVE_MAX_SEC = _env_float("MOTOR_MOVE_MAX_SEC", 10)

# Navigare autonoma AI (continua, control din dashboard)
AI_NAVIGATE_INTERVAL_SEC = _env_float("AI_NAVIGATE_INTERVAL_SEC", 4.0)
AI_NAVIGATE_MOVE_MS = _env_int("AI_NAVIGATE_MOVE_MS", 1500)
AI_NAVIGATE_URL = f"http://{PC_HOST}:{PC_HTTP_PORT}/api/ai-navigate"

SYSTEM_PROMPT = """Ești Ody_V1 (ROBO_V1), robot fizic mobil cu roți, cameră pe cap pan&tilt, 4 senzori HC-SR04 și encodere viteză.
Creator: Fordon Nicolae Alin, Ștei, Bihor — Webnode Consulting.
Răspunzi în română, concis. Folosești datele senzorilor pentru decizii — nu inventezi distanțe."""
