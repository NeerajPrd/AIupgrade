FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    CONFIG_PATH=/data/config.json
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates gnupg lsb-release wget curl \
    && wget -qO /usr/share/keyrings/pgdg.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/keyrings/pgdg.asc] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update && apt-get install -y --no-install-recommends \
        postgresql-client-16 nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

# Python deps first (cache layer)
COPY pyproject.toml uv.lock* README.md ./
RUN uv sync --frozen --extra full || uv sync --extra full

# Copy all source
COPY . .

# Build frontend
WORKDIR /app/frontend
# NEXT_PUBLIC_* vars are baked into the client bundle at build time, so they
# must be passed as build args (not just container env) to differ per
# deployment. Defaults keep local `docker build` with no args working.
ARG NEXT_PUBLIC_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8000/ws-api
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WEBSOCKET_URL=$NEXT_PUBLIC_WEBSOCKET_URL
ENV NEXT_PUBLIC_DISABLE_AUTH=false
RUN npm ci --production=false && npm run build
WORKDIR /app

RUN chmod +x deploy/entrypoint.sh
EXPOSE 8000 3000
ENTRYPOINT ["deploy/entrypoint.sh"]
