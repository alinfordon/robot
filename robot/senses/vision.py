import asyncio
import base64
import time
from pathlib import Path
from typing import Callable, List, Optional

import config
from utils.logger import get_logger

logger = get_logger("Vision")

try:
    import cv2

    HAS_CV = True
except Exception:
    HAS_CV = False

try:
    from ultralytics import YOLO

    HAS_YOLO = True
except Exception:
    HAS_YOLO = False


class VisionSystem:
    """Camera capture. YOLO runs on PC when VISION_MODE=remote (default)."""

    def __init__(
        self,
        on_objects: Optional[Callable[[list], None]] = None,
        on_frame: Optional[Callable[[str, int, int], None]] = None,
        should_stream: Optional[Callable[[], bool]] = None,
    ):
        self.on_objects = on_objects
        self.on_frame = on_frame
        self._should_stream = should_stream or (lambda: True)
        self._running = False
        self.cap = None
        self.model = None
        self.last_objects: List[dict] = []
        self._frame_interval = 1.0 / config.CAMERA_STREAM_FPS
        self._remote = config.VISION_MODE.lower() == "remote"

    def _init_camera(self) -> bool:
        if not HAS_CV:
            logger.warning("OpenCV indisponibil")
            return False
        if config.MOCK_HARDWARE:
            logger.info("Mod simulare camera")
            return True

        self.cap = cv2.VideoCapture(config.CAMERA_INDEX)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAMERA_WIDTH)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)
        if not self.cap.isOpened():
            logger.error("Camera USB indisponibila")
            return False
        logger.info("Camera USB initializata")
        return True

    def _init_model(self):
        if self._remote:
            logger.info("VISION_MODE=remote — YOLO ruleaza pe PC")
            return
        if not HAS_YOLO:
            logger.warning("Ultralytics YOLO indisponibil")
            return
        model_path = Path(config.YOLO_MODEL_PATH)
        if model_path.exists():
            self.model = YOLO(str(model_path))
            logger.info(f"YOLO incarcat: {model_path}")
        else:
            logger.info("Incarc YOLOv8n pretrained...")
            self.model = YOLO("yolov8n.pt")

    async def run_loop(self):
        if not self._remote:
            self._init_model()
        if not self._init_camera():
            if not config.MOCK_HARDWARE:
                return

        self._running = True
        last_send = 0

        while self._running:
            try:
                frame, objects = self._capture_and_detect()
                now = time.time()

                if not self._remote and objects != self.last_objects:
                    self.last_objects = objects
                    if self.on_objects:
                        self.on_objects(objects)

                if (
                    self.on_frame
                    and self._should_stream()
                    and now - last_send >= self._frame_interval
                ):
                    b64 = self._encode_frame(frame)
                    if b64:
                        self.on_frame(b64, config.CAMERA_WIDTH, config.CAMERA_HEIGHT)
                        last_send = now

                await asyncio.sleep(0.05 if self._should_stream() else 0.25)
            except Exception as e:
                logger.error(f"Eroare vision loop: {e}")
                await asyncio.sleep(1)

    def _capture_frame(self):
        if config.MOCK_HARDWARE or not self.cap or not self.cap.isOpened():
            import numpy as np

            frame = np.zeros((config.CAMERA_HEIGHT, config.CAMERA_WIDTH, 3), dtype=np.uint8)
            cv2.putText(
                frame,
                "ROBO_V1 MOCK",
                (180, 240),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 229, 160),
                2,
            )
            return frame

        ret, frame = self.cap.read()
        return frame if ret else None

    def _capture_and_detect(self):
        frame = self._capture_frame()
        if frame is None:
            return None, []

        if self._remote or not self.model:
            return frame, []

        objects = []
        results = self.model(frame, conf=config.YOLO_CONFIDENCE, verbose=False)
        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cls = int(box.cls[0])
                conf = float(box.conf[0])
                label = r.names.get(cls, str(cls))
                objects.append(
                    {
                        "label": label,
                        "confidence": conf,
                        "bbox": [
                            int(x1),
                            int(y1),
                            int(x2 - x1),
                            int(y2 - y1),
                        ],
                    }
                )
                if HAS_CV:
                    cv2.rectangle(
                        frame,
                        (int(x1), int(y1)),
                        (int(x2), int(y2)),
                        (0, 229, 160),
                        2,
                    )

        return frame, objects

    def _encode_frame(self, frame) -> Optional[str]:
        if frame is None or not HAS_CV:
            return None
        _, buffer = cv2.imencode(
            ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, config.CAMERA_JPEG_QUALITY]
        )
        return base64.b64encode(buffer).decode("utf-8")

    def stop(self):
        self._running = False
        if self.cap:
            self.cap.release()

    def get_last_frame_b64(self) -> Optional[str]:
        frame = self._capture_frame()
        return self._encode_frame(frame)

    def set_detected_objects(self, objects: list):
        """Objects identified by PC (remote vision)."""
        self.last_objects = objects
