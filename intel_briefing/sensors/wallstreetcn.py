# ABOUTME: WallStreetCN (华尔街见闻) sensor using the public information-flow API.
# ABOUTME: Fetches global finance and macro news from China's leading financial news platform.
import logging
from datetime import datetime

import httpx

from intel_briefing.models import IntelItem, ConfigSettings

logger = logging.getLogger(__name__)

_WSCN_URL = (
    "https://api-one.wallstcn.com/apiv1/content/information-flow"
    "?channel=global-channel&accept=article&limit=30"
)


class WallStreetCNSensor:
    """Fetches latest finance and macro news from WallStreetCN."""

    sensor_name = "wallstreetcn"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        try:
            resp = httpx.get(_WSCN_URL, timeout=15, follow_redirects=True)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("WallStreetCN fetch failed: %s", exc)
            return []

        items: list[IntelItem] = []
        for raw in data.get("data", {}).get("items", []):
            if len(items) >= limit:
                break

            res = raw.get("resource")
            if not res:
                continue

            title = res.get("title") or res.get("content_short")
            if not title:
                continue

            url = res.get("uri") or ""
            ts = res.get("display_time", 0)
            time_str = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M") if ts else None
            item_id = str(res.get("id") or hash(title) & 0xFFFF)

            items.append(
                IntelItem(
                    id=f"wscn-{item_id}",
                    source="wallstreetcn",
                    title=title,
                    url=url,
                    published_at=time_str,
                )
            )

        logger.info("WallStreetCN sensor returned %d items", len(items))
        return items
