# ABOUTME: Hacker News sensor using the official Firebase REST API.
# ABOUTME: Fetches top stories without authentication and returns IntelItem objects.
import logging

import httpx

from intel_briefing.models import ConfigSettings, IntelItem

logger = logging.getLogger(__name__)


class HackerNewsSensor:
    """Sensor that fetches top stories from Hacker News via the Firebase API."""

    sensor_name: str = "hacker_news"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        """Fetch top stories from Hacker News.

        Args:
            config: Full application settings (unused for this sensor — no auth required).
            limit: Maximum number of IntelItem objects to return.

        Returns:
            List of IntelItem objects. Returns an empty list on any failure.
        """
        try:
            resp = httpx.get(
                "https://hacker-news.firebaseio.com/v0/topstories.json",
                timeout=15,
            )
            resp.raise_for_status()
            story_ids = resp.json()
        except Exception as exc:
            logger.warning("HackerNews: failed to fetch top story IDs: %s", exc)
            return []

        # Fetch enough story IDs to account for non-story items being skipped
        candidate_ids = story_ids[: min(limit * 2, 30)]

        items: list[IntelItem] = []
        for story_id in candidate_ids:
            if len(items) >= limit:
                break
            try:
                item_resp = httpx.get(
                    f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
                    timeout=10,
                )
                item_resp.raise_for_status()
                item = item_resp.json()
            except Exception as exc:
                logger.warning("HackerNews: failed to fetch item %s: %s", story_id, exc)
                continue

            if not item or item.get("type") != "story":
                continue

            score = item.get("score", 0)
            descendants = item.get("descendants", 0)
            url = item.get("url") or f"https://news.ycombinator.com/item?id={story_id}"

            items.append(
                IntelItem(
                    id=f"hn-{story_id}",
                    source="hacker_news",
                    title=item.get("title", ""),
                    url=url,
                    heat=f"{score} pts, {descendants} comments",
                    published_at=None,
                )
            )

        return items
