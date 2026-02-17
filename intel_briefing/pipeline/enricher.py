# ABOUTME: Enrichment pipeline for Intel Briefing.
# ABOUTME: Runs Gemini translation and Jina full-content fetch concurrently with rate limiting.
import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

from intel_briefing.models import IntelItem, ConfigSettings

logger = logging.getLogger(__name__)

# Max concurrent Gemini calls to stay within rate limits
_GEMINI_CONCURRENCY = 3
# Delay between Gemini calls (seconds) — applied per worker, not globally
_GEMINI_CALL_DELAY = 0.6


def _translate_item(item: IntelItem, config: ConfigSettings) -> IntelItem:
    """Translate an item's title and abstract to Chinese via Gemini.

    Returns the same item mutated in-place with *_zh fields populated.
    Returns the item unchanged if translation fails or key is absent.
    """
    if not config.gemini_api_key:
        return item

    try:
        from intel_briefing.utils.gemini_translator import translate_to_chinese

        if item.title and not item.title_zh:
            time.sleep(_GEMINI_CALL_DELAY)
            item.title_zh = translate_to_chinese(item.title, max_chars=200)

        if item.abstract and not item.abstract_zh:
            time.sleep(_GEMINI_CALL_DELAY)
            item.abstract_zh = translate_to_chinese(item.abstract, max_chars=500)

    except Exception as exc:
        logger.warning("Translation failed for item %s: %s", item.id, exc)

    return item


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
    translate: bool = True,
    fetch_content: bool = False,
) -> list[IntelItem]:
    """Enrich items with Gemini translations and optionally Jina full content.

    Uses a ThreadPoolExecutor bounded by _GEMINI_CONCURRENCY so we stay
    within Gemini rate limits without sleeping in a single-threaded loop.

    Args:
        items: Items to enrich.
        config: Application settings (API keys, etc.).
        translate: Whether to run Gemini translation.
        fetch_content: Whether to fetch full article content via Jina.

    Returns:
        The same list with items enriched in-place.
    """
    if not items:
        return items

    workers = min(_GEMINI_CONCURRENCY, len(items))

    with ThreadPoolExecutor(max_workers=workers) as executor:
        if translate and config.gemini_api_key:
            futures = {executor.submit(_translate_item, item, config): item for item in items}
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as exc:
                    logger.warning("Enrichment future failed: %s", exc)

        if fetch_content:
            futures = {executor.submit(_fetch_content, item, config): item for item in items}
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as exc:
                    logger.warning("Content fetch future failed: %s", exc)

    return items
