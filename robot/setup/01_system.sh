#!/bin/bash
set -e
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  python3 python3-pip python3-venv python3-dev \
  git curl wget portaudio19-dev libportaudio2 \
  alsa-utils pulseaudio v4l-utils ffmpeg \
  i2c-tools pigpio libpigpio-dev \
  build-essential cmake pkg-config \
  libopencv-dev espeak-ng stress-ng
sudo usermod -aG gpio,i2c,spi,audio,video $USER
sudo systemctl enable pigpiod
echo "System OK"
