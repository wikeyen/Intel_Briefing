# Chinese Trend Intelligence — Design Document

**Date:** 2026-02-23
**Branch:** `feat/chinese-trend-intel`

---

## Summary

Adds 7 new Chinese trend sensors and 3 LLM-powered intelligence analysis sections to the dashboard:

1. **Public Focus** (Trend Intelligence) — what the masses care about, discovered from trending data across Chinese platforms
2. **Topic Pulse** (Social Topic Intelligence) — public sentiment on user-configured topics
3. **Voices** (Social Accounts Intelligence) — what followed accounts are focused on, their themes and opinions

---

## New Sensors

All 7 sensors are categorized as `trend` — they reflect collective attention, not factual reporting.

| Key | Label | API Endpoint | Data Format | Heat Metric |
|---|---|---|---|---|
| `baidu_tieba` | Baidu Tieba | `tieba.baidu.com/hottopic/browse/topicList` | JSON — `data.bang_topic.topic_list[]` | `discuss_num` (discussion count) |
| `douyin` | Douyin | `aweme.snssdk.com/aweme/v1/hot/search/list/` | JSON — `data.word_list[]` | `hot_value` (popularity score) |
| `toutiao` | Toutiao | `www.toutiao.com/hot-event/hot-board/` | JSON — `data[]` | `HotValue` (popularity score) |
| `netease` | Netease News | `m.163.com/fe/api/hot/news/flow` | JSON — `data.list[]` | none (presence-based ranking) |
| `36kr_trending` | 36Kr Hot | `gateway.36kr.com/api/mis/nav/home/nav/rank/hot` (POST) | JSON — `data.hotRankList[]` | `statRead` (read count) |
| `juejin` | Juejin | `api.juejin.cn/content_api/v1/content/article_rank` | JSON — `data[]` | `hot_rank` (ranking score) |
| `baidu` | Baidu Hot | `top.baidu.com/api/board?platform=wise&tab=realtime` | JSON — `data.cards[0].content[]` | none (rank-ordered) |

**Note:** Existing `sources_36kr` (newsflash feed) is kept as-is. The new `36kr_trending` is a separate hot-ranking API.

### Sensor Module Pattern

Each sensor follows the established pattern:
- `// ABOUTME:` 2-line header
- Exports a single `fetchXxx(config, limit): Promise<IntelItem[]>` function
- Uses `AbortSignal.timeout(15000)` for request timeouts
- Returns `IntelItem[]` with `id`, `source`, `title`, `url`, and optional `heat`
- Registered in `SENSOR_REGISTRY` (`sensors/index.ts`)
- Added to `SENSORS` array in `taxonomy.ts` with `language: 'cn'`, `category: 'trend'`
- Mapped in `SENSOR_DISPLAY_MAP` to `'trend'`

---

## Architecture

### File Layout

```
frontend/src/
  lib/
    sensors/
      baidu_tieba.ts          # already exists
      douyin.ts               # already exists
      toutiao.ts              # already exists
      netease.ts              # already exists
      kr_trending.ts          # already exists
      juejin.ts               # already exists
      baidu.ts                # already exists
      taxonomy.ts             # already updated with all 7 sensors
      index.ts                # already registers all 7 in SENSOR_REGISTRY
    pipeline/
      intelligence.ts         # LLM analysis: trend, topic, account
      intelligence-cache.ts   # SQLite KV cache with 48hr TTL
      orchestrator.ts         # runs intelligence after summary stage
  components/
    IntelligenceCards.tsx      # PublicFocusCard, TopicPulseCard, VoicesCard
    TagCloud.tsx              # reusable weighted tag visualization
    Dashboard.tsx             # integrates intelligence cards
  app/
    api/
      intelligence/
        route.ts              # GET /api/intelligence
```

### Data Flow

```
Pipeline Orchestrator
  ├── Stage 1: Fetch (all enabled sensors including 7 new CN trend sensors)
  ├── Stage 2: Dedup + Filter
  ├── Stage 3: Summarize (per-sensor + overall briefing)
  └── Stage 4: Intelligence Analysis (NEW — non-blocking)
        ├── Trend Analysis   → items where SENSOR_CATEGORY_MAP[source] === 'trend'
        ├── Topic Analysis   → items where item.topic is set
        └── Account Analysis → items where item.account is set
        │
        └── writeIntelligence() → SQLite KV cache (48hr TTL)

Dashboard
  └── GET /api/intelligence → readIntelligence() → renders 3 cards
```

---

## Intelligence Pipeline

### Entry Point

`runIntelligenceAnalysis(report, llmConfig, signal)` in `intelligence.ts`.

Called from `orchestrator.ts` after the summary stage completes (line 588-596). Wrapped in try/catch — failures are logged but never break the pipeline.

### Three Parallel Analyses

1. **Trend Analysis** (`analyzeTrendIntelligence`)
   - Input: all `IntelItem[]` from sensors categorized as `trend`
   - Builds a numbered list with source platform and heat scores
   - LLM identifies canonical topics, groups related items, assigns sentiment
   - Output: `TrendIntelligence` — topics[], tags[], summary

2. **Topic Analysis** (`analyzeTopicIntelligence`)
   - Input: all items with a non-empty `topic` field (from social topic sensors)
   - Groups items by topic keyword
   - LLM assesses public sentiment per topic
   - Output: `TopicIntelligence` — topics[], tags[], summary

3. **Account Analysis** (`analyzeAccountsIntelligence`)
   - Input: all items with a non-empty `account` field (from social account sensors)
   - Groups items by account handle
   - LLM identifies focus themes and overall sentiment per account
   - Output: `AccountsIntelligence` — accounts[], tags[], summary

All three run via `Promise.all()` — each catches its own errors independently.

### LLM Output Parsing

Robust JSON extraction pipeline:
1. Strip markdown code fences
2. Direct `JSON.parse`
3. Extract outermost `{...}` and retry
4. `jsonrepair` for broken JSON (unescaped quotes, trailing commas)
5. Validate/normalize sentiment values and tag weights

### Cache

`intelligence-cache.ts` uses the existing `kvSet`/`kvGet` from `db.ts`:
- Key: `intel:intelligence`
- TTL: 48 hours
- Stores the full `IntelligenceReport` (trend + topics + accounts, each nullable)

---

## Dashboard Visual Design

Three cards in a responsive grid above existing domain cards in the Dashboard view.

### Card Layout

Each card shares a common structure:
- `CARD_BASE` style: surface background, border, 8px radius, card shadow
- Colored accent bar via `CardHeader` component (3px left border stripe)
- Summary paragraph in secondary ink
- Content-specific visualization
- Loading skeleton with pulse animation
- Empty state hint when no data

### Card Specifications

| Card | Accent Color | Header | Content |
|---|---|---|---|
| **PublicFocusCard** | `#f39c12` (orange) | "Public Focus" | Summary + TagCloud (25 tags) + Top Topics list (8 max, sorted by heat) |
| **TopicPulseCard** | `#9b59b6` (purple) | "Topic Pulse" | Summary + Per-topic sections (sentiment badge, post count, sample posts) + TagCloud (20 tags) |
| **VoicesCard** | `#3498db` (blue) | "Voices" | Summary + TagCloud (20 tags) + Account rows (sentiment dot, handle, platform badge, theme mini-tags) |

### TagCloud

Reusable `TagCloud` component:
- Tags sorted by weight, rendered as inline pills
- Font size scales from 0.65rem (weight=0) to 1.3rem (weight=1)
- Sentiment-based coloring (positive=green, negative=red, mixed=amber, neutral=grey)
- Hover effect: brightness + background opacity shift

### Sentiment Indicators

- `SentimentDot`: colored circle (6-7px) — green/red/amber/grey
- `SentimentBadge`: labeled pill with dot + uppercase text + tinted background

---

## API

### `GET /api/intelligence`

Response:
```json
{
  "intelligence": {
    "trend": {
      "topics": [{ "name": "...", "summary": "...", "sentiment": "mixed", "sources": ["weibo","douyin"], "itemCount": 5, "heat": 85 }],
      "tags": [{ "text": "...", "weight": 0.9, "sentiment": "neutral" }],
      "summary": "...",
      "generated_at": "2026-02-23T12:00:00Z"
    },
    "topics": { ... },
    "accounts": { ... }
  }
}
```

Each of `trend`, `topics`, `accounts` is nullable (null if no data or analysis failed).

---

## Key Decisions

1. **All 7 new sensors categorized as `trend`** — they reflect collective attention (hot searches, trending boards), not factual reporting.

2. **Existing `sources_36kr` kept as-is** — the newsflash feed serves a different purpose (financial news). The new `36kr_trending` fetches the separate 24hr hot-ranking API.

3. **LLM extraction chosen over keyword matching** — Chinese language requires semantic understanding for topic clustering. Simple keyword/n-gram approaches fail on Chinese text without proper segmentation.

4. **Comment fetching deferred** — current version uses title-based analysis only. Comment scraping adds complexity (rate limits, auth, content moderation) for marginal initial benefit.

5. **Intelligence analysis is non-blocking and fault-tolerant** — wrapped in try/catch in the orchestrator, each of the 3 analyses catches independently, null results are acceptable.

6. **48hr cache TTL** — intelligence analysis is expensive (3 LLM calls). Trend data changes slowly enough that 48hr staleness is acceptable. Cache is refreshed on every successful pipeline run.

7. **No new config fields required** — intelligence reuses the existing `summary_provider`, `summary_api_key`, `summary_base_url`, and `summary_model` settings. It runs automatically when LLM is configured.
