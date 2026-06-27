#!/bin/bash
set -e
PROJECT_DIR="${ROBOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MODELS_ROOT="${MODELS_ROOT:-/home/robot/models}"
PIPER_DIR="$MODELS_ROOT/piper"
VOSK_DIR="$MODELS_ROOT/vosk"

PIPER_RO="$PIPER_DIR/ro_RO-mihai-medium.onnx"
PIPER_EN="$PIPER_DIR/en_US-lessac-medium.onnx"
PIPER_RO_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ro/ro_RO/mihai/medium"
PIPER_EN_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium"
VOSK_RO_URL="https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
VOSK_EN_URL="https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
# Nota: Vosk nu publica inca model RO oficial — copia manual in $VOSK_DIR/romanian

if command -v apt-get >/dev/null 2>&1; then
  sudo apt install -y alsa-utils 2>/dev/null || true
fi

if [ -f "$PROJECT_DIR/venv/bin/piper" ]; then
  echo "Piper TTS: $PROJECT_DIR/venv/bin/piper"
elif [ -f "$PROJECT_DIR/venv/bin/activate" ]; then
  echo "Instalez piper-tts in venv..."
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/venv/bin/activate"
  pip install "piper-tts>=1.2.0"
fi

mkdir -p "$PIPER_DIR" "$VOSK_DIR"

download_piper() {
  local url_base="$1"
  local out="$2"
  if [ ! -f "$out" ]; then
    echo "Descarc $(basename "$out")..."
    wget -qO "$out" "${url_base}/$(basename "$out")"
    wget -qO "${out}.json" "${url_base}/$(basename "$out").json"
  fi
}

download_vosk() {
  local url="$1"
  local dest="$2"
  local name
  name="$(basename "$url" .zip)"
  if [ -d "$dest" ]; then
    return 0
  fi
  echo "Descarc Vosk $(basename "$dest")..."
  tmp="$(mktemp -d)"
  wget -qO "$tmp/model.zip" "$url"
  python3 - <<PY "$tmp/model.zip" "$tmp"
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as zf:
    zf.extractall(sys.argv[2])
PY
  mv "$tmp/$name" "$dest"
  rm -rf "$tmp"
}

download_piper "$PIPER_RO_BASE" "$PIPER_RO"
download_piper "$PIPER_EN_BASE" "$PIPER_EN"
download_vosk "$VOSK_EN_URL" "$VOSK_DIR/en"
if [ ! -d "$VOSK_DIR/romanian" ]; then
  echo "Model Vosk RO: copia manual in $VOSK_DIR/romanian (nu exista pe alphacephei.com)"
fi

find_usb_cards() {
  grep 'USB-Audio' /proc/asound/cards | awk '{print $1}'
}

USB_CARDS=($(find_usb_cards))
PLAYBACK_CARD="${USB_CARDS[0]:-0}"
CAPTURE_CARD="${USB_CARDS[1]:-$PLAYBACK_CARD}"
if [ "${#USB_CARDS[@]}" -eq 1 ]; then
  CAPTURE_CARD="$PLAYBACK_CARD"
fi

cat > "$HOME/.asoundrc" <<EOF
# ROBO_V1 — USB Audio
pcm.usb_out {
    type plug
    slave.pcm "hw:${PLAYBACK_CARD},0"
}
pcm.!default {
    type asym
    playback.pcm "usb_out"
    capture.pcm {
        type plug
        slave.pcm "hw:${CAPTURE_CARD},0"
    }
}
ctl.!default {
    type hw
    card ${PLAYBACK_CARD}
}
EOF

if command -v pactl >/dev/null 2>&1; then
  USB_SINK="$(pactl list short sinks | awk '/usb/ {print $2; exit}')"
  [ -n "$USB_SINK" ] && pactl set-default-sink "$USB_SINK" 2>/dev/null || true
fi

ENV_FILE="$PROJECT_DIR/.env"
ensure_env() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

touch "$ENV_FILE"
ensure_env "VOSK_MODEL_PATH" "$VOSK_DIR/romanian"
ensure_env "VOSK_MODEL_PATH_EN" "$VOSK_DIR/en"
ensure_env "PIPER_MODEL_PATH" "$PIPER_RO"
ensure_env "PIPER_MODEL_PATH_EN" "$PIPER_EN"
ensure_env "AUDIO_PLAYBACK_DEVICE" "plughw:${PLAYBACK_CARD},0"
ensure_env "AUDIO_PLAYBACK_CARD" "${PLAYBACK_CARD}"
ensure_env "AUDIO_DEVICE_INDEX" "0"
ensure_env "AUDIO_INPUT_DEVICE" "default"
ensure_env "PC_WS_PORT" "8081"
ensure_env "PC_HTTP_PORT" "3001"

echo "=== Modele ==="
for f in "$PIPER_RO" "$PIPER_EN" "$VOSK_DIR/romanian" "$VOSK_DIR/en"; do
  [ -e "$f" ] && echo "  OK  $f" || echo "  LIPSA $f"
done
echo ""
echo "Redare: plughw:${PLAYBACK_CARD},0 | STT device: 0"
echo "Audio OK"
