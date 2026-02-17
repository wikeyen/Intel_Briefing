# ABOUTME: Intel data routes — GET /intel/latest and GET /intel/{section}.
# ABOUTME: Supports ?limit, stale detection, and 404 on unknown sections.
import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request

from intel_briefing.models import IntelReport
from intel_briefing.pipeline.cache import read_cache, is_stale

router = APIRouter()
logger = logging.getLogger(__name__)

_KNOWN_SECTIONS = {
    "tech_trends", "research", "capital_flow",
    "products", "community", "politics", "topics", "insights",
}

_MAX_LIMIT = 50


def _limit_sections(report: IntelReport, limit: int) -> IntelReport:
    """Return a copy of the report with each section truncated to limit items."""
    return report.model_copy(
        update={"items": {k: v[:limit] for k, v in report.items.items()}}
    )


@router.get("/intel/latest")
async def get_latest(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=_MAX_LIMIT)] = 10,
) -> dict:
    """Return the full latest IntelReport from cache.

    Query parameters:
        limit: Maximum items per section (1–50, default 10).
    """
    cache_path = request.app.state.cache_path
    config = request.app.state.config
    report = read_cache(cache_path)
    if report is None:
        raise HTTPException(status_code=503, detail="No data available yet")
    report = report.model_copy(update={"stale": is_stale(report, config.cache_ttl_hours)})
    report = _limit_sections(report, limit)
    return report.model_dump()


@router.get("/intel/{section}")
async def get_section(
    section: str,
    request: Request,
    limit: Annotated[int, Query(ge=1, le=_MAX_LIMIT)] = 10,
) -> dict:
    """Return items from a single report section.

    Returns 404 if the section name is not recognised.

    Query parameters:
        limit: Maximum items to return (1–50, default 10).
    """
    if section not in _KNOWN_SECTIONS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown section '{section}'. Known sections: {sorted(_KNOWN_SECTIONS)}",
        )
    cache_path = request.app.state.cache_path
    config = request.app.state.config
    report = read_cache(cache_path)
    if report is None:
        raise HTTPException(status_code=503, detail="No data available yet")
    report = report.model_copy(update={"stale": is_stale(report, config.cache_ttl_hours)})
    items = report.items.get(section, [])[:limit]
    return {
        "section": section,
        "stale": report.stale,
        "fetched_at": report.fetched_at,
        "items": [item.model_dump() for item in items],
    }
