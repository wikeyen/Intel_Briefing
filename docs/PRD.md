# Intel Briefing - Product Requirements Document

## 1. Product Overview

### What It Is

Intel Briefing is a self-hosted intelligence aggregation engine that fetches, deduplicates, filters, and summarizes content from 17 data sources into a daily AI-generated briefing. Built as a single Next.js 15 application with SQLite storage, it runs as a monolith with zero external service dependencies beyond the data sources themselves.

### Who It's For

- Developers wanting a daily tech landscape overview
- Product managers doing competitive analysis
- Indie hackers looking for inspiration and opportunities
- Investors tracking global tech, finance, and policy signals

### Core Value Proposition

**5 minutes a day to know what's happening across the global tech landscape.** The system automates the daily ritual of checking 17+ sources, eliminates duplicate noise, and produces a structured briefing with sentiment analysis, risk flags, and cited references -- all with URL verification to prevent LLM hallucinations.

### Key Differentiators

- Bilingual coverage: Rest-of-World (ROW) and Chinese (CN) sources in a unified pipeline
- LLM-agnostic: works with OpenRouter, Ollama, LM Studio, vLLM, or any OpenAI-compatible endpoint
- Map-reduce summarization with per-sensor caching and content-hash deduplication
- URL hallucination prevention via pool matching + HTTP verification with retry loop
- Real-time streaming of summary generation via SSE

---

## 2. Architecture

### Tech Stack

| Layer | Technology |
|:------|:-----------|
| Framework | Next.js 15 App Router (Turbopack dev) |
| Language | TypeScript 5.9 |
| Runtime | Node.js (server), React 19 (client) |
| Database | SQLite via `@libsql/client` (Turso-compatible) |
| UI | Inline styles with CSS custom properties, React Markdown |
| LLM | OpenAI-compatible chat completions API |
| Social APIs | `@atproto/api` (Bluesky), `@the-convocation/twitter-scraper` (X) |
| Content | `@mozilla/readability`, `turndown` (HTML to Markdown) |
| XML/RSS | `fast-xml-parser`, `node-html-parser` |
| Testing | Vitest + jsdom + @testing-library/react |

### System Design

```
                    +------------------+
                    |  Browser Client  |
                    +--------+---------+
                             |
                    +--------v---------+
                    |  Next.js App     |
                    |  (port 8000)     |
                    |                  |
                    |  /api/*  routes  |  <-- API layer (server-side)
                    |  /(ui)/* pages   |  <-- UI layer (client components)
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v------+  +----v-------+
     | Sensor      |  | Pipeline    |  | Summary    |
     | Registry    |  | Orchestrator|  | Engine     |
     | (17 sensors)|  | (fetch,     |  | (LLM,      |
     |             |  |  dedup,     |  |  map-reduce,|
     |             |  |  filter,    |  |  verify)   |
     |             |  |  cache)     |  |            |
     +--------+----+  +------+------+  +-----+------+
              |              |               |
              +--------------+---------------+
                             |
                    +--------v---------+
                    |  SQLite (kv)     |
                    |  data/intel.db   |
                    +------------------+
```

### Data Flow

```
Trigger (cron/manual/API)
    |
    v
[1] Pipeline Orchestrator
    |-- loads config (env > YAML > DB > defaults)
    |-- identifies enabled sensors
    |
    v
[2] Fetch Stage (concurrent via Semaphore)
    |-- each sensor: fetchFn(config, limit) -> IntelItem[]
    |-- errors caught per-sensor (never blocks pipeline)
    |
    v
[3] Report Assembly
    |-- lookback time filtering (per-sensor hours)
    |-- category assignment via SENSOR_CATEGORY_MAP
    |-- dedup within sections (case-insensitive title)
    |-- dedup across social section (accounts > topics/trends)
    |-- HTML entity decoding
    |-- keyword suppress/boost filtering
    |-- link verification (x_posts)
    |-- content enrichment (hn_blogs via Jina Reader)
    |-- write to SQLite cache (48h TTL)
    |
    v
[4] Summarize Stage (concurrent via Semaphore)
    |-- per-sensor LLM summarization
    |   |-- content hash check (skip unchanged sensors)
    |   |-- map-reduce for large item sets (>12 items)
    |   |-- retry-with-verification loop (max 3)
    |   |-- per-sensor cache write
    |-- overall briefing generation
    |   |-- quick_scan, executive_summary, sections, sentiment
    |   |-- URL verification against sensor summary pool
    |-- write BriefingSummary to SQLite (48h TTL)
    |
    v
[5] UI renders briefing + raw feed data
```

---

## 3. Features

### 3.1 Dashboard / Status Page (`/status`)

- Pipeline health indicator (ok / stale / no_data / error)
- Last fetch timestamp
- Briefing display with quick scan, executive summary, themed sections
- Sentiment analysis panel (mood, controversies, opinion shifts, risk flags)
- Sensor error table
- Action bar for triggering pipeline runs

### 3.2 Feed Page (`/data`)

- Raw intel items from all sources, organized by category
- Summary progress polling (cross-page awareness)
- Pagination

### 3.3 Briefing Page (`/briefing`)

- AI-generated briefing with markdown rendering
- Markdown export

### 3.4 Pipeline Page (`/pipeline`)

- Scheduling configuration (fetch time, timezone)
- Keyword filters (boost/suppress)
- Output limits (global default + per-sensor overrides)
- Cache management: mark stale, delete expired
- Post expiry configuration

### 3.5 Sensors Page (`/sensors`)

- Enable/disable toggle for each sensor
- Grouped by language (ROW/CN) and category
- Per-sensor limit and lookback hour overrides

### 3.6 Connections Page (`/connections`)

- Social account management (X, Bluesky, Mastodon)
- Social topic keyword configuration
- Following integration toggles (Bluesky, Mastodon)
- RSS feed URL management with auto-discovery

### 3.7 Credentials Page (`/api-keys`)

- API key entry for GitHub, Product Hunt, Twitter/X, Bluesky, Mastodon
- LLM provider configuration (OpenRouter / Local)
- Ollama model browser (when using local provider)
- LLM connection test button
- Secret masking in display (shown as `***`)

### 3.8 AI Summary Page (`/ai`)

- Standalone summary trigger (regenerate from cached report)
- Per-sensor summary progress with streaming tokens
- Summary prompt customization (per-sensor and overall)

### 3.9 Console Page (`/console`)

- Pipeline execution log with per-sensor stage tracking
- Fetch + summary stage states per sensor
- Map-reduce chunk progress
- URL verification retry progress
- "Seen" tracking for sidebar badge (new errors indicator)

### 3.10 Sources Page (`/sources`)

- Source reference listing

### 3.11 Sidebar

- Navigation via Next.js `Link` + `usePathname`
- Mobile responsive with hamburger menu
- Page title and description display
- Error badge when console has unseen errors

### 3.12 Toast Notifications

- Centralized via `ToastContext` (no prop drilling)
- Slide-in from right edge, height-collapse on exit
- Stacked toast system

---

## 4. Data Model

### Core Types

```
IntelItem
  id: string              -- "{sensor}-{unique_id}"
  source: string          -- sensor key (e.g., "hacker_news")
  title: string
  url: string
  heat?: string           -- engagement metric (e.g., "150 pts, 42 comments")
  published_at?: string   -- ISO datetime or YYYY-MM-DD
  authors?: string[]      -- ArXiv papers
  categories?: string[]   -- ArXiv categories
  abstract?: string       -- ArXiv paper abstract
  account?: string        -- social sensor account name
  handle?: string         -- social sensor handle
  topic?: string          -- social sensor topic keyword
  content?: string        -- full article content (hn_blogs)
  verified?: boolean      -- link verification status
```

### Report Types

```
IntelReport
  date: string            -- YYYY-MM-DD
  fetched_at: string      -- ISO timestamp
  stale: boolean
  sources_ok: string[]    -- sensors that succeeded
  sources_failed: string[]-- sensors that failed
  items: Record<CategoryKey, IntelItem[]>

CategoryKey = 'tech' | 'research' | 'finance' | 'products'
             | 'community' | 'social' | 'insights' | 'feeds'
```

### Summary Types

```
BriefingSummary
  generated_at: string
  report_fetched_at: string
  sections: SensorSummary[]     -- per-sensor summaries
  overall: OverallBriefing      -- cross-source briefing

SensorSummary
  sensor_name: string
  label: string
  source_url: string
  summary: string               -- 2-4 sentence trend analysis
  item_count: number
  items: SensorSummaryItem[]    -- 3-8 notable items with briefs

OverallBriefing
  quick_scan: BriefingEntry[]       -- top 3-5 headlines
  executive_summary: string         -- cross-domain narrative
  sections: BriefingSection[]       -- themed sections
  sentiment: SentimentAnalysis      -- mood + risk analysis

SentimentAnalysis
  overall_mood: 'bullish' | 'bearish' | 'mixed' | 'neutral'
  mood_summary: string
  controversies: SentimentEntry[]
  opinion_shifts: SentimentEntry[]
  risk_flags: SentimentEntry[]
```

### Pipeline Progress Types

```
PipelineStatus
  running: boolean
  cancelled: boolean
  mode: 'fetch' | 'summarize' | 'fetch_summarize'
  default_concurrency: number
  local_summary_concurrency: number
  started_at: string | null
  completed_at: string | null
  sensors: SensorJobProgress[]
  overall_summary: StageState
  total_items: number

SensorJobProgress
  name: string
  fetch: StageState           -- queued | running | ok | failed | skipped | cancelled
  fetch_error: string | null
  fetch_error_kind: 'config' | 'api' | null
  summary: StageState
  summary_error: string | null
  item_count: number
  summary_chunks_total: number
  summary_chunks_done: number
  verify_attempt: number
  verify_max_retries: number
  verify_failures: number
```

### Type Relationships

```
ConfigSettings ---> SENSOR_REGISTRY (enables/disables sensors)
IntelReport ------> IntelItem[] (items per category)
BriefingSummary --> SensorSummary[] (per-sensor LLM output)
                --> OverallBriefing (cross-source synthesis)
PipelineStatus --> SensorJobProgress[] (live tracking)
SummaryProgress -> SummarySensorProgress[] (cross-page awareness)
```

---

## 5. Sensor System

### 5.1 Sensor Registry

All 17 sensors are registered in `SENSOR_REGISTRY` (a `Record<string, SensorFetchFn>`). Each sensor is a function with signature:

```typescript
(config: ConfigSettings, limit: number) => Promise<IntelItem[]>
```

### 5.2 Sensor Taxonomy

Sensors are organized by language and category:

| # | Sensor Key | Label | Category | Language | Source | Auth Required |
|:--|:-----------|:------|:---------|:---------|:-------|:--------------|
| 1 | `hacker_news` | Hacker News | tech | ROW | Firebase REST API | No |
| 2 | `github` | GitHub Trending | tech | ROW | GraphQL API | Yes (`GITHUB_TOKEN`) |
| 3 | `arxiv` | ArXiv AI | research | ROW | ArXiv API | No |
| 4 | `product_hunt` | Product Hunt | products | ROW | GraphQL API | Yes (`PRODUCTHUNT_TOKEN`) |
| 5 | `chrome_radar` | Chrome Radar | products | ROW | Chrome Web Store | No |
| 6 | `hn_blogs` | HN Blogs | insights | ROW | HN API + Jina Reader | No |
| 7 | `x_posts` | X Posts | social | ROW | twitter-scraper | Yes (cookies) |
| 8 | `social_accounts` | Social Accounts | social | ROW | Bluesky/Mastodon APIs | Yes (per-platform) |
| 9 | `social_topics` | Social Topics | social | ROW | Bluesky/Mastodon APIs | Yes (per-platform) |
| 10 | `social_trends` | Social Trends | social | ROW | Bluesky/Mastodon APIs | Yes (per-platform) |
| 11 | `rss_feeds` | RSS Feeds | feeds | ROW | HTTP fetch + XML parse | No |
| 12 | `sources_36kr` | 36Kr | finance | CN | Web scraping | No |
| 13 | `wallstreetcn` | WallStreetCN | finance | CN | Web scraping | No |
| 14 | `v2ex` | V2EX | community | CN | V2EX API | No |
| 15 | `zhihu` | Zhihu | community | CN | Web scraping | No |
| 16 | `weibo` | Weibo | social | CN | Web scraping | No |
| 17 | `xiaohongshu` | Xiaohongshu | social | CN | Web scraping | No |

### 5.3 Sensor Error Handling

- `SensorConfigError`: thrown when required credentials are missing (error_kind: `'config'`)
- API/network errors: caught generically (error_kind: `'api'`)
- Sensors never block the pipeline; errors are recorded and the sensor is excluded from summary

### 5.4 Social Sensor Architecture

The social sensors span three platforms (X, Bluesky, Mastodon) across three modes:

| Mode | Bluesky | Mastodon | X |
|:-----|:--------|:---------|:--|
| Accounts | `social_accounts` | `social_accounts` | `x_posts` |
| Topics | `social_topics` | `social_topics` | -- |
| Trends | `social_trends` | `social_trends` | -- |

Deduplication priority: accounts > topics > trends (within social category).

### 5.5 Shared Sensor Utilities

`sensors/utils.ts` provides:
- `stripHtml(html)`: remove HTML tags
- `md5Short(input)`: first 8 hex chars of MD5 hash
- `hashString(s)`: DJB2-style string hash
- `delay(ms)`: rate-limiting pause

---

## 6. Pipeline

### 6.1 Pipeline Modes

| Mode | Fetch | Summarize | Use Case |
|:-----|:------|:----------|:---------|
| `fetch` | Yes | No | Data collection only |
| `summarize` | No | Yes | Regenerate summary from cached report |
| `fetch_summarize` | Yes | Yes | Full pipeline run (default) |

### 6.2 Fetch Stage

1. Load config via layered priority chain
2. Identify enabled sensors from registry
3. Create `Semaphore(default_concurrency)` (default: 4)
4. Run all sensor fetches concurrently through the semaphore
5. Per-sensor: `fetchFn(config, limit)` with error isolation
6. Wait for ALL fetches to complete before proceeding
7. Track progress via `PipelineProgressTracker`

### 6.3 Report Assembly

1. **Lookback filtering**: per-sensor `sensor_lookback_hours` removes old items
2. **Category assignment**: `SENSOR_CATEGORY_MAP` routes items to sections
3. **Dedup (within section)**: case-insensitive title matching
4. **Dedup (cross-section)**: social accounts take priority over topics/trends on same URL
5. **HTML entity decoding**: via `he` library
6. **Keyword filtering**:
   - `suppress_keywords`: remove matching items (word-boundary, case-insensitive)
   - `boost_keywords`: move matching items to top of section
7. **Post-processing** (concurrent):
   - Link verification for X posts via HTTP HEAD/GET
   - Content enrichment for HN blogs via Jina Reader
8. **Cache write**: `intel:latest` key with 48h TTL

### 6.4 Concurrency Control

The `Semaphore` class implements a counting semaphore:
- Configurable concurrency limit
- `acquire()` returns a release function
- `run(fn)` for automatic scope-based release
- Used for both fetch and summary stages

### 6.5 Abort Support

- Module-level `AbortController` singleton
- `cancelPipeline()` aborts the controller and marks tracker as cancelled
- `isPipelineRunning()` checks for active controller
- Aborted fetches produce partial reports from completed results

---

## 7. AI Summary Engine

### 7.1 LLM Providers

| Provider | `summary_provider` | `summary_base_url` | Use Case |
|:---------|:-------------------|:--------------------|:---------|
| OpenRouter | `'openrouter'` | `https://openrouter.ai/api/v1` | Cloud models (default: `anthropic/claude-sonnet-4`) |
| Local | `'local'` | `http://localhost:11434/v1` | Ollama, LM Studio, vLLM |
| None | `null` | -- | Summary disabled |

### 7.2 LLM Client

Thin OpenAI-compatible client (`llm.ts`):
- `chatCompletion()`: standard request/response
- `chatCompletionStream()`: SSE streaming with async token iterator
- 120-second timeout per request
- `AbortSignal.any()` combines cancellation + timeout
- Detailed error extraction from non-OK responses

### 7.3 Per-Sensor Summarization

**Small batches** (<=12 items): single LLM call with synthesis prompt.

**Large batches** (>12 items): map-reduce:
1. **Map phase**: chunk items into groups of 12, extract key signals concurrently
2. **Reduce phase**: synthesize all extractions with the per-sensor prompt

Each sensor has a domain-specific default prompt (in Chinese) covering:
- What to focus on (e.g., "major product launches" for HN, "funding trends" for 36Kr)
- Output format: `{ summary: string, items: SensorSummaryItem[] }`
- Accuracy requirements: no fabrication, cite original sources

### 7.4 Per-Sensor Caching

- Content hash computed from items (via `computeContentHash()`)
- On regenerate (`skipCache: false`): if hash matches cached summary, skip LLM call
- On fresh fetch (`skipCache: true`): always regenerate
- Cache key: `summary:sensor:{name}`, 48h TTL

### 7.5 Overall Briefing

After all per-sensor summaries complete:
1. Build context from sensor summaries + notable items with URLs
2. Call LLM with overall prompt requesting:
   - `quick_scan`: top 3-5 headlines
   - `executive_summary`: cross-domain narrative
   - `sections`: themed sections (tech products, macro/policy, industry voices, funding)
   - `sentiment`: mood, controversies, opinion shifts, risk flags
3. URL verification against verified sensor summary items
4. All prompts instruct the LLM in Chinese

### 7.6 URL Verification & Retry

The `summarizeWithVerification()` loop prevents URL hallucination:

1. Call LLM, parse output, extract refs
2. Verify refs against known-good URL pool (instant match)
3. Non-pool URLs: HTTP HEAD/GET verification (concurrent, capped at 5)
4. If failures: append assistant response + correction message, retry
5. Max 3 retries; after exhaustion, mark failed refs as `verified: false`
6. Progress callback reports attempt/maxRetries/failures for UI

### 7.7 Streaming

- `SummaryEventBus`: in-memory pub/sub for tokens and state changes
- `createBus()` creates a singleton bus per run
- SSE endpoint (`/api/summary/stream`) subscribes to the bus
- Events: `token` (per-sensor tokens), `state` (sensor state changes), `done`
- `chatCompletionStream()` drives the token queue eagerly in the background

### 7.8 JSON Parsing

- `parseSensorJson()`: extracts `{ summary, items }` from LLM output
- `parseOverallJson()`: extracts full `OverallBriefing` structure
- `jsonrepair` library handles malformed JSON from LLM
- Repair logic in `readSummary()` re-parses broken fallback data on the fly

---

## 8. Configuration

### 8.1 Priority System

```
Environment Variables  (highest priority)
        |
    YAML File          (config/settings.local.yaml)
        |
    SQLite DB          (intel:config key)
        |
    Code Defaults      (defaultConfig() in models.ts)
```

UI saves write to both SQLite and YAML file simultaneously. Environment variables always win.

### 8.2 Environment Variables

| Variable | Purpose | Default |
|:---------|:--------|:--------|
| `DATABASE_URL` | SQLite file path | `file:data/intel.db` |
| `API_KEY` | API authentication key | (none, open mode) |
| `CRON_SECRET` | Cron endpoint auth | (none) |
| `GITHUB_TOKEN` | GitHub GraphQL API | (none) |
| `PRODUCTHUNT_TOKEN` | Product Hunt API | (none) |
| `TWITTER_AUTH_TOKEN` | X/Twitter cookie | (none) |
| `TWITTER_CT0` | X/Twitter cookie | (none) |
| `BLUESKY_HANDLE` | Bluesky handle | (none) |
| `BLUESKY_APP_PASSWORD` | Bluesky app password | (none) |
| `MASTODON_TOKEN` | Mastodon access token | (none) |
| `SOCIAL_FOLLOWING_BLUESKY` | Include Bluesky follows | `false` |
| `SOCIAL_FOLLOWING_MASTODON` | Include Mastodon follows | `false` |
| `RSS_FEED_URLS` | Comma-separated RSS URLs | (none) |
| `SUMMARY_API_KEY` | LLM API key | (none) |
| `SUMMARY_BASE_URL` | LLM endpoint | `https://openrouter.ai/api/v1` |
| `SUMMARY_MODEL` | LLM model ID | `anthropic/claude-sonnet-4` |
| `FETCH_TIME` | Daily fetch time (HH:MM) | `07:51` |
| `FETCH_TIMEZONE` | Fetch timezone | `Asia/Shanghai` |
| `CONFIG_FILE_PATH` | YAML config path | `../config/settings.local.yaml` |

### 8.3 ConfigSettings Fields

| Field | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `sensors_enabled` | `Record<string, boolean>` | (17 sensors, most enabled) | Per-sensor enable/disable |
| `default_limit` | `number` | `10` | Items per sensor |
| `sensor_limits` | `Record<string, number>` | `{}` | Per-sensor limit overrides |
| `sensor_lookback_hours` | `Record<string, number>` | `{}` | Per-sensor time window |
| `boost_keywords` | `string[]` | `[]` | Keywords to promote |
| `suppress_keywords` | `string[]` | `[]` | Keywords to remove |
| `cache_ttl_hours` | `number` | `6` | Report staleness threshold |
| `default_concurrency` | `number` | `4` | Parallel fetch/summary tasks |
| `local_summary_concurrency` | `number` | `1` | Concurrency for local LLM |
| `post_expiry_days` | `number` | `30` | Auto-cleanup threshold |
| `summary_provider` | `'openrouter' \| 'local' \| null` | `null` | LLM provider type |
| `summary_sensor_prompts` | `Record<string, string>` | `{}` | Per-sensor prompt overrides |
| `summary_overall_prompt` | `string` | `''` | Overall prompt override |
| `social_accounts_x` | `string[]` | `[]` | X accounts to monitor |
| `social_accounts_bluesky` | `string[]` | `[]` | Bluesky accounts |
| `social_accounts_mastodon` | `string[]` | `[]` | Mastodon accounts |
| `social_topics_keywords` | `string[]` | `[]` | Social topic keywords |
| `rss_feed_urls` | `string[]` | `[]` | RSS feed subscriptions |

### 8.4 Config Migration

The system auto-migrates legacy field names:
- `politics_accounts` -> `social_accounts_x`
- `topics_keywords` -> `social_topics_keywords`
- `pipeline_concurrency` / `fetch_concurrency` -> `default_concurrency`
- `summary_concurrency` -> `local_summary_concurrency`
- `summary_provider: 'custom'` -> `'local'`

### 8.5 Secret Masking

`maskConfig()` replaces values for these fields with `'***'`:
- `github_token`, `producthunt_token`, `bluesky_app_password`
- `mastodon_token`, `summary_api_key`
- `twitter_auth_token`, `twitter_ct0`

The `PUT /api/config` route strips masked values (`***`) and nulls for key fields, so sending back the masked response does not erase secrets.

---

## 9. API Reference

### 9.1 Authentication

All `/api/*` routes (except `/api/cron/*`) are protected by middleware:
- If `API_KEY` env var is set: requires `X-API-Key` header with matching value
- If `API_KEY` is not set: open mode, no auth required
- Cron routes use `CRON_SECRET` via `Authorization: Bearer {secret}` header

### 9.2 Endpoints

#### Health & Status

| Method | Path | Description | Response |
|:-------|:-----|:------------|:---------|
| `GET` | `/api/health` | Pipeline health check | `{ status: 'ok'\|'stale'\|'no_data', last_fetch }` |
| `GET` | `/api/fetch/status` | Live pipeline progress | `PipelineStatus & { alive: boolean }` |
| `GET` | `/api/summary/status` | Summary progress | `SummaryProgress & { alive: boolean }` |

#### Data

| Method | Path | Description | Response |
|:-------|:-----|:------------|:---------|
| `GET` | `/api/intel/latest` | Full report (all categories) | `IntelReport` |
| `GET` | `/api/intel/{section}` | Single section with `?limit=N` | `{ section, stale, fetched_at, items }` |
| `GET` | `/api/briefing/markdown` | Report as Markdown | `text/markdown` |

#### Summary

| Method | Path | Description | Response |
|:-------|:-----|:------------|:---------|
| `GET` | `/api/summary` | Cached briefing summary | `{ summary: BriefingSummary \| null }` |
| `POST` | `/api/summary` | Write a new summary | `{ ok: boolean }` |
| `POST` | `/api/summary/trigger` | Regenerate summary from cache | `{ ok: boolean, status: 'accepted' }` |
| `POST` | `/api/summary/test` | Test LLM connectivity | `{ ok: boolean, latency_ms?, error? }` |
| `POST` | `/api/summary/stop` | Cancel running summary | `{ status: 'stopped' }` |
| `GET` | `/api/summary/stream` | SSE stream of summary tokens | `text/event-stream` |
| `GET` | `/api/summary/export` | Structured summary JSON | `BriefingSummary` |

#### Pipeline Control

| Method | Path | Description | Response |
|:-------|:-----|:------------|:---------|
| `POST` | `/api/fetch` | Trigger pipeline (body: `{ mode? }`) | `{ status: 'accepted', mode }` (202) |
| `POST` | `/api/fetch/stop` | Cancel running pipeline | `{ status: 'stopped' }` |

#### Configuration

| Method | Path | Description | Response |
|:-------|:-----|:------------|:---------|
| `GET` | `/api/config` | Get config (secrets masked) | `ConfigSettings` |
| `GET` | `/api/config/raw` | Get config (secrets unmasked) | `ConfigSettings` |
| `PUT` | `/api/config` | Partial config update | `ConfigSettings` (masked) |

#### Cache Management

| Method | Path | Description | Response |
|:-------|:-----|:------------|:---------|
| `POST` | `/api/cache/invalidate` | Delete cached report | `{ ok, invalidated }` |
| `POST` | `/api/cache/cleanup` | Remove expired items | `{ ok, removed, expiry_days }` |

#### Utilities

| Method | Path | Description | Response |
|:-------|:-----|:------------|:---------|
| `GET` | `/api/rss-discover?url=` | RSS feed auto-discovery | `RssDiscoveryResult` |
| `GET` | `/api/ollama/models?base_url=` | List Ollama models | `{ models: OllamaModelInfo[] }` |
| `GET` | `/api/console/seen` | Last seen console run ID | `{ runId }` |
| `PUT` | `/api/console/seen` | Mark console run as seen | `{ ok: boolean }` |

#### Cron

| Method | Path | Description | Auth |
|:-------|:-----|:------------|:-----|
| `GET` | `/api/cron/pipeline` | Scheduled pipeline trigger | `CRON_SECRET` |
| `GET` | `/api/cron/cleanup` | Scheduled expired item cleanup | `CRON_SECRET` |

### 9.3 SSE Event Types (`/api/summary/stream`)

| Event | Data | Description |
|:------|:-----|:------------|
| `token` | `{ sensor, token }` | LLM token for a sensor summary |
| `state` | `{ sensor, state, label, error }` | Sensor state change |
| `done` | `{}` | Summary generation complete |
| `idle` | `{}` | No active summary (one-shot) |

### 9.4 Error Responses

| Status | Meaning |
|:-------|:--------|
| 400 | Invalid request body or missing config |
| 401 | Missing or invalid API key |
| 404 | Resource not found (no running pipeline, unknown section) |
| 409 | Pipeline already running |
| 502 | Upstream service error (Ollama) |
| 503 | No data available yet |

---

## 10. Security

### 10.1 API Authentication

- **Middleware** (`middleware.ts`): applies to all `/api/*` routes (matcher: `/api/:path*`)
- **API_KEY**: when set, all API requests must include `X-API-Key` header
- **Open mode**: when `API_KEY` is not set, no authentication required
- **Cron exclusion**: `/api/cron/*` routes bypass API_KEY middleware, use own `CRON_SECRET`

### 10.2 Timing-Safe Comparisons

Both middleware and cron routes use constant-time string comparison to prevent timing attacks:

```typescript
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)
  let diff = 0
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i]
  }
  return diff === 0
}
```

### 10.3 Secret Masking

- `GET /api/config` returns all secrets as `'***'`
- `PUT /api/config` ignores `'***'` and `null` for key fields (no accidental erasure)
- `GET /api/config/raw` returns actual values (for editing UI; still behind API_KEY auth)
- Key fields: `github_token`, `producthunt_token`, `bluesky_app_password`, `mastodon_token`, `summary_api_key`, `twitter_auth_token`, `twitter_ct0`

### 10.4 YAML Config File

- Secrets stored in `config/settings.local.yaml` (should be gitignored)
- Config file writes use `mkdir -p` for parent directory creation
- File includes header comments documenting the priority chain

### 10.5 Pipeline Execution

- `after()` from Next.js used for background execution (survives response delivery)
- Module-level singletons for abort controllers prevent concurrent pipeline runs
- 409 Conflict returned if pipeline is already running

---

## 11. Deployment

### 11.1 Docker Compose

Two services:

| Service | Purpose | Port |
|:--------|:--------|:-----|
| `frontend` | Next.js app | 8000 -> 3000 (internal) |
| `cron` | Scheduled pipeline trigger | -- |

```yaml
volumes:
  sqlite_data:  # persistent SQLite storage at /data/intel.db
```

Environment variables passed through: `API_KEY`, `CRON_SECRET`, `DATABASE_URL`.

Health check: `wget --spider http://localhost:3000/api/health` every 30s.

The cron sidecar calls `http://frontend:3000/api/cron/pipeline` at the configured `FETCH_TIME`.

### 11.2 Vercel

`vercel.json` configures a Vercel cron job:

```json
{ "path": "/api/cron/pipeline", "schedule": "0 23 * * *" }
```

Runs daily at 23:00 UTC. For Vercel deployment, use Turso (`libsql://`) as the database URL.

No-cache headers on `index.html` via `middleware.ts` or `next.config.js` to prevent stale UI.

### 11.3 Local Development

```bash
# Clone and install
git clone https://github.com/77AutumN/Intel_Briefing.git
cd Intel_Briefing/frontend && npm install

# Configure
cp ../.env.example .env.local

# Run (port 8000 with Turbopack)
npm run dev
# or from project root:
make dev
```

SQLite database auto-created at `frontend/data/intel.db` on first startup via `instrumentation.ts`.

---

## 12. Testing

### 12.1 Framework

- **Vitest** with jsdom environment for component tests
- **@testing-library/react** for React component testing
- **@testing-library/jest-dom** for DOM matchers

### 12.2 Configuration

```typescript
// vitest.config.ts
coverage: {
  provider: 'v8',
  thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
  include: ['src/lib/**/*.ts'],
}
```

### 12.3 Test Suite

| Area | Test File | What It Covers |
|:-----|:----------|:---------------|
| **Database** | `lib/db.test.ts` | kvSet, kvGet, TTL, expiry |
| **Models** | `lib/models.test.ts` | Type constructors, ensureAllSections |
| **Config** | `lib/config/index.test.ts` | Priority chain, migration, masking |
| **Pipeline** | `lib/pipeline/orchestrator.test.ts` | Full pipeline runs, abort, modes |
| **Pipeline** | `lib/pipeline/cache.test.ts` | Report/status read/write, staleness |
| **Pipeline** | `lib/pipeline/dedup.test.ts` | Title dedup, cross-section dedup |
| **Pipeline** | `lib/pipeline/keyword-filter.test.ts` | Suppress, boost, word-boundary |
| **Pipeline** | `lib/pipeline/semaphore.test.ts` | Concurrency limiting |
| **Pipeline** | `lib/pipeline/progress.test.ts` | Progress tracker state transitions |
| **Summary** | `lib/summary/summarizer.test.ts` | Map-reduce, caching, options |
| **Summary** | `lib/summary/llm.test.ts` | Chat completion, streaming, errors |
| **Summary** | `lib/summary/cache.test.ts` | Summary/sensor cache, repair |
| **Summary** | `lib/summary/parse-json.test.ts` | JSON extraction, repair |
| **Summary** | `lib/summary/prompts.test.ts` | Prompt selection, overrides |
| **Summary** | `lib/summary/ref-verifier.test.ts` | URL pool matching, HTTP fallback |
| **Summary** | `lib/summary/retry-with-verification.test.ts` | Retry loop, correction messages |
| **Summary** | `lib/summary/events.test.ts` | Event bus pub/sub lifecycle |
| **Summary** | `lib/summary/shared.test.ts` | Shared utilities |
| **Summary** | `lib/summary/streaming-integration.test.ts` | End-to-end streaming |
| **Summary** | `lib/summary/route.test.ts` | Summary API route handlers |
| **Summary** | `lib/summary/test-connection.test.ts` | LLM connection test |
| **Sensors** | `lib/sensors/sensors.test.ts` | Sensor registry, fetch functions |
| **Sensors** | `lib/sensors/social.test.ts` | Social sensor platform handling |
| **Sensors** | `lib/sensors/rss_feeds.test.ts` | RSS parsing, feed discovery |
| **Sensors** | `lib/sensors/x_posts.test.ts` | X/Twitter scraping |
| **Utilities** | `lib/utils/verifier.test.ts` | Link verification |
| **Utilities** | `lib/utils/jina-reader.test.ts` | Content fetching |
| **Utilities** | `lib/utils/decode-entities.test.ts` | HTML entity decoding |
| **Utilities** | `lib/utils/readability.test.ts` | Readability extraction |
| **Utilities** | `lib/utils/rss-discovery.test.ts` | RSS auto-discovery |
| **Components** | `components/Pagination.test.tsx` | Pagination component |
| **Components** | `components/AiSummary.test.tsx` | AI summary display |
| **Components** | `components/Briefing.test.tsx` | Briefing rendering |
| **Components** | `components/StaleProcessBanner.test.tsx` | Stale warning banner |
| **Components** | `components/status/ActionBar.test.tsx` | Action bar buttons |
| **Components** | `components/status/ScheduleFooter.test.tsx` | Schedule display |
| **Components** | `components/status/SensorTable.test.tsx` | Sensor status table |
| **API** | `lib/api.test.ts` | API client functions |
| **Platforms** | `lib/platforms/platforms.test.ts` | Platform abstraction |
| **E2E** | `lib/e2e.test.ts` | End-to-end integration |
| **Renderer** | `lib/renderer/markdown.test.ts` | Markdown export |

### 12.4 Running Tests

```bash
# All tests
cd frontend && npx vitest run

# Watch mode
npx vitest

# With coverage report
npx vitest run --coverage
```

---

## 13. Database Schema

Single-table key-value store:

```sql
CREATE TABLE IF NOT EXISTS kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,      -- JSON-serialized
  expires_at INTEGER             -- Unix timestamp, NULL = no expiry
);
```

### Well-Known Keys

| Key | Value Type | TTL | Purpose |
|:----|:-----------|:----|:--------|
| `intel:latest` | `IntelReport` | 48h | Cached fetch report |
| `intel:config` | `ConfigSettings` | none | User configuration |
| `intel:pipeline_status` | `PipelineStatus` | 1h | Pipeline progress |
| `intel:summary` | `BriefingSummary` | 48h | AI briefing cache |
| `intel:summary_status` | `SummaryProgress` | 1h | Summary progress |
| `summary:sensor:{name}` | `CachedSensorSummary` | 48h | Per-sensor summary cache |
| `console:last-seen-run` | `string` | none | Console badge tracking |

---

## 14. UI Pages

| Route | Component | Description |
|:------|:----------|:------------|
| `/status` | `Status.tsx` | Pipeline health, briefing display, sensor errors |
| `/data` | `Data.tsx` | Raw feed items by category |
| `/briefing` | `Briefing.tsx` | AI briefing with markdown rendering |
| `/pipeline` | `Pipeline.tsx` | Scheduling, filters, limits, cache management |
| `/sensors` | `Sensors.tsx` | Sensor enable/disable, per-sensor overrides |
| `/connections` | -- | Social accounts, topics, RSS feeds |
| `/api-keys` | `ApiKeys.tsx` | Credentials, LLM config |
| `/ai` | -- | Summary trigger, prompt customization |
| `/console` | `Console.tsx` | Pipeline execution log |
| `/sources` | -- | Source reference listing |

### UI Conventions

- All pages are `'use client'` components
- Inline styles with CSS custom properties (`--ink`, `--accent`, `--border`, `--canvas`)
- Mobile breakpoint at 768px
- `100dvh` for iOS Safari compatibility
- `env(safe-area-inset-*)` for iPhone notch/home indicator
- Toast notifications via `ToastContext` (centralized, no prop drilling)
- All code files start with a 2-line `// ABOUTME:` comment

---

## 15. Constants & Limits

| Constant | Value | Location |
|:---------|:------|:---------|
| `DEFAULT_TIMEOUT` | 15,000 ms | `config/index.ts` |
| `RSS_FETCH_TIMEOUT` | 10,000 ms | `config/index.ts` |
| `CONTENT_TRUNCATE_LIMIT` | 3,000 chars | `config/index.ts` |
| `MAX_BLOGS_TO_FETCH` | 20 | `config/index.ts` |
| `MAX_ARTICLES_PER_BLOG` | 2 | `config/index.ts` |
| `CHUNK_SIZE` | 12 items | `summary/prompts.ts` |
| `LLM_TIMEOUT` | 120,000 ms | `summary/llm.ts` |
| `MAX_RETRIES` (verification) | 3 | `summary/retry-with-verification.ts` |
| `HTTP_CONCURRENCY` (verification) | 5 | `summary/ref-verifier.ts` |
| `REPORT_TTL` | 48 hours | `pipeline/cache.ts` |
| `STATUS_TTL` | 1 hour | `pipeline/cache.ts` |
| `SUMMARY_TTL` | 48 hours | `summary/cache.ts` |
| `STALE_THRESHOLD` | 10 minutes | `summary/status/route.ts` |
| `OLLAMA_TIMEOUT` | 5,000 ms | `ollama/models/route.ts` |
| `MAX_LIMIT` (API) | 200 items | `intel/[section]/route.ts` |
| `MAX_COMMENTS` (HN) | 5 | `sensors/hacker_news.ts` |
