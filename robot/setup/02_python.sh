#!/bin/bash
set -e
PROJECT_DIR="${ROBOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$PROJECT_DIR"
python3 -m venv venv --system-site-packages
source venv/bin/activate
pip install --upgrade pip wheel
pip install -r requirements.txt
# Pi 5 needs python3-rpi-lgpio from apt, not pip RPi.GPIO
pip uninstall -y RPi.GPIO 2>/dev/null || true
echo "Python OK"
