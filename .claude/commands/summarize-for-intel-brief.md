# Summarize Intel Briefing

Read the latest Intel Briefing feed data and generate a comprehensive AI summary.

## Instructions

1. First, fetch the latest intel report by running this command:

```bash
curl -s http://localhost:8000/api/intel/latest
```

Parse the JSON response. It's an `IntelReport` with an `items` object keyed by section name (tech_trends, research, capital_flow, products, community, social, insights). Each section contains an array of items with `id`, `source`, `title`, `url`, and optional fields like `abstract`, `content`, `heat`, `account`.

2. Group all items by their `source` field (e.g. `hacker_news`, `arxiv`, `github`, etc.).

3. For each source that has items, write a 2-4 sentence summary highlighting key themes, notable items, and trends. Be specific — cite titles and names.

4. Then write an overall executive briefing (3-6 sentences) synthesizing all source summaries into a coherent overview of the most important developments.

5. Structure the output as JSON and POST it to the summary endpoint:

```bash
curl -X POST http://localhost:8000/api/summary \
  -H "Content-Type: application/json" \
  -d '{ JSON HERE }'
```

The JSON structure must be:

```json
{
  "generated_at": "<current ISO timestamp, e.g. 2026-02-19T10:00:00Z>",
  "report_fetched_at": "<fetched_at value from the report>",
  "sections": [
    {
      "sensor_name": "<source field value>",
      "label": "<human-readable label>",
      "summary": "<2-4 sentence summary>",
      "item_count": <number of items from this source>
    }
  ],
  "overall": "<3-6 sentence executive briefing>"
}
```

Use these sensor labels:
- hacker_news → Hacker News
- arxiv → ArXiv AI
- github → GitHub Trending
- product_hunt → Product Hunt
- v2ex → V2EX
- hn_blogs → HN Blogs
- sources_36kr → 36Kr
- wallstreetcn → WallStreetCN
- social_accounts → Social Accounts
- social_topics → Social Topics
- social_trends → Social Trends
- chrome_radar → Chrome Radar
- rss_feeds → RSS Feeds

6. Print a brief confirmation showing how many sources were summarized and the first sentence of the overall briefing.
