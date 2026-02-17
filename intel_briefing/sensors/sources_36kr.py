# ABOUTME: 36Kr news sensor using BeautifulSoup HTML scraping.
# ABOUTME: Fetches latest news flashes from 36Kr, a leading Chinese tech news outlet.
import logging

import httpx
from bs4 import BeautifulSoup

from intel_briefing.models import IntelItem, ConfigSettings

logger = logging.getLogger(__name__)

_36KR_URL = "https://36kr.com/newsflashes"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}


class Sources36KrSensor:
    """Fetches latest news flashes from 36Kr (Chinese tech news)."""

    sensor_name = "sources_36kr"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        try:
            resp = httpx.get(
                _36KR_URL,
                headers=_HEADERS,
                timeout=15,
                follow_redirects=True,
            )
            resp.raise_for_status()
        except Exception as exc:
            logger.warning("36Kr fetch failed: %s", exc)
            return []

        soup = BeautifulSoup(resp.text, "html.parser")
        items: list[IntelItem] = []

        for idx, item_tag in enumerate(soup.select(".newsflash-item")):
            if len(items) >= limit:
                break

            title_elem = item_tag.select_one(".item-title")
            if not title_elem:
                continue
            title = title_elem.get_text(strip=True)
            href = title_elem.get("href", "")
            if not href:
                continue

            url = href if href.startswith("http") else f"https://36kr.com{href}"

            time_tag = item_tag.select_one(".time")
            time_str = time_tag.get_text(strip=True) if time_tag else None

            items.append(
                IntelItem(
                    id=f"36kr-{idx}-{hash(url) & 0xFFFF:04x}",
                    source="sources_36kr",
                    title=title,
                    url=url,
                    published_at=time_str,
                )
            )

        logger.info("36Kr sensor returned %d items", len(items))
        return items
