#!/usr/bin/env bash
set -euo pipefail

if command -v systemctl >/dev/null && systemctl list-unit-files mongod.service >/dev/null 2>&1; then
  if systemctl is-active --quiet mongod; then
    echo "MongoDB (system) already running on mongodb://127.0.0.1:27017"
    exit 0
  fi
  echo "Starting MongoDB via systemd..."
  sudo systemctl start mongod
  echo "MongoDB started on mongodb://127.0.0.1:27017"
  exit 0
fi

echo "System MongoDB not found. Install with:"
echo "  sudo apt install mongodb-org"
echo "Or enable the service: sudo systemctl enable --now mongod"
exit 1
