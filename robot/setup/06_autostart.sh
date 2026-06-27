#!/bin/bash
set -e
sudo tee /etc/systemd/system/robot.service > /dev/null << 'EOF'
[Unit]
Description=ROBO_V1 Robot Service
After=network.target pigpiod.service

[Service]
Type=simple
User=robot
WorkingDirectory=/home/robot
Environment=PATH=/home/robot/venv/bin:/usr/bin
ExecStart=/home/robot/venv/bin/python /home/robot/main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable robot
echo "Autostart OK - pornire: sudo systemctl start robot"
