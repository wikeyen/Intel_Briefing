# Parallel Pipeline Execution — Design

## Goal

Replace the monolithic fetch-then-summarize pipeline with a worker-pool architecture that supports three run modes (fetch only, summarize only, fetch+summarize), limits concurrency via a configurable semaphore, streams per-sensor summarization as fetches complete, and exposes two-stage progress in the Status UI.

## Architecture

### Execution Model

A counting semaphore (default size 4, configurable as `pipeline_concurrency` in Pipeline settings) gates how many sensor jobs run concurrently. Each enabled sensor becomes a job whose stages depend on the run mode:

| Mode | Job stages | Final step |
|------|-----------|------------|
| `fetch` | fetch sensor | build report |
| `summarize` | summarize sensor | overall summary |
| `fetch_summarize` | fetch sensor → summarize sensor | overall summary |

All work is async I/O (HTTP fetches, LLM API calls) — Node.js handles multiplexing naturally. No OS threads or external queue infrastructure needed.

```
Enabled sensors (e.g. 10)
   │
   ▼
┌──────────────────────────────────┐
│  Semaphore (concurrency: 4)      │
│                                  │
│  [Slot 1] HN: fetch → summarize │
│  [Slot 2] ArXiv: fetch → summ   │
│  [Slot 3] GitHub: fetching…     │
│  [Slot 4] PH: fetching…         │
│                                  │
│  Queue: RSS, V2EX, 36Kr...      │
└──────────────────────────────────┘
         │ all sensor jobs done
         ▼
   Overall Summary (single LLM call)
         │
         ▼
   Write final report + summary to DB
```

### Design Patterns

- **Semaphore**: Controls concurrency without OS threads. Reusable utility.
- **Observer / Event Emitter**: Pipeline emits progress events; status persistence and UI polling are decoupled subscribers.
- **Strategy**: Run mode determines which stages each job executes; the orchestrator doesn't branch on mode — it delegates to a strategy that defines the stage sequence.
- **Pipeline pattern**: Each sensor job is a sequence of composable stages (fetch → summarize), with each stage's output flowing to the next.

### Run Modes — UI

Three buttons replace the current single "Run Now":

```
[ Fetch ]  [ Summarize ]  [ Fetch + Summarize ]
```

- All disabled while a run is in progress.
- "Summarize" disabled if no cached report exists.

### Two-Stage Status UI

Each sensor shows two stage badges:

| State | Badge |
|-------|-------|
| queued | gray |
| running | pulsing blue |
| ok | green dot + item count |
| failed | red dot (expandable error) |
| skipped | dash (not applicable for this mode) |

Overall summary row appears at the bottom, activates after all per-sensor summaries complete.

Progress bar = completed stages / total stages for the active mode.

## Data Model

```typescript
type RunMode = 'fetch' | 'summarize' | 'fetch_summarize'
type StageState = 'queued' | 'running' | 'ok' | 'failed' | 'skipped'

interface PipelineStatus {
  running: boolean
  mode: RunMode
  concurrency: number
  started_at: string | null
  completed_at: string | null
  sensors: SensorJobProgress[]
  overall_summary: StageState
  total_items: number
}

interface SensorJobProgress {
  name: string
  fetch: StageState
  fetch_error: string | null
  fetch_error_kind: 'config' | 'api' | null
  summary: StageState
  summary_error: string | null
  item_count: number
}
```

Config addition:

```typescript
pipeline_concurrency: number  // default: 4, range: 1–13
```

## API Changes

| Endpoint | Change |
|----------|--------|
| `POST /api/fetch` | Add `mode` body param (default: `'fetch_summarize'`) |
| `GET /api/fetch/status` | Returns updated `PipelineStatus` with two-stage progress |

Separate `/api/summary/trigger` and `/api/summary/status` become redundant but kept for backwards compat. Status page only polls `/api/fetch/status`.

## Customizable Summary Prompts

### Per-Sensor Prompts

Each sensor gets a specialized system prompt that extracts information tailored for the final structured briefing. Per-sensor prompts instruct the LLM to categorize and tag information relevant to the overall summary's sections.

| Sensor | Category Focus | Extraction Emphasis |
|--------|---------------|-------------------|
| `hacker_news` | Tech Trends | Product launches vs. incremental updates; community sentiment; founder/researcher appearances |
| `arxiv` | Research | Technique names, benchmarks, institutional affiliations; industry-backed papers |
| `github` | Open Source | New vs. trending repos; star velocity; corporate-backed vs. indie |
| `product_hunt` | Products | Full launches only (skip minor updates); pricing; team; AI-relevance |
| `social_accounts` | KOL Opinions | Facts vs. opinions; speaker role (founder/researcher/investor/dev); claims and predictions |
| `social_topics` | Trends | Emerging narratives; cross-reference events; sentiment |
| `social_trends` | Viral Content | Why trending; factual basis; market impact |
| `sources_36kr` | Startup/VC | Funding amounts, valuations, investors; company stage; sector |
| `wallstreetcn` | Markets | AI sector financial news; market-moving events; regulatory; cross-border |
| `hn_blogs` | Deep Analysis | Core thesis; author credibility; contrarian vs. consensus |
| `rss_feeds` | General | Adapt to content — extract facts, opinions, notable claims |
| `chrome_radar` | Tools | New browser extensions/tools; developer utility |
| `v2ex` | Community | Chinese tech discussions; developer sentiment |

### Overall Summary Prompt

The overall prompt synthesizes per-sensor summaries into a structured info aggregation for an AI industry VC professional:

```
一、速览 — 3-5 most important items (major launches, breaking news, high-impact VC moves)
二、AI 产品动态 — Official AI company announcements, developer previews, product launches
三、行业声音 — Entrepreneur/practitioner statements, opinions, predictions (with sources)
四、投资动向 — VC activity, funding rounds, investment theses, valuations
五、投融资分析 — Narrative trends, valuation shifts, global AI startup funding, risk alerts
```

### Config Storage

```typescript
// Per-sensor prompt overrides (keyed by sensor name)
summary_sensor_prompts: Record<string, string>

// Overall summary prompt
summary_overall_prompt: string
```

Default values are optimized prompts. Users can override any via the AI Summary settings page. Each sensor shows "Default" or "Custom" badge and a "Reset to default" action.

## What Stays the Same

- SQLite KV storage (same keys, same TTLs)
- Polling interval (3s)
- `IntelReport` and `BriefingSummary` structures
- Config API (adds `pipeline_concurrency`, `summary_sensor_prompts`, `summary_overall_prompt`)
- Individual sensor implementations (unchanged)
