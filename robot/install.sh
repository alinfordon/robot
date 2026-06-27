#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ROBOT_DIR="$SCRIPT_DIR"
cd "$ROBOT_DIR"

echo "=== ROBO_V1 Install ==="
bash setup/01_system.sh
bash setup/02_python.sh
bash setup/03_audio.sh
bash setup/04_vision.sh
bash setup/05_gpio.sh

echo ""
echo "=== Configurare ==="
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || cp .env .env.bak
  echo "Editeaza .env cu IP-ul PC-ului Windows"
fi

echo ""
echo "=== Optional: autostart ==="
read -p "Instalezi serviciu systemd? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  bash setup/06_autostart.sh
fi

echo ""
echo "Install complet! Editeaza .env apoi: python main.py"
