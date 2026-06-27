import os
from dotenv import load_dotenv

load_dotenv()

# WebSocket PC
PC_HOST = os.getenv("PC_HOST", "192.168.1.100")
PC_WS_PORT = int(os.getenv("PC_WS_PORT", "8080"))
PC_HTTP_PORT = int(os.getenv("PC_HTTP_PORT", "3000"))
WS_URL = f"ws://{PC_HOST}:{PC_WS_PORT}?role=robot"
AI_URL = f"http://{PC_HOST}:{PC_HTTP_PORT}/api/chat"

# Mock mode for development without GPIO/hardware
MOCK_HARDWARE = os.getenv("MOCK_HARDWARE", "0") == "1"

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

# HC-SR04 x 7
US_FRONT_LEFT_TRIG = 5
US_FRONT_LEFT_ECHO = 6
US_FRONT_MID_TRIG = 13
US_FRONT_MID_ECHO = 19
US_FRONT_RIGHT_TRIG = 26
US_FRONT_RIGHT_ECHO = 21
US_LEFT_TRIG = 4
US_LEFT_ECHO = 25
US_RIGHT_TRIG = 8
US_RIGHT_ECHO = 7
US_BACK_LEFT_TRIG = 12
US_BACK_LEFT_ECHO = 16
US_BACK_RIGHT_TRIG = 20
US_BACK_RIGHT_ECHO = 21

# IR emitter
IR_PIN = 11

# Audio
VOSK_MODEL_PATH = os.getenv("VOSK_MODEL_PATH", "/home/robot/models/vosk/romanian")
VOSK_MODEL_PATH_EN = os.getenv("VOSK_MODEL_PATH_EN", "/home/robot/models/vosk/en")
PIPER_MODEL_PATH = os.getenv(
    "PIPER_MODEL_PATH", "/home/robot/models/piper/ro_RO-mihai-medium.onnx"
)
PIPER_MODEL_PATH_EN = os.getenv(
    "PIPER_MODEL_PATH_EN", "/home/robot/models/piper/en_US-lessac-medium.onnx"
)
AUDIO_DEVICE_INDEX = int(os.getenv("AUDIO_DEVICE_INDEX", "0"))
AUDIO_SAMPLERATE = 16000

# Vision
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "/home/robot/models/yolo/yolov8n_ncnn")
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
YOLO_CONFIDENCE = 0.5

# Navigation
OBSTACLE_DISTANCE_CM = 25
MOTOR_SPEED_DEFAULT = 65
CAMERA_STREAM_FPS = 5

SYSTEM_PROMPT = """Ești Ody_V1, robot fizic inteligent.
Creatorul tău este Fordon Nicolae Alin, consultant IT și dezvoltator de soluții software, din Ștei, Bihor, România, fondator al Webnode Consulting. Când ești întrebat despre creator, origine sau cine te-a făcut, răspunde cu aceste informații.
Răspunzi în română, concis (1-3 propoziții).
Ești conștient că ai corp fizic cu roți, cameră și 7 senzori."""
