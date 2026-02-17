# ABOUTME: Multi-stage production Dockerfile for Intel Briefing.
# ABOUTME: Stage 1 builds the React frontend; Stage 2 runs the Python API with bundled UI.

# ── Stage 1: build React frontend ──────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python API ────────────────────────────────────────────────────
FROM python:3.13-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies first (layer cache-friendly)
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev

# Copy package source
COPY intel_briefing/ ./intel_briefing/

# Copy built frontend so FastAPI serves it at /ui
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# Ensure cache and config directories exist
RUN mkdir -p cache config

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uv", "run", "uvicorn", "intel_briefing.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
