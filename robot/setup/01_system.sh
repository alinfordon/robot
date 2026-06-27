#!/bin/bash
set -e

fix_apt_sources() {
  local sources=/etc/apt/sources.list.d/ubuntu.sources
  if [ -f "$sources" ] && ! grep -q 'noble-updates' "$sources"; then
    echo "=== Repar surse apt: adaug noble-updates ==="
    sudo cp "$sources" "${sources}.bak"
    sudo sed -i '/^Suites: noble$/s/noble/noble noble-updates noble-backports/' "$sources"
  fi
}

fix_apt_sources
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  python3 python3-pip python3-venv python3-dev \
  git curl wget portaudio19-dev libportaudio2 \
  alsa-utils pulseaudio v4l-utils ffmpeg \
  i2c-tools python3-pigpio pigpio-tools libpigpiod-if-dev python3-rpi-lgpio \
  build-essential cmake pkg-config \
  libopencv-dev espeak-ng stress-ng
sudo usermod -aG gpio,i2c,spi,audio,video $USER
echo "System OK"
