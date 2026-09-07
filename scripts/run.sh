#!/bin/bash

set -e
trap "echo 'Shutting down gracefully...'; exit" SIGINT SIGTERM

# Set up environment
source ./scripts/environment.sh || true

cd "$(dirname "$0")/.."

# Load environment variables safely
set -a
source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env)
set +a

APP_MODULE="src.launch_server:app"
HOST="0.0.0.0"
WORKERS=3

# Choose port based on environment
if [[ "$APP_ENV" == "PROD" ]]; then
    PORT="$PROD_PORT"
else
    PORT="$DEV_PORT"
fi

PORT=${PORT:-8000}

echo "Starting server on http://$HOST:$PORT"

if [[ "$APP_ENV" == "PROD" ]]; then
    echo "Running with Gunicorn (production mode)..."
    # Replaced .venv/bin/gunicorn with uv run gunicorn
    uv run gunicorn "$APP_MODULE" \
        --bind "$HOST:$PORT" \
        --workers "$WORKERS" \
        --worker-class uvicorn.workers.UvicornWorker \
        --timeout 120
else
    echo "Running with Uvicorn (development mode with reload)..."
    # Replaced .venv/bin/uvicorn with uv run uvicorn
    uv run uvicorn "$APP_MODULE" \
        --host "$HOST" \
        --port "$PORT" \
        --reload \
        --reload-dir src
fi