#!/usr/bin/env bash
set -euo pipefail

if command -v systemctl >/dev/null && systemctl list-unit-files mongod.service >/dev/null 2>&1; then
  if ! systemctl is-active --quiet mongod; then
    echo "MongoDB (system) is not running"
    exit 0
  fi
  echo "Stopping MongoDB via systemd..."
  sudo systemctl stop mongod
  echo "MongoDB stopped"
  exit 0
fi

echo "System MongoDB service not found"
exit 1
