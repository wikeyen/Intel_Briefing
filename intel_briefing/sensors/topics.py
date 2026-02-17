# ABOUTME: Topics sensor — monitors configurable keywords and hashtags on X via Grok API.
# ABOUTME: Returns recent matching posts as structured IntelItem objects; deduplicates multi-keyword matches.
import json
import logging
from datetime import datetime, timezone

import httpx

from intel_briefing.models import IntelItem, ConfigSettings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are a social media intelligence analyst tracking specific topics on X (Twitter). "
    "Return ONLY a valid JSON array with no markdown fences and no extra text. "
    "Each element must be a JSON object with exactly these keys: "
    '{"topic": "<the keyword or hashtag that matched>", "handle": "<@author handle>", '
    '"title": "<post text, max 280 chars>", "url": "<direct post URL or empty string>", '
    '"published_at": "<ISO date YYYY-MM-DD or empty string>"}. '
    "Only include REAL posts from the last 48 hours. If a post matches multiple topics, "
    "include it once under the first matching topic. Return 0–20 items total."
)


def _build_user_prompt(keywords: list[str], today: str) -> str:
    kw_list = ", ".join(keywords)
    return (
        f"Today is {today}. Search X for recent posts about these topics or hashtags: {kw_list}. "
        "For each topic, find 1–3 high-signal posts from the last 48 hours. "
        "Deduplicate: if the same post matches multiple topics, include it once under the first matching topic. "
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
        logger.warning("Topics sensor: Grok response was not valid JSON: %.200s", text)
    return []


class TopicsSensor:
    """Monitors configurable keywords and hashtags on X for recent activity via Grok API."""

    sensor_name = "topics"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        if not config.xai_api_key:
            logger.warning("xAI API key absent; skipping Topics sensor")
            return []

        keywords = config.topics_keywords
        if not keywords:
            logger.debug("No topics keywords configured; skipping Topics sensor")
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
                {"role": "user", "content": _build_user_prompt(keywords, today)},
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
            logger.warning("Topics sensor API call failed: %s", exc)
            return []

        raw_items = _parse_response(content)
        items: list[IntelItem] = []
        seen_urls: set[str] = set()

        for idx, raw in enumerate(raw_items[:limit]):
            if not isinstance(raw, dict):
                continue
            title = str(raw.get("title") or "").strip()
            if not title:
                continue

            url = str(raw.get("url") or "")
            # Deduplicate by URL to prevent the same post appearing twice
            if url and url in seen_urls:
                continue
            if url:
                seen_urls.add(url)

            handle = str(raw.get("handle") or "").strip().lstrip("@")
            topic = str(raw.get("topic") or "").strip()

            items.append(
                IntelItem(
                    id=f"topics-{today}-{idx}",
                    source="topics",
                    title=title,
                    url=url,
                    handle=handle or None,
                    topic=topic or None,
                    published_at=str(raw.get("published_at") or today) or None,
                )
            )

        logger.info("Topics sensor returned %d items", len(items))
        return items
