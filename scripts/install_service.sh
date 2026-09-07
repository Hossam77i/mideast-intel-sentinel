#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="mideast-sentinel"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "=========================================================="
echo "🛡️ INSTALLING 24/7 LIFETIME BACKGROUND SYSTEMD SERVICE"
echo "Project Directory: $PROJECT_DIR"
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  SUDO="sudo"
else
  SUDO=""
fi

$SUDO tee "$SERVICE_FILE" > /dev/null << UNIT
[Unit]
Description=Middle East Intel Sentinel 24/7 Daemon & Web Dashboard
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
UNIT

$SUDO systemctl daemon-reload
$SUDO systemctl enable "${SERVICE_NAME}"
$SUDO systemctl restart "${SERVICE_NAME}"

echo "✅ Service '${SERVICE_NAME}' installed and enabled!"
echo "Status: $SUDO systemctl status ${SERVICE_NAME}"
echo "Dashboard available at: http://localhost:8000"
