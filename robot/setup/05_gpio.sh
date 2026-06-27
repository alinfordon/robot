#!/bin/bash
set -e

install_pigpiod() {
  if command -v pigpiod >/dev/null 2>&1; then
    return 0
  fi

  echo "Construiesc pigpiod din sursa (lipseste din apt pe Ubuntu 24.04)..."
  BUILD_DIR=$(mktemp -d)
  trap 'rm -rf "$BUILD_DIR"' EXIT

  wget -qO "$BUILD_DIR/pigpio.tar.gz" \
    "http://deb.debian.org/debian/pool/main/p/pigpio/pigpio_1.78.orig.tar.gz"
  tar xzf "$BUILD_DIR/pigpio.tar.gz" -C "$BUILD_DIR"
  make -C "$BUILD_DIR/pigpio-78" -j"$(nproc)"
  sudo make -C "$BUILD_DIR/pigpio-78" install
  sudo ldconfig
}

install_pigpiod_service() {
  if [ -f /etc/systemd/system/pigpiod.service ] || [ -f /lib/systemd/system/pigpiod.service ]; then
    return 0
  fi

  PIGPIOD=$(command -v pigpiod)
  T_OPT="-t0"
  if [[ "$(uname -m)" == "armv6l" || "$(uname -m)" == "armv7l" ]]; then
    T_OPT="-t1"
  fi

  sudo tee /etc/systemd/system/pigpiod.service > /dev/null <<EOF
[Unit]
Description=pigpio daemon
After=local-fs.target

[Service]
Type=forking
ExecStart=${PIGPIOD} ${T_OPT}
ExecStop=/usr/bin/killall pigpiod
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
}

enable_spi() {
  # Display TFT ST7789V: SPI0 cu UN singur chip-select (CE0/GPIO8).
  # Folosim dtoverlay=spi0-1cs (NU dtparam=spi=on) ca sa eliberam GPIO7
  # (CE1), care la noi e folosit ca DC. Altfel DC da "Device busy".
  for CFG in /boot/firmware/config.txt /boot/config.txt; do
    if [ -f "$CFG" ]; then
      sudo sed -i '/^dtparam=spi=on/d' "$CFG"
      if ! grep -q "^dtoverlay=spi0-1cs" "$CFG"; then
        echo "Activez SPI (spi0-1cs) in $CFG"
        echo "dtoverlay=spi0-1cs" | sudo tee -a "$CFG" > /dev/null
        echo "SPI activat - reboot necesar (elibereaza GPIO7 pentru DC)"
      fi
      break
    fi
  done
}

install_pigpiod
install_pigpiod_service
sudo systemctl enable pigpiod
sudo systemctl start pigpiod
enable_spi
echo "GPIO OK - verifica pinout in config.py"
