# ABOUTME: Politics sensor — monitors political leaders' X (Twitter) accounts via Grok API.
# ABOUTME: Returns recent posts from configurable handles as structured IntelItem objects.
import json
import logging
from datetime import datetime, timezone

import httpx

from intel_briefing.models import IntelItem, ConfigSettings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are a political intelligence analyst monitoring social media. "
    "Return ONLY a valid JSON array with no markdown fences and no extra text. "
    "Each element must be a JSON object with exactly these keys: "
    '{"handle": "<@handle>", "account": "<Display Name>", "title": "<post text, max 280 chars>", '
    '"url": "<direct post URL or empty string>", "published_at": "<ISO date YYYY-MM-DD or empty string>"}. '
    "Only include REAL posts from the last 48 hours. Return 0–20 items total across all handles."
)


def _build_user_prompt(handles: list[str], today: str) -> str:
    handle_list = ", ".join(handles)
    return (
        f"Today is {today}. Search X for recent posts from these political accounts: {handle_list}. "
        "For each account, find their 1–3 most significant posts from the last 48 hours. "
        "Return a JSON array. No markdown, no prose — JSON only."
    )


def _parse_response(text: str) -> list[dict]:
    """Parse the Grok JSON response, tolerating markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        text = "\n".join(
            line for line in text.splitlines() if not line.startswith("```")
        ).strip()
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        logger.warning("Politics sensor: Grok response was not valid JSON: %.200s", text)
    return []


class PoliticsSensor:
    """Monitors political leaders' X accounts for recent posts via Grok API."""

    sensor_name = "politics"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        if not config.xai_api_key:
            logger.warning("xAI API key absent; skipping Politics sensor")
            return []

        handles = config.politics_accounts
        if not handles:
            logger.debug("No politics accounts configured; skipping Politics sensor")
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
                {"role": "user", "content": _build_user_prompt(handles, today)},
            ],
            "stream": False,
            "temperature": 0.3,
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
            logger.warning("Politics sensor API call failed: %s", exc)
            return []

        raw_items = _parse_response(content)
        items: list[IntelItem] = []
        for idx, raw in enumerate(raw_items[:limit]):
            if not isinstance(raw, dict):
                continue
            title = str(raw.get("title") or "").strip()
            handle = str(raw.get("handle") or "").strip().lstrip("@")
            if not title:
                continue
            items.append(
                IntelItem(
                    id=f"politics-{today}-{idx}",
                    source="politics",
                    title=title,
                    url=str(raw.get("url") or ""),
                    account=str(raw.get("account") or handle),
                    handle=handle or None,
                    published_at=str(raw.get("published_at") or today) or None,
                )
            )

        logger.info("Politics sensor returned %d items", len(items))
        return items
