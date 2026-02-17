# ABOUTME: V2EX sensor using the public hot topics JSON API.
# ABOUTME: Fetches trending topics from the V2EX Chinese tech community; no authentication required.
import logging

import httpx

from intel_briefing.models import ConfigSettings, IntelItem

logger = logging.getLogger(__name__)

V2EX_HOT_API = "https://www.v2ex.com/api/topics/hot.json"


class V2EXSensor:
    """Sensor that fetches hot topics from V2EX via the public JSON API."""

    sensor_name: str = "v2ex"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        """Fetch hot topics from V2EX.

        Args:
            config: Full application settings (unused for this sensor — no auth required).
            limit: Maximum number of IntelItem objects to return.

        Returns:
            List of IntelItem objects. Returns an empty list on any failure.
        """
        try:
            headers = {"User-Agent": "Intel-Briefing/1.0"}
            resp = httpx.get(
                V2EX_HOT_API,
                headers=headers,
                timeout=15,
                follow_redirects=True,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("V2EX: request failed: %s", exc)
            return []

        items: list[IntelItem] = []
        try:
            for topic in data[:limit]:
                replies = topic.get("replies", 0)
                topic_id = str(topic.get("id", ""))
                items.append(
                    IntelItem(
                        id=f"v2ex-{topic_id}",
                        source="v2ex",
                        title=topic.get("title", ""),
                        url=topic.get("url", ""),
                        heat=f"{replies} replies",
                    )
                )
        except Exception as exc:
            logger.warning("V2EX: failed to parse response: %s", exc)
            return []

        return items
