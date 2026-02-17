# ABOUTME: Config routes — GET /config (masked) and PUT /config (partial update + persist).
# ABOUTME: API keys are masked in GET responses; PUT merges, writes settings.json, reloads config.
import json
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from intel_briefing.config import load_settings, DEFAULT_SETTINGS_PATH
from intel_briefing.pipeline.cache import write_cache

router = APIRouter()
logger = logging.getLogger(__name__)

_MASKED = "***"
_KEY_FIELDS = {"gemini_api_key", "xai_api_key", "github_token", "producthunt_token"}


def _mask(data: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of the config dict with API key values replaced by '***'."""
    masked = dict(data)
    for field in _KEY_FIELDS:
        if masked.get(field):
            masked[field] = _MASKED
    return masked


@router.get("/config")
async def get_config(request: Request) -> JSONResponse:
    """Return the current configuration with API key values masked."""
    config = request.app.state.config
    raw = config.model_dump()
    return JSONResponse(_mask(raw))


@router.get("/config/raw")
async def get_config_raw(request: Request) -> JSONResponse:
    """Return the current configuration with actual API key values unmasked."""
    config = request.app.state.config
    return JSONResponse(config.model_dump())


@router.put("/config")
async def update_config(request: Request) -> JSONResponse:
    """Merge a partial settings dict into the current config and persist to settings.json.

    The request body should be a JSON object with any subset of ConfigSettings fields.
    Existing fields not included in the body are preserved. API key values of '***' are
    ignored (treated as "no change").

    Returns:
        The updated config with API keys masked.
    """
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object")

    # Strip masked key values — caller sent *** meaning "don't change"
    update = {k: v for k, v in body.items() if not (k in _KEY_FIELDS and v == _MASKED)}

    settings_path: Path = request.app.state.settings_path
    # Read existing settings.json (if any) and merge the update on top
    existing: dict[str, Any] = {}
    if settings_path.exists():
        try:
            existing = json.loads(settings_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Could not read existing settings.json: %s", exc)

    merged = {**existing, **update}

    # Atomic write
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = settings_path.with_suffix(".json.tmp")
    try:
        tmp.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, settings_path)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to persist settings: {exc}")

    # Reload config in memory and update app state
    try:
        new_config = load_settings(settings_path)
        request.app.state.config = new_config
    except Exception as exc:
        logger.error("Failed to reload config after update: %s", exc)
        raise HTTPException(status_code=500, detail=f"Settings saved but reload failed: {exc}")

    logger.info("Config updated and reloaded from %s", settings_path)
    return JSONResponse(_mask(new_config.model_dump()))
