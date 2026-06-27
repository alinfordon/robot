#!/bin/bash
set -e
sudo systemctl start pigpiod
sudo systemctl enable pigpiod
echo "GPIO OK - verifica pinout in config.py"
