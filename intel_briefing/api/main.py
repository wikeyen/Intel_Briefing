# ABOUTME: FastAPI application entry point for Intel Briefing.
# ABOUTME: Lifespan starts the scheduler; routes handle intel, briefing, config, and health.
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

from intel_briefing.config import load_settings, DEFAULT_SETTINGS_PATH
from intel_briefing.models import PipelineStatus
from intel_briefing.pipeline.cache import DEFAULT_CACHE_PATH
from intel_briefing.scheduler import start_scheduler, stop_scheduler
from intel_briefing.api.routes import control, intel, briefing, config as config_routes

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load config and start scheduler on startup; stop scheduler on shutdown."""
    settings_path = Path(DEFAULT_SETTINGS_PATH)
    app.state.settings_path = settings_path
    app.state.cache_path = Path(DEFAULT_CACHE_PATH)

    config = load_settings(settings_path)
    app.state.config = config
    app.state.pipeline_status = PipelineStatus()

    logger.info("Starting Intel Briefing API — pipeline scheduled at %s (%s)",
                config.fetch_time, config.fetch_timezone)
    start_scheduler(config, settings_path)

    yield

    stop_scheduler()
    logger.info("Intel Briefing API shut down")


app = FastAPI(
    title="Intel Briefing",
    description="Minimal, elegant, LLM-queryable tech intelligence aggregation API.",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow all origins for local dev / LLM agent access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["*"],
)

# Dev proxy guard — when DEV_PROXY_SECRET is set, reject any request that doesn't
# carry the matching X-Dev-Proxy header (added by the Vite proxy in dev mode).
# Not active in Docker/production where the env var is absent.
_DEV_SECRET = os.environ.get("DEV_PROXY_SECRET")
if _DEV_SECRET:
    class _DevProxyGuard(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            if request.headers.get("X-Dev-Proxy") != _DEV_SECRET:
                return Response("Forbidden", status_code=403)
            return await call_next(request)

    app.add_middleware(_DevProxyGuard)
    logger.info("Dev proxy guard active — only Next.js gateway traffic accepted")

# Register routers
app.include_router(control.router, tags=["Control"])
app.include_router(intel.router, tags=["Intel"])
app.include_router(briefing.router, tags=["Briefing"])
app.include_router(config_routes.router, tags=["Config"])
