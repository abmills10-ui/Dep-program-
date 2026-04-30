#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Installing backend dependencies ==="
cd "$ROOT/backend"
pip install -r requirements.txt -q

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
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Start frontend
cd "$ROOT/frontend"
npm run dev

# Cleanup backend when frontend exits
kill $BACKEND_PID 2>/dev/null || true
