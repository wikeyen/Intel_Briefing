# ABOUTME: FastAPI application entry point for Intel Briefing.
# ABOUTME: Lifespan starts the scheduler; routes handle intel, briefing, config, and health.
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from intel_briefing.config import load_settings, DEFAULT_SETTINGS_PATH
from intel_briefing.pipeline.cache import DEFAULT_CACHE_PATH
from intel_briefing.scheduler import start_scheduler, stop_scheduler
from intel_briefing.api.routes import control, intel, briefing, config as config_routes

logger = logging.getLogger(__name__)

_FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load config and start scheduler on startup; stop scheduler on shutdown."""
    settings_path = Path(DEFAULT_SETTINGS_PATH)
    app.state.settings_path = settings_path
    app.state.cache_path = Path(DEFAULT_CACHE_PATH)

    config = load_settings(settings_path)
    app.state.config = config

    logger.info("Starting Intel Briefing API — pipeline scheduled at %s (%s)",
                config.fetch_time, config.fetch_timezone)
    start_scheduler(config)

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

# Register routers
app.include_router(control.router, tags=["Control"])
app.include_router(intel.router, tags=["Intel"])
app.include_router(briefing.router, tags=["Briefing"])
app.include_router(config_routes.router, tags=["Config"])

# Serve built frontend at /ui (optional — only if dist exists)
if _FRONTEND_DIR.exists():
    app.mount("/ui", StaticFiles(directory=_FRONTEND_DIR, html=True), name="frontend")
    logger.info("Frontend mounted at /ui from %s", _FRONTEND_DIR)
