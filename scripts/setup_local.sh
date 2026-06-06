#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Backend: virtualenv + dependencies"
cd backend
if [ ! -d venv ]; then
  python3 -m venv venv
fi
# shellcheck disable=SC1091
source venv/bin/activate
pip install -q -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created backend/.env from .env.example — fill in your Supabase and OpenAI values."
fi

echo "==> Checking required env vars"
python3 - <<'PY'
import os, sys
from dotenv import load_dotenv
load_dotenv()

required = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY"]
missing = [k for k in required if not os.getenv(k, "").strip()]
if missing:
    print("Missing in backend/.env:", ", ".join(missing))
    sys.exit(1)
print("All required env vars are set.")
PY

echo "==> Testing Supabase database connection"
python3 - <<'PY'
import os, sys
from dotenv import load_dotenv
load_dotenv()
import psycopg2

try:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema='public' ORDER BY table_name"
    )
    tables = [r[0] for r in cur.fetchall()]
    conn.close()
    if not tables:
        print("Connected, but no tables found.")
        print("Run setup_supabase.sql in the Supabase SQL Editor, then restart the backend.")
        sys.exit(1)
    print("Database OK. Tables:", ", ".join(tables))
except Exception as exc:
    print("Database connection failed:", exc)
    print("Check DATABASE_URL in backend/.env (Session pooler URI, port 5432).")
    sys.exit(1)
PY

cd "$ROOT"
echo "==> Frontend: npm install"
cd frontend
npm install --silent

echo ""
echo "Setup complete. Start the app in two terminals:"
echo "  Terminal 1: cd backend && source venv/bin/activate && uvicorn main:app --reload"
echo "  Terminal 2: cd frontend && npm start"
