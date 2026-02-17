# ABOUTME: Product Hunt sensor using the official GraphQL API.
# ABOUTME: Fetches trending products ordered by votes; requires a valid producthunt_token in config.
import logging

import httpx

from intel_briefing.models import ConfigSettings, IntelItem

logger = logging.getLogger(__name__)

PH_API = "https://api.producthunt.com/v2/api/graphql"

QUERY = """
query {
  posts(first: %d, order: VOTES) {
    edges {
      node {
        name
        tagline
        url
        votesCount
        website
        slug
        topics { edges { node { name } } }
        user { name }
      }
    }
  }
}
"""


class ProductHuntSensor:
    """Sensor that fetches trending products from Product Hunt via the official GraphQL API."""

    sensor_name: str = "product_hunt"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        """Fetch trending products from Product Hunt ordered by votes.

        Args:
            config: Full application settings; uses config.producthunt_token for auth.
            limit: Maximum number of IntelItem objects to return.

        Returns:
            List of IntelItem objects. Returns an empty list if token is absent or on any failure.
        """
        if not config.producthunt_token:
            logger.warning("ProductHunt: no token configured, skipping")
            return []

        try:
            headers = {
                "Authorization": f"Bearer {config.producthunt_token}",
                "Content-Type": "application/json",
            }
            resp = httpx.post(
                PH_API,
                json={"query": QUERY % limit},
                headers=headers,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("ProductHunt: request failed: %s", exc)
            return []

        items: list[IntelItem] = []
        try:
            edges = data.get("data", {}).get("posts", {}).get("edges", [])
            for edge in edges:
                node = edge["node"]
                slug = node.get("slug")
                ph_url = (
                    f"https://www.producthunt.com/posts/{slug}"
                    if slug
                    else node.get("url", "")
                )
                topics = [
                    t["node"]["name"]
                    for t in node.get("topics", {}).get("edges", [])
                ][:3]
                items.append(
                    IntelItem(
                        id=f"ph-{slug or node.get('name', '').lower().replace(' ', '-')}",
                        source="product_hunt",
                        title=f"{node['name']} — {node['tagline']}",
                        url=ph_url,
                        heat=f"{node.get('votesCount', 0)} votes",
                        categories=topics or None,
                    )
                )
        except Exception as exc:
            logger.warning("ProductHunt: failed to parse response: %s", exc)
            return []

        return items[:limit]
