# Intel Briefing — API Reference

Base URL: `/api`

## Authentication

All endpoints require an `X-API-Key` header when the `API_KEY` environment variable is set on the server. If unset (development mode), all routes are open.

```
X-API-Key: <your-api-key>
Content-Type: application/json
```

Cron endpoints use a separate `Authorization: Bearer <CRON_SECRET>` header instead.

---

## Endpoints

### Health

#### `GET /api/health`

Check if the system has data and whether it's fresh.

**Response**
```json
{
  "status": "ok | stale | no_data",
  "last_fetch": "2026-02-21T00:11:19.000Z"
}
```

| Status    | Meaning                                         |
|-----------|------------------------------------------------|
| `ok`      | Data exists and is within `cache_ttl_hours`     |
| `stale`   | Data exists but older than `cache_ttl_hours`    |
| `no_data` | No report has been fetched yet                  |

---

### Intel Data

#### `GET /api/intel/latest`

Returns the full intel report with all items across every section.

**Response** `200`
```json
{
  "date": "2026-02-21",
  "fetched_at": "2026-02-21T00:11:19.000Z",
  "stale": false,
  "sources_ok": ["hacker_news", "github", "arxiv"],
  "sources_failed": ["product_hunt"],
  "items": {
    "tech": [{ "id": "...", "source": "hacker_news", "title": "...", "url": "..." }],
    "research": [],
    "finance": [],
    "products": [],
    "community": [],
    "social": [],
    "insights": [],
    "feeds": []
  }
}
```

**Error** `503` — No data available yet.

#### `GET /api/intel/{section}?limit={n}`

Returns items from a single section.

| Param     | Type   | Default | Description                          |
|-----------|--------|---------|--------------------------------------|
| `section` | path   | —       | One of the section keys (see below)  |
| `limit`   | query  | `10`    | Max items to return (max 200)        |

**Section keys:** `tech`, `research`, `finance`, `products`, `community`, `social`, `insights`, `feeds`

**Response** `200`
```json
{
  "section": "tech",
  "stale": false,
  "fetched_at": "2026-02-21T00:11:19.000Z",
  "items": [
    {
      "id": "hn-42345678",
      "source": "hacker_news",
      "title": "Show HN: An open-source tool for...",
      "url": "https://example.com/article",
      "heat": "342 points",
      "published_at": "2026-02-21T08:30:00.000Z"
    }
  ]
}
```

**Error** `404` — Unknown section. `503` — No data.

---

### IntelItem Schema

Every item in the report conforms to this shape. Only `id`, `source`, `title`, and `url` are guaranteed; all other fields are optional and depend on the sensor.

```json
{
  "id": "string",
  "source": "string",
  "title": "string",
  "url": "string",
  "heat": "string | null",
  "published_at": "string | null",
  "authors": ["string"] ,
  "categories": ["string"],
  "abstract": "string | null",
  "account": "string | null",
  "handle": "string | null",
  "topic": "string | null",
  "content": "string | null",
  "verified": "boolean | null"
}
```

| Field          | Present when                    | Example                        |
|----------------|---------------------------------|--------------------------------|
| `heat`         | HN, V2EX, GitHub, Weibo, Zhihu | `"342 points"`, `"1.2k stars"` |
| `published_at` | Most sensors                    | ISO 8601 timestamp             |
| `authors`      | ArXiv                           | `["Alice", "Bob"]`             |
| `categories`   | ArXiv                           | `["cs.AI", "cs.LG"]`          |
| `abstract`     | ArXiv                           | Full abstract text             |
| `account`      | Social sensors                  | `"@elonmusk"`                  |
| `handle`       | Social sensors                  | `"elonmusk"`                   |
| `topic`        | Social Topics                   | `"AI agents"`                  |
| `content`      | HN Blogs, RSS Feeds             | Full article body              |
| `verified`     | Grok-sourced items              | `true` / `false`               |

---

### Sensors & Taxonomy

The system organizes 16 sensors into 8 categories across two language groups.

| Sensor Key         | Label            | Category    | Language |
|--------------------|------------------|-------------|----------|
| `hacker_news`      | Hacker News      | tech        | ROW      |
| `github`           | GitHub Trending  | tech        | ROW      |
| `arxiv`            | ArXiv AI         | research    | ROW      |
| `product_hunt`     | Product Hunt     | products    | ROW      |
| `chrome_radar`     | Chrome Radar     | products    | ROW      |
| `hn_blogs`         | HN Blogs         | insights    | ROW      |
| `social_accounts`  | Social Accounts  | social      | ROW      |
| `social_topics`    | Social Topics    | social      | ROW      |
| `social_trends`    | Social Trends    | social      | ROW      |
| `rss_feeds`        | RSS Feeds        | feeds       | ROW      |
| `sources_36kr`     | 36Kr             | finance     | CN       |
| `wallstreetcn`     | WallStreetCN     | finance     | CN       |
| `v2ex`             | V2EX             | community   | CN       |
| `zhihu`            | Zhihu            | community   | CN       |
| `weibo`            | Weibo            | social      | CN       |
| `xiaohongshu`      | Xiaohongshu      | social      | CN       |

---

### Pipeline (Fetch)

#### `POST /api/fetch`

Trigger a pipeline run. Returns immediately; work happens in the background.

**Request body** (optional)
```json
{
  "mode": "fetch_summarize"
}
```

| Mode               | Behavior                                |
|--------------------|-----------------------------------------|
| `fetch`            | Fetch data from sensors only            |
| `summarize`        | Run AI summarization on existing data   |
| `fetch_summarize`  | Fetch then summarize (default)          |

**Response** `202`
```json
{
  "status": "accepted",
  "mode": "fetch_summarize"
}
```

**Error** `409` — A pipeline is already running.

#### `GET /api/fetch/status`

Poll the current or most recent pipeline run status.

**Response** `200`
```json
{
  "running": true,
  "cancelled": false,
  "mode": "fetch_summarize",
  "default_concurrency": 4,
  "local_summary_concurrency": 1,
  "started_at": "2026-02-21T00:10:00.000Z",
  "completed_at": null,
  "sensors": [
    {
      "name": "hacker_news",
      "fetch": "ok",
      "fetch_error": null,
      "fetch_error_kind": null,
      "summary": "running",
      "summary_error": null,
      "item_count": 10,
      "summary_chunks_total": 2,
      "summary_chunks_done": 1,
      "verify_attempt": 0,
      "verify_max_retries": 3,
      "verify_failures": 0
    }
  ],
  "overall_summary": "queued",
  "total_items": 87,
  "alive": true
}
```

**Stage states:** `queued` | `running` | `ok` | `failed` | `skipped` | `cancelled`

#### `POST /api/fetch/stop`

Cancel a running pipeline.

**Response** `200`
```json
{ "status": "stopped" }
```

**Error** `404` — No pipeline running.

---

### AI Summary / Briefing

#### `GET /api/summary`

Get the cached AI briefing summary.

**Response** `200`
```json
{
  "summary": {
    "generated_at": "2026-02-21T01:00:00.000Z",
    "report_fetched_at": "2026-02-21T00:11:19.000Z",
    "sections": [
      {
        "sensor_name": "hacker_news",
        "label": "Hacker News",
        "source_url": "https://news.ycombinator.com",
        "summary": "Today's top stories focus on...",
        "item_count": 10,
        "items": [
          { "title": "Show HN: ...", "url": "https://...", "brief": "An open-source tool that..." }
        ]
      }
    ],
    "overall": {
      "quick_scan": [
        { "text": "Key development in...", "source": "hacker_news", "refs": [{ "title": "...", "url": "..." }] }
      ],
      "executive_summary": "A comprehensive overview of today's...",
      "sections": [
        {
          "title": "AI & Machine Learning",
          "entries": [
            { "text": "Major breakthrough in...", "source": "arxiv", "refs": [{ "title": "...", "url": "..." }] }
          ]
        }
      ],
      "sentiment": {
        "overall_mood": "bullish",
        "mood_summary": "Positive sentiment driven by...",
        "controversies": [],
        "opinion_shifts": [],
        "risk_flags": []
      }
    }
  }
}
```

Returns `{ "summary": null }` if no summary has been generated.

#### `POST /api/summary`

Write/overwrite the cached briefing summary.

**Request body** — Full `BriefingSummary` object (see schema above).

**Response** `200`
```json
{ "ok": true }
```

#### `GET /api/summary/export`

Export the summary as structured JSON. Same shape as the `summary` field in `GET /api/summary`.

**Response** `200` — `BriefingSummary` object.
**Error** `404` — No summary available.

#### `POST /api/summary/trigger`

Manually start AI summarization using configured LLM provider.

**Response** `202`
```json
{ "ok": true, "status": "accepted" }
```

**Error** `400` — No LLM provider configured or no report data.

#### `POST /api/summary/stop`

Cancel running summarization.

**Response** `200`
```json
{ "status": "stopped" }
```

**Error** `404` — No summary running.

#### `GET /api/summary/status`

Poll summarization progress.

**Response** `200`
```json
{
  "running": true,
  "started_at": "2026-02-21T01:00:00.000Z",
  "completed_at": null,
  "sensors": [
    { "sensor_name": "hacker_news", "label": "Hacker News", "state": "ok", "error": null },
    { "sensor_name": "github", "label": "GitHub Trending", "state": "running", "error": null }
  ],
  "alive": true
}
```

**Sensor states:** `pending` | `running` | `ok` | `failed`

#### `GET /api/summary/stream`

Server-Sent Events stream of real-time summarization progress.

**Response** — `text/event-stream`

```
event: token
data: {"sensor":"hacker_news","token":"Today's"}

event: state
data: {"sensor":"hacker_news","state":"ok","label":"Hacker News","error":null}

event: done
data: {}
```

| Event   | When                                    |
|---------|-----------------------------------------|
| `token` | Each LLM output token during generation |
| `state` | Sensor state changes                    |
| `done`  | Summarization complete                  |
| `idle`  | No active summarization                 |

#### `POST /api/summary/test`

Test LLM connectivity using current config.

**Response** `200`
```json
{ "ok": true, "latency_ms": 1234 }
```

```json
{ "ok": false, "error": "Connection refused" }
```

---

### Briefing Export

#### `GET /api/briefing/markdown`

Get the full intel report rendered as Markdown.

**Response** `200` — `Content-Type: text/markdown; charset=utf-8`

**Error** `503` — No data available.

---

### Configuration

#### `GET /api/config`

Returns current config with sensitive fields masked as `"***"`.

**Masked fields:** `xai_api_key`, `github_token`, `producthunt_token`, `bluesky_app_password`, `mastodon_token`, `summary_api_key`

**Response** `200` — Full `ConfigSettings` object.

#### `PUT /api/config`

Partial update. Only include fields you want to change. Masked values (`"***"`) and `null` on sensitive fields are ignored (not overwritten).

**Request body** — Partial `ConfigSettings`
```json
{
  "default_limit": 15,
  "sensors_enabled": { "hacker_news": true, "v2ex": false },
  "boost_keywords": ["AI", "LLM"]
}
```

**Response** `200` — Updated config (masked).

#### `GET /api/config/raw`

Returns config with actual API key values unmasked. Use with caution.

---

### Cache Management

#### `POST /api/cache/invalidate`

Delete cached report data. Next fetch starts fresh.

**Response** `200`
```json
{ "ok": true, "invalidated": 1 }
```

#### `POST /api/cache/cleanup`

Remove items older than `post_expiry_days` from the cached report.

**Response** `200`
```json
{ "ok": true, "removed": 5, "expiry_days": 30 }
```

---

### Console

#### `GET /api/console/seen`

Get the last pipeline run ID the user has viewed.

**Response** `200`
```json
{ "runId": "2026-02-21T00:10:00.000Z" }
```

#### `PUT /api/console/seen`

Mark a pipeline run as seen (clears error badge).

**Request body**
```json
{ "runId": "2026-02-21T00:10:00.000Z" }
```

**Response** `200`
```json
{ "ok": true }
```

---

### Utilities

#### `GET /api/ollama/models?base_url={url}`

List locally available Ollama models. Proxies to avoid CORS.

| Param      | Type  | Default                    | Description         |
|------------|-------|----------------------------|---------------------|
| `base_url` | query | `http://localhost:11434`    | Ollama server URL   |

**Response** `200`
```json
{
  "models": [
    { "name": "llama3:8b", "size": "8B", "family": "llama", "quantization": "Q4_0" }
  ]
}
```

**Error** `502` — Ollama unreachable or timed out (5s).

#### `GET /api/rss-discover?url={url}`

Check if a URL is an RSS feed or auto-discover one from an HTML page.

| Param | Type  | Required | Description           |
|-------|-------|----------|-----------------------|
| `url` | query | yes      | URL to check/discover |

**Response** `200`
```json
{ "type": "feed", "feedUrl": "https://example.com/feed.xml", "feedTitle": "Example Blog" }
```

```json
{ "type": "discovered", "feedUrl": "https://example.com/rss", "feedTitle": "Example" }
```

```json
{ "type": "not_found", "message": "No RSS feed found" }
```

---

### Cron Endpoints

These use `Authorization: Bearer <CRON_SECRET>` instead of `X-API-Key`.

#### `GET /api/cron/pipeline`

Trigger a full pipeline run (designed for external cron schedulers).

**Response** `200`
```json
{
  "status": "ok",
  "mode": "fetch_summarize",
  "sources_ok": 12,
  "sources_failed": 1,
  "total_items": 87,
  "summarized": true
}
```

#### `GET /api/cron/cleanup`

Prune expired items from the report.

**Response** `200`
```json
{ "status": "ok", "removed": 3, "expiry_days": 30 }
```

---

## Quick Reference

| Endpoint                     | Method | Description                     |
|------------------------------|--------|---------------------------------|
| `/api/health`                | GET    | Cache health check              |
| `/api/intel/latest`          | GET    | Full intel report               |
| `/api/intel/{section}`       | GET    | Items by section                |
| `/api/config`                | GET    | Get config (masked)             |
| `/api/config`                | PUT    | Update config                   |
| `/api/config/raw`            | GET    | Get config (unmasked)           |
| `/api/fetch`                 | POST   | Start pipeline                  |
| `/api/fetch/status`          | GET    | Pipeline run status             |
| `/api/fetch/stop`            | POST   | Cancel pipeline                 |
| `/api/summary`               | GET    | Get cached AI summary           |
| `/api/summary`               | POST   | Write AI summary                |
| `/api/summary/export`        | GET    | Export summary JSON             |
| `/api/summary/trigger`       | POST   | Start AI summarization          |
| `/api/summary/stop`          | POST   | Cancel summarization            |
| `/api/summary/status`        | GET    | Summarization progress          |
| `/api/summary/stream`        | GET    | SSE token stream                |
| `/api/summary/test`          | POST   | Test LLM connection             |
| `/api/briefing/markdown`     | GET    | Report as Markdown              |
| `/api/cache/invalidate`      | POST   | Clear cached report             |
| `/api/cache/cleanup`         | POST   | Remove expired items            |
| `/api/console/seen`          | GET    | Last viewed run ID              |
| `/api/console/seen`          | PUT    | Mark run as viewed              |
| `/api/ollama/models`         | GET    | List Ollama models              |
| `/api/rss-discover`          | GET    | Discover RSS feeds              |
| `/api/cron/pipeline`         | GET    | Cron: run pipeline              |
| `/api/cron/cleanup`          | GET    | Cron: prune expired items       |
