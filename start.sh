#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/backend/.env"

# ── Create .env if it doesn't exist ──────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'ENVEOF'
ANTHROPIC_API_KEY=
ENVEOF
  echo ""
  echo "  Created backend/.env"
  echo "  To enable AI propositions, open that file and paste your Anthropic API key."
  echo ""
fi

# ── Load .env into the shell so uvicorn inherits the variables ────────────────
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "  NOTE: ANTHROPIC_API_KEY is blank in backend/.env — AI propositions will not work."
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
