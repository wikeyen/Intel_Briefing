# ABOUTME: Enrichment pipeline for Intel Briefing.
# ABOUTME: Fetches full article content via Jina Reader with concurrency limiting.
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

from intel_briefing.models import IntelItem, ConfigSettings

logger = logging.getLogger(__name__)

# Max concurrent Jina fetch calls
_FETCH_CONCURRENCY = 3


def _fetch_content(item: IntelItem, config: ConfigSettings) -> IntelItem:
    """Fetch full article content for blog/insight items via Jina Reader."""
    if not item.url or item.content:
        return item
    try:
        from intel_briefing.utils.jina_reader import fetch_full_content

        content = fetch_full_content(item.url)
        if content:
            item.content = content
    except Exception as exc:
        logger.warning("Jina fetch failed for item %s: %s", item.id, exc)
    return item


def enrich_items(
    items: list[IntelItem],
    config: ConfigSettings,
    fetch_content: bool = False,
) -> list[IntelItem]:
    """Optionally enrich items with Jina full article content.

    Uses a ThreadPoolExecutor bounded by _FETCH_CONCURRENCY.

    Args:
        items: Items to enrich.
        config: Application settings (API keys, etc.).
        fetch_content: Whether to fetch full article content via Jina.

    Returns:
        The same list with items enriched in-place.
    """
    if not items:
        return items

    if fetch_content:
        workers = min(_FETCH_CONCURRENCY, len(items))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(_fetch_content, item, config): item for item in items}
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as exc:
                    logger.warning("Content fetch future failed: %s", exc)

    return items
