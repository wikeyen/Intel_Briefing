# ABOUTME: Hacker News top blogs sensor using OPML + RSS/Atom feed parsing.
# ABOUTME: Fetches recent articles from a curated list of high-quality tech blogs via httpx and defusedxml.
import hashlib
import logging
import re

import defusedxml.ElementTree as ET
import httpx

from intel_briefing.models import ConfigSettings, IntelItem

logger = logging.getLogger(__name__)

OPML_URL = (
    "https://gist.githubusercontent.com/emschwartz/e6d2bf860ccc367fe37ff953ba6de66b"
    "/raw/hn-popular-blogs-2025.opml"
)

# Used when the OPML source is unavailable
FALLBACK_FEEDS = [
    {"title": "Simon Willison", "rss": "https://simonwillison.net/atom/everything/"},
    {"title": "Mitchell Hashimoto", "rss": "https://mitchellh.com/feed.xml"},
    {"title": "antirez", "rss": "https://antirez.com/rss"},
    {"title": "Paul Graham", "rss": "https://www.aaronsw.com/2002/feeds/pgessays.rss"},
    {"title": "Pluralistic", "rss": "https://pluralistic.net/feed/"},
]

MAX_BLOGS = 20
MAX_PER_BLOG = 2


def _fetch_opml() -> list[dict]:
    """Fetch and parse the OPML blog list.

    Returns:
        List of dicts with 'title' and 'rss' keys, or an empty list on failure.
    """
    try:
        resp = httpx.get(OPML_URL, timeout=15, follow_redirects=True)
        resp.raise_for_status()
        content = resp.text
    except Exception as exc:
        logger.warning("HNBlogs: failed to fetch OPML: %s", exc)
        return []

    blogs: list[dict] = []
    # OPML outline attributes are safely parsed with regex (no nested XML needed)
    pattern = r'<outline[^>]+type="rss"[^>]*>'
    for match in re.finditer(pattern, content):
        outline = match.group(0)
        text_m = re.search(r'text="([^"]+)"', outline)
        xml_url_m = re.search(r'xmlUrl="([^"]+)"', outline)
        if text_m and xml_url_m:
            blogs.append({"title": text_m.group(1), "rss": xml_url_m.group(1)})

    return blogs


def _fetch_rss(source_title: str, rss_url: str) -> list[IntelItem]:
    """Fetch and parse a single RSS/Atom feed into IntelItem objects.

    Args:
        source_title: Human-readable name of the blog (used in id and source fields).
        rss_url: URL of the RSS or Atom feed to fetch.

    Returns:
        List of IntelItem objects (up to MAX_PER_BLOG). Returns an empty list on any failure.
    """
    try:
        resp = httpx.get(rss_url, timeout=10, follow_redirects=True)
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
    except Exception as exc:
        logger.debug("HNBlogs: failed to fetch/parse feed %s: %s", rss_url, exc)
        return []

    items: list[IntelItem] = []
    try:
        is_atom = "atom" in root.tag.lower() or root.tag == "{http://www.w3.org/2005/Atom}feed"

        if is_atom:
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            entries = root.findall(".//atom:entry", ns) or root.findall(".//entry")
            for entry in entries[:MAX_PER_BLOG]:
                title_el = entry.find("atom:title", ns) or entry.find("title")
                link_el = (
                    entry.find('atom:link[@rel="alternate"]', ns)
                    or entry.find("atom:link", ns)
                    or entry.find("link")
                )
                pub_el = (
                    entry.find("atom:published", ns)
                    or entry.find("atom:updated", ns)
                    or entry.find("published")
                    or entry.find("updated")
                )
                summary_el = (
                    entry.find("atom:summary", ns)
                    or entry.find("atom:content", ns)
                    or entry.find("summary")
                    or entry.find("content")
                )

                title_text = (title_el.text or "Untitled") if title_el is not None else "Untitled"
                url_text = (link_el.get("href", "") if link_el is not None else "")
                pub_text = (pub_el.text[:10] if pub_el is not None and pub_el.text else None)
                raw_summary = (summary_el.text if summary_el is not None and summary_el.text else "")
                content_text = re.sub(r"<[^>]+>", "", raw_summary).strip() or None

                if not url_text:
                    continue

                items.append(
                    IntelItem(
                        id=f"hnblog-{source_title}-{hashlib.md5(url_text.encode()).hexdigest()[:8]}",
                        source="hn_blogs",
                        title=title_text,
                        url=url_text,
                        published_at=pub_text,
                        content=content_text,
                    )
                )
        else:
            # RSS 2.0
            for item_el in root.findall(".//item")[:MAX_PER_BLOG]:
                title_el = item_el.find("title")
                link_el = item_el.find("link")
                pub_el = item_el.find("pubDate")
                desc_el = item_el.find("description")

                title_text = (title_el.text or "Untitled") if title_el is not None else "Untitled"
                url_text = (link_el.text or "") if link_el is not None else ""
                pub_text = (pub_el.text[:10] if pub_el is not None and pub_el.text else None)
                raw_desc = (desc_el.text if desc_el is not None and desc_el.text else "")
                content_text = re.sub(r"<[^>]+>", "", raw_desc).strip() or None

                if not url_text:
                    continue

                items.append(
                    IntelItem(
                        id=f"hnblog-{source_title}-{hashlib.md5(url_text.encode()).hexdigest()[:8]}",
                        source="hn_blogs",
                        title=title_text,
                        url=url_text,
                        published_at=pub_text,
                        content=content_text,
                    )
                )
    except Exception as exc:
        logger.debug("HNBlogs: error parsing feed entries for %s: %s", source_title, exc)
        return []

    return items


class HNBlogsSensor:
    """Sensor that fetches recent articles from HN-popular tech blogs via OPML + RSS/Atom."""

    sensor_name: str = "hn_blogs"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        """Fetch recent blog articles from HN-popular tech blogs.

        Attempts to retrieve the blog list from OPML; falls back to a curated
        list of feeds if the OPML source is unavailable. Articles are sorted
        by publication date descending (best-effort).

        Args:
            config: Full application settings (unused for this sensor — no auth required).
            limit: Maximum number of IntelItem objects to return.

        Returns:
            List of IntelItem objects. Returns an empty list on any failure.
        """
        try:
            blogs = _fetch_opml() or FALLBACK_FEEDS

            articles: list[IntelItem] = []
            for blog in blogs[:MAX_BLOGS]:
                articles.extend(_fetch_rss(blog["title"], blog["rss"]))
                if len(articles) >= limit * 3:
                    break

            # Sort by published_at descending; items without a date sort last
            articles.sort(key=lambda x: x.published_at or "", reverse=True)
            return articles[:limit]
        except Exception as exc:
            logger.warning("HNBlogs: unexpected error during fetch: %s", exc)
            return []
