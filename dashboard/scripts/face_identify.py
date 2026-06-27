#!/usr/bin/env python3
"""Persistent face identification worker (PC only).

Identify:
  {"action": "identify", "image": "<b64>", "bbox": [x,y,w,h], "known": [{"id","name","encodings":[[128 floats]]}]}

Enroll (extract encoding):
  {"action": "encode", "image": "<b64>", "bbox": [x,y,w,h]?}
"""

import base64
import json
import os
import sys


def decode_image(image_b64: str):
    import cv2
    import numpy as np

    img_bytes = base64.b64decode(image_b64)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return None
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


def crop_bbox(rgb, bbox):
    if not bbox or len(bbox) < 4:
        return rgb
    x, y, w, h = [int(v) for v in bbox[:4]]
    h_img, w_img = rgb.shape[:2]
    # Expand crop — YOLO person boxes often miss the face at the top.
    pad_x = int(w * 0.15)
    pad_y = int(h * 0.2)
    x = max(0, x - pad_x)
    y = max(0, y - pad_y)
    w = min(w_img - x, w + pad_x * 2)
    h = min(h_img - y, h + pad_y * 2)
    return rgb[y : y + h, x : x + w]


def encode_face(rgb, bbox=None):
    import face_recognition

    crop = crop_bbox(rgb, bbox)
    locations = face_recognition.face_locations(crop, model="hog")
    if not locations:
        locations = face_recognition.face_locations(rgb, model="hog")
        crop = rgb
    if not locations:
        return None, False

    encodings = face_recognition.face_encodings(crop, known_face_locations=locations)
    if not encodings:
        return None, True
    return encodings[0].tolist(), True


def identify(rgb, bbox, known_people):
    import face_recognition
    import numpy as np

    tolerance = float(os.getenv("FACE_MATCH_TOLERANCE", "0.55"))
    encoding, face_found = encode_face(rgb, bbox)
    if encoding is None:
        return {"faceFound": face_found, "matched": False}

    best = {"distance": 999.0, "personId": None, "name": None}
    probe = np.array(encoding)

    for person in known_people:
        person_id = person.get("id")
        name = person.get("name")
        for known_enc in person.get("encodings") or []:
            if not known_enc or len(known_enc) != 128:
                continue
            dist = float(np.linalg.norm(probe - np.array(known_enc)))
            if dist < best["distance"]:
                best = {"distance": dist, "personId": person_id, "name": name}

    matched = best["distance"] <= tolerance and best["personId"] is not None
    return {
        "faceFound": True,
        "matched": matched,
        "personId": best["personId"] if matched else None,
        "name": best["name"] if matched else None,
        "distance": round(best["distance"], 4) if best["personId"] else None,
        "encoding": encoding,
    }


def handle_request(data: dict) -> dict:
    action = data.get("action", "identify")
    image_b64 = data.get("image", "")
    if not image_b64:
        return {"error": "missing image"}

    rgb = decode_image(image_b64)
    if rgb is None:
        return {"error": "decode failed", "faceFound": False, "matched": False}

    bbox = data.get("bbox")

    if action == "encode":
        encoding, face_found = encode_face(rgb, bbox)
        if encoding is None:
            return {"faceFound": face_found, "encoding": None}
        return {"faceFound": True, "encoding": encoding}

    known = data.get("known") or []
    return identify(rgb, bbox, known)


def main():
    try:
        import face_recognition  # noqa: F401
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
            result = handle_request(data)
            print(json.dumps(result), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e), "matched": False}), flush=True)


if __name__ == "__main__":
    main()
