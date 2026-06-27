#!/bin/bash
set -e
PROJECT_DIR="${ROBOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
USB_PLAYBACK_CARD="$(grep -m1 'USB-Audio' /proc/asound/cards | awk '{print $1}')"
USB_PLAYBACK_CARD="${USB_PLAYBACK_CARD:-0}"
sudo tee /etc/systemd/system/robot.service > /dev/null <<EOF
[Unit]
Description=ROBO_V1 Robot Service
After=network.target pigpiod.service

[Service]
Type=simple
User=robot
WorkingDirectory=${PROJECT_DIR}
Environment=HOME=/home/robot
Environment=PATH=${PROJECT_DIR}/venv/bin:/usr/bin
Environment=ALSA_CARD=${USB_PLAYBACK_CARD}
ExecStart=${PROJECT_DIR}/venv/bin/python ${PROJECT_DIR}/main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable robot
echo "Autostart OK - pornire: sudo systemctl start robot"
