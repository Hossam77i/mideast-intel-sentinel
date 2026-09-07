#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${SENTINEL_PORT:-8000}"
HOST="${SENTINEL_HOST:-0.0.0.0}"

echo "=========================================================="
echo "🛡️ STARTING MIDDLE EAST INTEL SENTINEL"
echo "Target Theatres: Egypt, Iran, Israel, Germany"
echo "Host: http://${HOST}:${PORT}"
echo "Lifetime Daemon: Active in background"
echo "=========================================================="

python3 -m uvicorn app.main:app --host "$HOST" --port "$PORT" --reload
