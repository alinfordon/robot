#!/usr/bin/env python3
"""Persistent YOLO worker for PC. Loads model once, processes JSON lines on stdin.

Input:  {"image": "<base64 jpeg>"}
Output: {"objects": [...]}
"""

import base64
import json
import os
import sys


def load_model():
    from ultralytics import YOLO

    model_path = os.getenv("YOLO_MODEL", "yolov8n.pt")
    conf = float(os.getenv("YOLO_CONFIDENCE", "0.5"))
    return YOLO(model_path), conf


def detect(model, conf, image_b64: str) -> list:
    import cv2
    import numpy as np

    img_bytes = base64.b64decode(image_b64)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return []

    results = model(frame, conf=conf, verbose=False)
    objects = []
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            cls = int(box.cls[0])
            conf_val = float(box.conf[0])
            label = r.names.get(cls, str(cls))
            objects.append(
                {
                    "label": label,
                    "confidence": conf_val,
                    "bbox": [int(x1), int(y1), int(x2 - x1), int(y2 - y1)],
                }
            )
    return objects


def main():
    try:
        model, conf = load_model()
        print(json.dumps({"ready": True}), flush=True)
    except Exception as e:
        print(json.dumps({"ready": False, "error": str(e)}), flush=True)
        sys.exit(1)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            image_b64 = data.get("image", "")
            if not image_b64:
                print(json.dumps({"objects": []}), flush=True)
                continue
            objects = detect(model, conf, image_b64)
            print(json.dumps({"objects": objects}), flush=True)
        except Exception as e:
            print(json.dumps({"objects": [], "error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
