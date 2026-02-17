# ABOUTME: Production Dockerfile for Intel Briefing API service.
# ABOUTME: Python 3.13-slim + uv; runs uvicorn on port 8000; health check on /health.
FROM python:3.13-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies first (layer cache-friendly)
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev

# Copy package source
COPY intel_briefing/ ./intel_briefing/

# Ensure cache and config directories exist
RUN mkdir -p cache config

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uv", "run", "uvicorn", "intel_briefing.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
