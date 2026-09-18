#!/usr/bin/env bash
set -euo pipefail

export DATA_DIR="${DATA_DIR:-/data}"
export CONFIG_PATH="${CONFIG_PATH:-/data/config.json}"
export WEB_CONCURRENCY="${WEB_CONCURRENCY:-1}"
mkdir -p "$DATA_DIR"

# ---- Auto-generate secrets if missing ----
if [ -z "${JWT_SECRET:-}" ]; then
  export JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
  echo "Auto-generated JWT_SECRET"
fi
if [ -z "${ENCRYPTION_KEY:-}" ]; then
  export ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
  echo "Auto-generated ENCRYPTION_KEY"
fi
export JWT_ALGORITHM="${JWT_ALGORITHM:-HS256}"

# ---- Load config.json into env if it exists ----
if [ -f "$CONFIG_PATH" ]; then
  echo "Loading config from $CONFIG_PATH..."
  eval "$(python3 -c "
import json, os
try:
    cfg = json.load(open('$CONFIG_PATH'))
    for k, v in cfg.items():
        k = k.upper()
        if k not in os.environ and v:
            print(f'export {k}=\"{v}\"')
except: pass
")"
fi

# ---- Wait for Postgres ----
DB_URL="${DATABASE_URL:-}"
if [ -n "$DB_URL" ]; then
  DB_CLEAN=$(echo "$DB_URL" | sed 's|postgresql+asyncpg://||')
  DB_USER=$(echo "$DB_CLEAN" | cut -d: -f1)
  DB_PASS=$(echo "$DB_CLEAN" | cut -d: -f2 | cut -d@ -f1)
  DB_HOST=$(echo "$DB_CLEAN" | cut -d@ -f2 | cut -d: -f1)
  DB_PORT=$(echo "$DB_CLEAN" | cut -d: -f3 | cut -d/ -f1)
  DB_NAME=$(echo "$DB_CLEAN" | cut -d/ -f2)

  echo "Waiting for Postgres at $DB_HOST:$DB_PORT..."
  for i in $(seq 1 30); do
    if PGPASSWORD="$DB_PASS" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -q 2>/dev/null; then
      echo "Postgres is ready!"
      break
    fi
    echo "  Attempt $i/30..."
    sleep 2
  done

  echo "Enabling extensions..."
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true
  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' 2>/dev/null || true
  echo "Extensions enabled."
fi

# ---- Run migrations ----
echo "Running database migrations..."
uv run alembic upgrade heads

# ---- Seed default user ----
if [ -f "scripts/auto_setup_user.py" ]; then
  echo "Seeding default user..."
  uv run python scripts/auto_setup_user.py 2>/dev/null || echo "User seeding skipped."
fi

# ---- If a command was passed (e.g. the Celery worker), run that instead
# of the web app. Migrations/extensions above still apply so the worker
# can also be started standalone. ----
if [ "$#" -gt 0 ]; then
  echo "Custom command detected, skipping frontend/backend startup: $*"
  exec "$@"
fi

# ---- Start frontend ----
if [ -d "/app/frontend/.next" ]; then
  echo "Starting frontend on port 3000..."
  cd /app/frontend
  npx next start -p 3000 &
  FRONTEND_PID=$!
  cd /app
  echo "Frontend started (PID: $FRONTEND_PID)"
else
  echo "WARNING: No frontend build found at /app/frontend/.next"
fi

# ---- Start backend ----
echo "Starting backend on port 8000 with $WEB_CONCURRENCY worker(s)..."
exec uv run uvicorn src.launch_server:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers "$WEB_CONCURRENCY"
