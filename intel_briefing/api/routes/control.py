# ABOUTME: Control routes for Intel Briefing API — health check and manual fetch trigger.
# ABOUTME: GET /health returns cache status; POST /fetch triggers pipeline as BackgroundTask.
import logging

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse

from intel_briefing.models import HealthResponse
from intel_briefing.pipeline.cache import read_cache, is_stale

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    """Return the health status and last fetch timestamp from the cache."""
    cache_path = request.app.state.cache_path
    report = read_cache(cache_path)
    if report is None:
        return HealthResponse(status="no_data", last_fetch=None)
    stale = is_stale(report, request.app.state.config.cache_ttl_hours)
    return HealthResponse(
        status="stale" if stale else "ok",
        last_fetch=report.fetched_at,
    )


@router.post("/fetch", status_code=202)
async def trigger_fetch(
    request: Request,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    """Trigger an immediate pipeline collection run in the background.

    Returns 202 Accepted immediately; the pipeline runs asynchronously.
    """
    config = request.app.state.config
    cache_path = request.app.state.cache_path

    def _collect():
        from intel_briefing.pipeline.collector import collect

        try:
            report = collect(config, cache_path)
            logger.info(
                "Manual fetch complete — sources_ok=%d sources_failed=%d",
                len(report.sources_ok),
                len(report.sources_failed),
            )
        except Exception as exc:
            logger.error("Manual fetch failed: %s", exc)

    background_tasks.add_task(_collect)
    return JSONResponse({"status": "accepted"}, status_code=202)
