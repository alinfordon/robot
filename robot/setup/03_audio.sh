#!/bin/bash
# ROBO_V1 — Piper TTS + Vosk + redare MAX98357 (I2S) sau USB
set -e
PROJECT_DIR="${ROBOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MODELS_ROOT="${MODELS_ROOT:-/home/robot/models}"
PIPER_DIR="$MODELS_ROOT/piper"
VOSK_DIR="$MODELS_ROOT/vosk"
# i2s = MAX98357 (implicit) | usb = dongle ALSA
AUDIO_OUTPUT="${AUDIO_OUTPUT:-i2s}"

PIPER_RO="$PIPER_DIR/ro_RO-mihai-medium.onnx"
PIPER_EN="$PIPER_DIR/en_US-lessac-medium.onnx"
PIPER_RO_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ro/ro_RO/mihai/medium"
PIPER_EN_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium"
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

enable_max98357_overlay() {
  # I2S: BCLK=GPIO18, LRCLK=GPIO19, DIN=GPIO21
  # no-sdmode: module fara fir pe SD_MODE (DAC mereu activ la probe)
  for CFG in /boot/firmware/config.txt /boot/config.txt; do
    if [ -f "$CFG" ]; then
      sudo sed -i '/^dtparam=audio=on/d' "$CFG"
      sudo sed -i '/^dtoverlay=max98357a/d' "$CFG"
      sudo sed -i '/^dtoverlay=hifiberry-dac/d' "$CFG"
      echo "Activez MAX98357 I2S in $CFG"
      {
        echo "dtoverlay=max98357a,no-sdmode"
      } | sudo tee -a "$CFG" > /dev/null
      echo "Overlay I2S adaugat — REBOOT necesar, apoi: aplay -l"
      break
    fi
  done
}

find_usb_cards() {
  grep 'USB-Audio' /proc/asound/cards | awk '{print $1}'
}

find_i2s_card_id() {
  # Dupa reboot, cardul apare ca MAX98357A / sndrpihifiberry / etc.
  grep -iE 'MAX98357|hifiberry|IQaudIO|snd_rpi' /proc/asound/cards | awk '{print $1; exit}'
}

find_i2s_card_name() {
  # Extrage numele din [MAX98357A    ]
  grep -iE 'MAX98357|hifiberry|IQaudIO|snd_rpi' /proc/asound/cards \
    | sed -n 's/.*\[\([^]]*\)\].*/\1/p' | head -1 | tr -d ' '
}

if [ "$AUDIO_OUTPUT" = "i2s" ]; then
  enable_max98357_overlay
  PLAYBACK_CARD_ID="$(find_i2s_card_id)"
  PLAYBACK_CARD_NAME="$(find_i2s_card_name)"
  PLAYBACK_CARD_NAME="${PLAYBACK_CARD_NAME:-MAX98357A}"
  # Device string stabil (nu se strica cand HDMI ia alt index)
  PLAYBACK_DEVICE="plughw:CARD=${PLAYBACK_CARD_NAME},DEV=0"
  CAPTURE_CARD="$(find_usb_cards | head -1)"
  if [ -z "$CAPTURE_CARD" ]; then
    CAPTURE_CARD="${PLAYBACK_CARD_ID:-0}"
  fi

  if [ -n "$PLAYBACK_CARD_ID" ]; then
    cat > "$HOME/.asoundrc" <<EOF
# ROBO_V1 — MAX98357 I2S (redare) + microfon (USB sau default)
pcm.i2s_out {
    type plug
    slave.pcm "hw:${PLAYBACK_CARD_ID},0"
}
pcm.!default {
    type asym
    playback.pcm "i2s_out"
    capture.pcm {
        type plug
        slave.pcm "hw:${CAPTURE_CARD},0"
    }
}
ctl.!default {
    type hw
    card ${PLAYBACK_CARD_ID}
}
EOF
  else
    echo "ATENTIE: card MAX98357 inca nu apare in /proc/asound/cards — reboot dupa overlay."
    cat > "$HOME/.asoundrc" <<EOF
# ROBO_V1 — MAX98357 (card inca nedetectat; dupa reboot ruleaza din nou 03_audio.sh)
pcm.!default {
    type plug
    slave.pcm "plughw:CARD=MAX98357A,DEV=0"
}
EOF
  fi

  ensure_env "AUDIO_OUTPUT" "i2s"
  ensure_env "AUDIO_PLAYBACK_DEVICE" "${PLAYBACK_DEVICE}"
  ensure_env "AUDIO_PLAYBACK_CARD" "${PLAYBACK_CARD_NAME}"
  # Faza audio: elibereaza toti pinii de miscare/senzori
  ensure_env "MOTORS_ENABLED" "0"
  ensure_env "US_ENABLED" "0"
  ensure_env "US_ACTIVE" "none"
  ensure_env "ENCODER_ENABLED" "0"
  ensure_env "ENCODER_ACTIVE" "none"
  ensure_env "IR_ENABLED" "0"
  ensure_env "MOTOR_LEFT_ENA" "-1"
  echo ""
  echo "=== MAX98357 I2S — cablaj ==="
  echo "  VIN     -> 5V (pin 2) sau 3.3V (pin 1)"
  echo "  GND     -> GND"
  echo "  BCLK    -> GPIO18 (pin fizic 12)"
  echo "  LRC     -> GPIO19 (pin fizic 35)"
  echo "  DIN     -> GPIO21 (pin fizic 40)"
  echo "  SD_MODE -> 3.3V sau VIN  (obligatoriu — altfel aplay OK dar tacere)"
  echo "  Scoate firele L298N / HC-SR04 / encodere de pe GPIO (MOTORS/US/ENCODER=0)"
else
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

  ensure_env "AUDIO_OUTPUT" "usb"
  ensure_env "AUDIO_PLAYBACK_DEVICE" "plughw:${PLAYBACK_CARD},0"
  ensure_env "AUDIO_PLAYBACK_CARD" "${PLAYBACK_CARD}"
fi

ensure_env "AUDIO_DEVICE_INDEX" "0"
ensure_env "AUDIO_INPUT_DEVICE" "default"
ensure_env "VOSK_MODEL_PATH" "$VOSK_DIR/romanian"
ensure_env "VOSK_MODEL_PATH_EN" "$VOSK_DIR/en"
ensure_env "PIPER_MODEL_PATH" "$PIPER_RO"
ensure_env "PIPER_MODEL_PATH_EN" "$PIPER_EN"
ensure_env "PC_WS_PORT" "8081"
ensure_env "PC_HTTP_PORT" "3001"

echo "=== Modele ==="
for f in "$PIPER_RO" "$PIPER_EN" "$VOSK_DIR/romanian" "$VOSK_DIR/en"; do
  [ -e "$f" ] && echo "  OK  $f" || echo "  LIPSA $f"
done
echo ""
if [ "$AUDIO_OUTPUT" = "i2s" ]; then
  echo "AUDIO_OUTPUT=i2s | Redare: ${PLAYBACK_DEVICE:-plughw:CARD=MAX98357A,DEV=0}"
else
  echo "AUDIO_OUTPUT=usb | Redare: plughw:${PLAYBACK_CARD},0"
fi
echo "Audio OK"
