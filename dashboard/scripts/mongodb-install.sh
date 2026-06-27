#!/usr/bin/env bash
# MongoDB is installed system-wide (apt / mongodb-org).
# Use: sudo systemctl enable --now mongod
# Then: npm run mongo:init

set -euo pipefail

echo "MongoDB should be installed as a system package (root)."
echo ""
echo "Ubuntu / Debian (official repo):"
echo "  https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/"
echo ""
echo "After install:"
echo "  sudo systemctl enable --now mongod"
echo "  npm run mongo:init"
echo ""
if command -v mongod >/dev/null; then
  echo "Detected: $(mongod --version | head -1)"
  systemctl is-active mongod 2>/dev/null && echo "Service: active" || echo "Service: inactive"
else
  echo "mongod not found in PATH"
  exit 1
fi
