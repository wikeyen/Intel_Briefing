# ABOUTME: GitHub sensor using the GitHub GraphQL API to find recently-created trending repos.
# ABOUTME: Requires a valid GitHub token in config.github_token; skips gracefully without one.
import logging
import re
from datetime import datetime, timedelta

import httpx

from intel_briefing.models import ConfigSettings, IntelItem

logger = logging.getLogger(__name__)

GRAPHQL_URL = "https://api.github.com/graphql"

GRAPHQL_QUERY = """
query($search_query: String!, $count: Int!) {
  search(query: $search_query, type: REPOSITORY, first: $count) {
    edges {
      node {
        ... on Repository {
          nameWithOwner
          url
          description
          stargazerCount
          forkCount
          createdAt
          primaryLanguage { name }
        }
      }
    }
  }
}
"""


class GitHubSensor:
    """Sensor that fetches recently-created trending repositories via the GitHub GraphQL API."""

    sensor_name: str = "github"

    def fetch(self, config: ConfigSettings, limit: int) -> list[IntelItem]:
        """Fetch recently-created trending repositories from GitHub.

        Repositories are searched by creation date (last 7 days) and sorted by stars.
        Requires config.github_token to be set; returns an empty list without it.

        Args:
            config: Full application settings including the GitHub API token.
            limit: Maximum number of IntelItem objects to return.

        Returns:
            List of IntelItem objects. Returns an empty list on any failure.
        """
        if not config.github_token:
            logger.warning("GitHub token absent; skipping sensor")
            return []

        seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        search_query = f"created:>{seven_days_ago} sort:stars"

        headers = {
            "Authorization": f"Bearer {config.github_token}",
            "Content-Type": "application/json",
            "User-Agent": "Intel-Briefing/1.0",
        }

        try:
            resp = httpx.post(
                GRAPHQL_URL,
                json={
                    "query": GRAPHQL_QUERY,
                    "variables": {
                        "search_query": search_query,
                        "count": min(limit, 25),
                    },
                },
                headers=headers,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("GitHub: request failed: %s", exc)
            return []

        if "errors" in data:
            logger.warning("GitHub: GraphQL errors: %s", data["errors"])
            return []

        items: list[IntelItem] = []
        edges = data.get("data", {}).get("search", {}).get("edges", [])
        for edge in edges:
            node = edge.get("node")
            if not node:
                continue

            # Sanitize repo name to a safe character set
            raw_name = node.get("nameWithOwner", "")
            safe_name = re.sub(r"[^a-zA-Z0-9/_.\-]", "_", raw_name)

            description = node.get("description") or ""
            title = safe_name + (f" \u2014 {description}" if description else "")

            created_at = node.get("createdAt", "")
            published_at = created_at[:10] if created_at else None

            items.append(
                IntelItem(
                    id=f"gh-{safe_name.replace('/', '-')}",
                    source="github",
                    title=title,
                    url=node.get("url", ""),
                    heat=f"{node.get('stargazerCount', 0)} stars",
                    published_at=published_at,
                )
            )

        return items[:limit]
