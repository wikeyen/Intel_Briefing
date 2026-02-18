# ABOUTME: Production Dockerfile for the Intel Briefing Python backend.
# ABOUTME: Runs FastAPI on port 8001; frontend is a separate container serving as the gateway.

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

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1

CMD ["uv", "run", "uvicorn", "intel_briefing.api.main:app", "--host", "0.0.0.0", "--port", "8001"]
