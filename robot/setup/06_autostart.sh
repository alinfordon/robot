#!/bin/bash
set -e
PROJECT_DIR="${ROBOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
# Nume ALSA stabil (nu index — HDMI schimba ordinea cardurilor)
ALSA_CARD_NAME="$(grep -iE 'MAX98357|hifiberry|IQaudIO|snd_rpi' /proc/asound/cards \
  | sed -n 's/.*\[\([^]]*\)\].*/\1/p' | head -1 | tr -d ' ')"
if [ -z "$ALSA_CARD_NAME" ]; then
  ALSA_CARD_NAME="$(grep -m1 'USB-Audio' /proc/asound/cards \
    | sed -n 's/.*\[\([^]]*\)\].*/\1/p' | head -1 | tr -d ' ')"
fi
ALSA_CARD_NAME="${ALSA_CARD_NAME:-MAX98357A}"
sudo tee /etc/systemd/system/robot.service > /dev/null <<EOF
[Unit]
Description=ROBO_V1 Robot Service
After=network.target pigpiod.service sound.target

[Service]
Type=simple
User=robot
WorkingDirectory=${PROJECT_DIR}
Environment=HOME=/home/robot
Environment=PATH=${PROJECT_DIR}/venv/bin:/usr/bin
Environment=ALSA_CARD=${ALSA_CARD_NAME}
ExecStart=${PROJECT_DIR}/venv/bin/python ${PROJECT_DIR}/main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable robot
echo "Autostart OK - pornire: sudo systemctl start robot"
