#!/bin/bash
set -e
cd /home/robot
python3 -m venv venv --system-site-packages
source venv/bin/activate
pip install --upgrade pip wheel
pip install -r requirements.txt
# Display TFT ST7789V (instalat si in system-site pentru acces SPI)
pip install st7789 pillow --break-system-packages
echo "Python OK"
