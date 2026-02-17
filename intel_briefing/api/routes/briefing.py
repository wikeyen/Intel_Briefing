# ABOUTME: Briefing route — GET /briefing/markdown returns the report as a Markdown document.
# ABOUTME: Calls the pure renderer; returns text/markdown content type.
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from intel_briefing.pipeline.cache import read_cache
from intel_briefing.renderer.markdown import render

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/briefing/markdown")
async def get_markdown(request: Request) -> Response:
    """Return the latest IntelReport rendered as a Markdown document."""
    cache_path = request.app.state.cache_path
    report = read_cache(cache_path)
    if report is None:
        raise HTTPException(status_code=503, detail="No data available yet")
    md = render(report)
    return Response(content=md, media_type="text/markdown; charset=utf-8")
