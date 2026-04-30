#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Installing backend dependencies ==="
cd "$ROOT/backend"
# Use pip3 if pip is not available (common on macOS)
PIP=$(which pip3 2>/dev/null || which pip 2>/dev/null)
if [ -z "$PIP" ]; then
  echo "ERROR: pip/pip3 not found. Install Python 3 from https://python.org"
  exit 1
fi
$PIP install -r requirements.txt -q

echo "=== Installing frontend dependencies ==="
cd "$ROOT/frontend"
npm install --silent

echo ""
echo "=== Starting servers ==="
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:5173"
echo ""

# Start backend in background
cd "$ROOT/backend"
python3 -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Start frontend
cd "$ROOT/frontend"
npm run dev

# Cleanup backend when frontend exits
kill $BACKEND_PID 2>/dev/null || true
