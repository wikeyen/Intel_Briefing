# ABOUTME: Control routes for Intel Briefing API — health check and manual fetch trigger.
# ABOUTME: GET /health returns cache status; POST /fetch triggers pipeline; GET /fetch/status shows live progress.
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse

from intel_briefing.models import HealthResponse, PipelineStatus, SensorProgress
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


@router.get("/fetch/status", response_model=PipelineStatus)
async def fetch_status(request: Request) -> PipelineStatus:
    """Return the live status of the current (or most recent) pipeline run."""
    status: PipelineStatus = request.app.state.pipeline_status
    return status


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

    # Initialise progress — list every enabled sensor as pending
    enabled_sensors = [k for k, v in config.sensors_enabled.items() if v]
    request.app.state.pipeline_status = PipelineStatus(
        running=True,
        started_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        sensors=[SensorProgress(name=s, state="pending") for s in enabled_sensors],
    )

    def _on_progress(sensor_name: str, state: str, item_count: int, error: str | None) -> None:
        """Update the in-memory progress for a single sensor."""
        status: PipelineStatus = request.app.state.pipeline_status
        for sp in status.sensors:
            if sp.name == sensor_name:
                sp.state = state
                sp.item_count = item_count
                sp.error = error
                break
        # Recompute total across completed sensors
        status.total_items = sum(
            sp.item_count for sp in status.sensors if sp.state == "ok"
        )

    def _collect() -> None:
        from intel_briefing.pipeline.collector import collect

        try:
            report = collect(config, cache_path, on_progress=_on_progress)
            logger.info(
                "Manual fetch complete — sources_ok=%d sources_failed=%d",
                len(report.sources_ok),
                len(report.sources_failed),
            )
        except Exception as exc:
            logger.error("Manual fetch failed: %s", exc)
        finally:
            status: PipelineStatus = request.app.state.pipeline_status
            status.running = False
            status.completed_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            # Any sensors still in "running" state became stuck — mark as failed
            for sp in status.sensors:
                if sp.state in ("pending", "running"):
                    sp.state = "failed"
                    sp.error = "interrupted"

    background_tasks.add_task(_collect)
    return JSONResponse({"status": "accepted"}, status_code=202)
