#!/bin/bash
set -e
PROJECT_DIR="${ROBOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
mkdir -p "$PROJECT_DIR/models/yolo"
echo "Descarca YOLOv8n NCNN sau foloseste yolov8n.pt via ultralytics"
echo "Vision OK"
