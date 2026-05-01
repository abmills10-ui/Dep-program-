#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Create backend/.env if it doesn't exist ───────────────────────────────────
ENV_FILE="$ROOT/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'ENVEOF'
# Paste your Anthropic API key below to enable AI propositions in reports.
# Get one at: https://console.anthropic.com
ANTHROPIC_API_KEY=
ENVEOF
  echo ""
  echo "  Created backend/.env — open it and paste your Anthropic API key"
  echo "  to enable AI-generated propositions in issue reports."
  echo ""
fi

# Warn if key is still blank
if grep -q "^ANTHROPIC_API_KEY=$" "$ENV_FILE" 2>/dev/null; then
  echo "  NOTE: ANTHROPIC_API_KEY is not set in backend/.env"
  echo "        AI propositions will not work until you add it."
  echo ""
fi

echo "=== Installing backend dependencies ==="
cd "$ROOT/backend"
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

cd "$ROOT/backend"
python3 -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

cd "$ROOT/frontend"
npm run dev

kill $BACKEND_PID 2>/dev/null || true
