#!/bin/bash
set -e
PROJECT_DIR="${ROBOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
# Prefera MAX98357 / hifiberry; fallback USB, apoi 0
ALSA_CARD="$(grep -iE 'MAX98357|hifiberry|IQaudIO|snd_rpi' /proc/asound/cards | awk '{print $1; exit}')"
if [ -z "$ALSA_CARD" ]; then
  ALSA_CARD="$(grep -m1 'USB-Audio' /proc/asound/cards | awk '{print $1}')"
fi
ALSA_CARD="${ALSA_CARD:-0}"
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
Environment=ALSA_CARD=${ALSA_CARD}
ExecStart=${PROJECT_DIR}/venv/bin/python ${PROJECT_DIR}/main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable robot
echo "Autostart OK - pornire: sudo systemctl start robot"
