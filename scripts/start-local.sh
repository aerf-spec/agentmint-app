#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"

echo "Starting AgentMint locally at http://${HOST}:${PORT}"
echo "Use the viewport toggle in the bottom-right corner for Desktop / 390px / 360px preview."

npm run dev -- --hostname "${HOST}" --port "${PORT}"
