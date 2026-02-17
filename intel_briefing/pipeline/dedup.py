# ABOUTME: Deduplication logic for Intel Briefing pipeline.
# ABOUTME: Removes duplicate items by title (case-insensitive) and deduplicates politics/topics overlap.
import logging
from intel_briefing.models import IntelItem

logger = logging.getLogger(__name__)


def dedup_items(items: list[IntelItem]) -> list[IntelItem]:
    """Remove duplicate items within a list using case-insensitive title matching.

    Items with empty or missing titles are always kept (they cannot be
    meaningfully deduplicated by title).

    Args:
        items: List of IntelItem objects, possibly containing duplicates.

    Returns:
        List with duplicates removed, preserving first-occurrence order.
    """
    seen: set[str] = set()
    result: list[IntelItem] = []
    for item in items:
        key = item.title.strip().lower() if item.title else ""
        if not key:
            # Keep items with empty titles — cannot deduplicate them
            result.append(item)
            continue
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


def dedup_across_sections(
    sections: dict[str, list[IntelItem]],
) -> dict[str, list[IntelItem]]:
    """Deduplicate items across the politics and topics sections.

    If the same post (matched by id) appears in both politics and topics,
    keep it in politics and remove it from topics. This avoids double-counting
    posts from tracked political accounts that also match tracked keywords.

    Args:
        sections: Dict mapping section names to lists of IntelItem objects.

    Returns:
        The same dict with cross-section duplicates removed.
    """
    politics_ids: set[str] = {item.id for item in sections.get("politics", [])}

    if not politics_ids:
        return sections

    topics = sections.get("topics", [])
    if not topics:
        return sections

    original_count = len(topics)
    sections["topics"] = [item for item in topics if item.id not in politics_ids]
    removed = original_count - len(sections["topics"])
    if removed:
        logger.debug(
            "dedup_across_sections: removed %d item(s) from topics (already in politics)",
            removed,
        )
    return sections
