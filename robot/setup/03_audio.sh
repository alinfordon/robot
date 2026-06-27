#!/bin/bash
set -e
sudo apt install -y piper-tts
mkdir -p /home/robot/models/piper
mkdir -p /home/robot/models/vosk
echo "Descarca model Piper romanian si Vosk manual in /home/robot/models/"
echo "Audio OK"
