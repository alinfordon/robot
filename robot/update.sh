#!/bin/bash
# ─────────────────────────────────────────────────────────────
# ROBO_V1 - Update de pe GitHub pe Raspberry Pi
#
#   Cloneaza/trage ultima versiune din repo intr-un folder sursa
#   separat, apoi sincronizeaza DOAR codul in /home/robot,
#   pastrand venv/, .env si models/ (care nu sunt in git).
#
# Utilizare (din directorul aplicatie, de ex. /home/robot):
#   cd /home/robot && bash update.sh
#   BRANCH=dev bash update.sh     # alt branch
#   RESTART=0 bash update.sh      # fara restart serviciu
# ─────────────────────────────────────────────────────────────
set -e

# Directorul in care se afla acest script = directorul de rulare al robotului
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO_URL="${REPO_URL:-https://github.com/alinfordon/robot.git}"
BRANCH="${BRANCH:-main}"
SRC_DIR="${SRC_DIR:-$HOME/robot-src}"   # clona git (separata de runtime)
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"       # unde ruleaza robotul (langa update.sh)
VENV="$APP_DIR/venv"
RESTART="${RESTART:-1}"

echo "Director aplicatie (APP_DIR): $APP_DIR"

echo "=== ROBO_V1 Update ==="

# 1. Clone (prima data) sau fetch + reset hard la origin/BRANCH
if [ ! -d "$SRC_DIR/.git" ]; then
  echo "Clonez $REPO_URL -> $SRC_DIR"
  git clone "$REPO_URL" "$SRC_DIR"
fi
cd "$SRC_DIR"
git remote set-url origin "$REPO_URL"
git fetch --prune origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "Versiune: $(git rev-parse --short HEAD) - $(git log -1 --pretty=%s)"

# 2. Sincronizare cod robot/ -> APP_DIR
#    Fara --delete (APP_DIR e si home), excludem datele locale.
if [ ! -d "$SRC_DIR/robot" ]; then
  echo "EROARE: $SRC_DIR/robot lipseste in repo."
  exit 1
fi
echo "Sincronizez codul in $APP_DIR ..."
rsync -a \
  --exclude 'venv/' \
  --exclude '.env' \
  --exclude 'models/' \
  --exclude '__pycache__/' \
  --exclude '*.py[cod]' \
  --exclude '*.wav' \
  "$SRC_DIR/robot/" "$APP_DIR/"

cd "$APP_DIR"

# 3. Dependinte Python (daca s-a schimbat requirements.txt)
if [ -f "$VENV/bin/activate" ]; then
  echo "Actualizez dependintele Python ..."
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
  pip install -q --upgrade pip
  pip install -q -r "$APP_DIR/requirements.txt"
  deactivate || true
else
  echo "ATENTIE: venv lipseste la $VENV - ruleaza install.sh intai."
fi

# 3b. Verificare rapida import (prinde erori inainte de restart systemd)
if [ -f "$VENV/bin/activate" ]; then
  echo "Verific import config + main ..."
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
  if ! python -c "import config; print('config OK')" 2>&1; then
    echo "EROARE: config.py nu se poate importa — verifica .env si encoding."
    deactivate || true
    exit 1
  fi
  if ! python test_startup.py 2>&1; then
    echo "EROARE: test_startup.py a esuat — vezi traceback mai sus."
    deactivate || true
    exit 1
  fi
  deactivate || true
fi

# 3c. Actualizeaza robot.service cu APP_DIR (fix cale veche /home/robot/robot)
if [ -f "$APP_DIR/setup/06_autostart.sh" ]; then
  echo "Actualizez robot.service -> $APP_DIR ..."
  ROBOT_DIR="$APP_DIR" bash setup/06_autostart.sh
fi

# 4. Restart serviciu systemd (daca exista si RESTART=1)
if [ "$RESTART" = "1" ] && systemctl list-unit-files 2>/dev/null | grep -q '^robot.service'; then
  echo "Restart serviciu robot ..."
  sudo systemctl restart robot
  sleep 2
  sudo systemctl --no-pager --lines=5 status robot || true
else
  echo "Serviciul robot nu a fost restartat (lipsa sau RESTART=0)."
  echo "Pornire manuala: cd $APP_DIR && venv/bin/python main.py"
fi

echo "Update complet!"
