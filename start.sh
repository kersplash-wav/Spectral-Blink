#!/usr/bin/env bash
# Start Spectral Blink locally: backend on :8000, frontend on :5173. Ctrl+C stops both.
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r backend/requirements.txt
fi
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install)
fi

fuser -k 8000/tcp 5173/tcp >/dev/null 2>&1 || true

.venv/bin/uvicorn backend.app.main:app --port 8000 &
BACK=$!
(cd frontend && npx vite --port 5173 --strictPort) &
FRONT=$!
trap 'kill $BACK $FRONT 2>/dev/null' EXIT INT TERM

sleep 3
echo ""
echo "  Spectral Blink is running → http://localhost:5173"
echo ""
wait
