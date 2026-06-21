# ──────────────────────────────────────────────
#  กินเลย Backend — FastAPI
#  Stages:
#   base   dependencies only (shared layer)
#   dev    + hot-reload  (bind-mount /app)
#   prod   + code baked in, no reload
# ──────────────────────────────────────────────

FROM python:3.12-slim AS base

WORKDIR /app

# OS deps สำหรับ asyncpg และ psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev wget \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── dev ──────────────────────────────────────
FROM base AS dev

# bind-mount ทับ /app จาก docker-compose ได้เลย
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ── prod ─────────────────────────────────────
FROM base AS prod

COPY . .

# worker = 2  (ปรับตาม CPU ของ server)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--no-access-log"]
