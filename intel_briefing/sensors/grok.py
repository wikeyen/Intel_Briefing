# ABOUTME: Grok/xAI sensor for X (Twitter) tech trend intelligence.
# ABOUTME: Queries the Grok API for trending tech discussions; returns structured IntelItem list.
import json
import logging
from datetime import datetime, timezone

import httpx

from intel_briefing.models import IntelItem, ConfigSettings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are a tech intelligence analyst. Return ONLY a valid JSON array with no markdown fences, "
    "no explanation, no extra text. Each element must be a JSON object with exactly these keys: "
    '{"title": "<post or trend title>", "url": "<direct URL or empty string>", "heat": "<engagement metric or empty string>", "summary": "<one sentence summary>"}. '
    "Focus on the last 24 hours only. Return 0–15 items."
)


def _build_user_prompt(today: str) -> str:
    return (
        f"Today is {today}. Search X (Twitter) for the top trending tech discussions, "
        "product launches, AI breakthroughs, and developer news from the last 24 hours. "
        "Return a JSON array of the most significant items. No markdown, no prose — JSON only."
    )


def _parse_grok_response(text: str) -> list[dict]:
    """Parse the Grok JSON response, tolerating minor formatting issues."""
    text = text.strip()
    # Strip markdown code fences if Grok adds them
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(
            line for line in lines if not line.startswith("```")
        ).strip()
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        logger.warning("Grok response was not valid JSON: %.200s", text)
    return []


class GrokSensor:
    """Queries the xAI Grok API for trending tech discussions on X."""

    sensor_name = "grok"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        if not config.xai_api_key:
            logger.warning("xAI API key absent; skipping Grok sensor")
            return []

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config.xai_api_key}",
        }
        payload = {
            "model": config.xai_model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_prompt(today)},
            ],
            "stream": False,
            "temperature": 0.4,
        }

        try:
            resp = httpx.post(
                config.xai_base_url,
                headers=headers,
                json=payload,
                timeout=60,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
        except Exception as exc:
            logger.warning("Grok API call failed: %s", exc)
            return []

        raw_items = _parse_grok_response(content)
        items: list[IntelItem] = []
        for idx, raw in enumerate(raw_items[:limit]):
            if not isinstance(raw, dict):
                continue
            title = str(raw.get("title") or "").strip()
            if not title:
                continue
            items.append(
                IntelItem(
                    id=f"grok-{today}-{idx}",
                    source="grok",
                    title=title,
                    url=str(raw.get("url") or ""),
                    heat=str(raw.get("heat") or "") or None,
                    abstract=str(raw.get("summary") or "") or None,
                    published_at=today,
                )
            )

        logger.info("Grok sensor returned %d items", len(items))
        return items
