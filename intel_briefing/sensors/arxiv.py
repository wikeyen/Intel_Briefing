# ABOUTME: ArXiv sensor that fetches recent AI/ML research papers via the ArXiv Atom API.
# ABOUTME: Uses a 3-tier query fallback strategy to stay resilient over weekends and low-submission periods.
import logging
import time

import defusedxml.ElementTree as ET
import httpx

from intel_briefing.models import ConfigSettings, IntelItem

logger = logging.getLogger(__name__)

# Ordered list of (search_query, sort_by) pairs tried in sequence.
# Each subsequent strategy is broader so that at least some results are returned
# even during weekend low-submission periods.
STRATEGIES = [
    ("cat:cs.AI", "submittedDate"),
    ("cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL", "submittedDate"),
    ("cat:cs.AI+OR+cat:cs.LG", "lastUpdatedDate"),
]


class ArxivSensor:
    """Sensor that fetches recent AI/ML papers from the ArXiv public Atom API."""

    sensor_name: str = "arxiv"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        """Fetch recent AI/ML papers from ArXiv using a 3-tier fallback strategy.

        Args:
            config: Full application settings (unused — no auth required for ArXiv).
            limit: Maximum number of IntelItem objects to return.

        Returns:
            List of IntelItem objects. Returns an empty list when all strategies fail.
        """
        for index, (query, sort_by) in enumerate(STRATEGIES):
            papers = self._query_arxiv(query, sort_by, limit)
            if papers:
                return papers
            # Brief pause before retrying with a broader strategy to reduce rate-limit risk.
            is_last = index == len(STRATEGIES) - 1
            if not is_last:
                logger.info(
                    "ArXiv strategy %d returned no results; waiting before next attempt",
                    index + 1,
                )
                time.sleep(3)

        logger.warning("ArXiv: all %d strategies exhausted with no results", len(STRATEGIES))
        return []

    def _query_arxiv(self, query: str, sort_by: str, limit: int) -> list[IntelItem]:
        """Execute a single ArXiv API query and parse the Atom XML response.

        Args:
            query: URL-encoded search_query string (e.g. "cat:cs.AI").
            sort_by: ArXiv sort field ("submittedDate" or "lastUpdatedDate").
            limit: Maximum number of entries to parse and return.

        Returns:
            List of IntelItem objects, or an empty list on any failure.
        """
        url = (
            f"https://export.arxiv.org/api/query"
            f"?search_query={query}"
            f"&start=0"
            f"&max_results={limit}"
            f"&sortBy={sort_by}"
            f"&sortOrder=descending"
        )
        try:
            resp = httpx.get(url, timeout=30)
            resp.raise_for_status()
        except Exception as exc:
            logger.warning("ArXiv: HTTP request failed for query %r: %s", query, exc)
            return []

        try:
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            root = ET.fromstring(resp.content)
            entries = root.findall(".//atom:entry", ns)
        except Exception as exc:
            logger.warning("ArXiv: XML parse failed for query %r: %s", query, exc)
            return []

        items: list[IntelItem] = []
        for entry in entries:
            try:
                # Extract the ArXiv paper ID from the <id> element
                id_el = entry.find("atom:id", ns)
                raw_id = id_el.text.strip() if id_el is not None and id_el.text else ""
                arxiv_id = raw_id.rsplit("/", 1)[-1]  # e.g. "2401.12345v1"

                title_el = entry.find("atom:title", ns)
                raw_title = title_el.text if title_el is not None and title_el.text else ""
                # Strip surrounding whitespace and collapse embedded newlines
                title = " ".join(raw_title.split())

                summary_el = entry.find("atom:summary", ns)
                raw_summary = summary_el.text if summary_el is not None and summary_el.text else ""
                abstract = " ".join(raw_summary.split())

                published_el = entry.find("atom:published", ns)
                published_text = (
                    published_el.text[:10]
                    if published_el is not None and published_el.text
                    else None
                )

                # Collect first 3 author names
                authors = [
                    name_el.text.strip()
                    for author_el in entry.findall("atom:author", ns)
                    for name_el in [author_el.find("atom:name", ns)]
                    if name_el is not None and name_el.text
                ][:3]

                # Collect first 3 category terms
                categories = [
                    cat_el.get("term", "")
                    for cat_el in entry.findall("category", ns)
                    if cat_el.get("term")
                ][:3]
                # category elements use no namespace prefix in ArXiv Atom feeds
                if not categories:
                    categories = [
                        cat_el.get("term", "")
                        for cat_el in entry.findall("category")
                        if cat_el.get("term")
                    ][:3]

                items.append(
                    IntelItem(
                        id=arxiv_id,
                        source="arxiv",
                        title=title,
                        url=f"https://arxiv.org/abs/{arxiv_id}",
                        abstract=abstract,
                        authors=authors,
                        categories=categories,
                        published_at=published_text,
                    )
                )
            except Exception as exc:
                logger.warning("ArXiv: failed to parse one entry: %s", exc)
                continue

        return items
