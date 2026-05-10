# LLM Summarization — Design Document

## Goal

Add AI-powered summarization to Info Aggregation: per-sensor summaries rolled into an executive briefing, displayed on the Status page and served via API for external consumption.

## Architecture

Shared summarization module (`lib/summary/`) with two trigger paths:

1. **Automated**: After pipeline fetch completes, if an LLM provider is configured, auto-generate summaries using the configured OpenAI-compatible endpoint.
2. **Manual**: Claude Code skill `/summarize-for-intel-brief` reads the latest report and writes a summary via API.

Both paths produce the same `BriefingSummary` output cached in SQLite KV.

## Data Model

### New Config Fields

```typescript
summary_provider: 'openrouter' | 'custom' | null  // null = disabled
summary_api_key: string | null
summary_base_url: string                           // default: 'https://openrouter.ai/api/v1'
summary_model: string                              // default: 'anthropic/claude-sonnet-4'
```

### BriefingSummary Type

```typescript
interface BriefingSummary {
  generated_at: string           // ISO timestamp
  report_fetched_at: string      // which report was summarized
  sections: {                    // per-sensor summaries
    sensor_name: string
    label: string
    summary: string
    item_count: number
  }[]
  overall: string                // executive briefing
}
```

Cached in SQLite KV as `intel:summary` with same TTL as the report (cache_ttl_hours).

## Components

### LLM Client (`lib/summary/llm.ts`)

Thin OpenAI-compatible chat completion client:
- Takes `{base_url, api_key, model}` from config
- Single function: `chatCompletion(messages[], config) → string`
- Calls `POST {base_url}/chat/completions` with standard OpenAI format
- Works with OpenRouter, Ollama (`http://localhost:11434/v1`), LM Studio, vLLM
- 60s timeout per call

### Summarizer (`lib/summary/summarizer.ts`)

Orchestrator that produces a BriefingSummary:
1. Reads latest cached IntelReport
2. For each sensor with items, builds a prompt and calls LLM → per-sensor summary
3. Builds a final prompt with all per-sensor summaries → overall executive briefing
4. Returns BriefingSummary
5. Calls run sequentially (not parallel) to respect rate limits

### Cache (`lib/summary/cache.ts`)

Read/write BriefingSummary to SQLite KV store (`intel:summary` key).

## API Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/summary` | GET | Returns cached BriefingSummary or `{ summary: null }` |
| `/api/summary` | POST | Accepts BriefingSummary body, writes to cache (used by Claude Code skill) |

## Post-Fetch Hook

In `api/cron/pipeline/route.ts` and `api/fetch/route.ts`:
- After `collect()` succeeds, check if `summary_provider` is configured
- If yes, call summarizer with the fresh report
- Fire-and-forget: pipeline response returns immediately, summarization continues

## Settings Page

New card: "AI Summary" in Settings.tsx with fields:
- Provider dropdown: OpenRouter / Custom / Disabled
- API Key (masked in GET responses)
- Base URL (shown when provider is 'custom')
- Model name

## Status Page Display

New "AI Briefing" card below the existing stat cards:
- Header: "AI Briefing" + timestamp ("generated 2m ago")
- Overall summary as main body text
- Expandable per-sensor summaries (collapsed by default)
- Shows "Summary will be generated after next fetch" if configured but no summary yet
- Card hidden entirely if LLM not configured and no cached summary

Refreshes when Status page detects new data (existing health poll mechanism).

## Claude Code Skill

Skill name: `/summarize-for-intel-brief`
- Reads latest report via `GET /api/intel/latest`
- Claude generates per-sensor + overall summaries
- Writes result via `POST /api/summary`

## LLM Provider Support

- **OpenRouter** (default): `https://openrouter.ai/api/v1` — access to 200+ models
- **Custom**: Any OpenAI-compatible endpoint — Ollama, LM Studio, vLLM, etc.

## Testing

- `lib/summary/llm.test.ts` — request format, error handling, response parsing
- `lib/summary/summarizer.test.ts` — prompt building, empty sensor handling, BriefingSummary shape
- `api/summary/route.test.ts` — GET returns cached/null, POST writes to cache
- Status page — summary card renders/hides correctly
- Config — new fields in defaultConfig(), masked in GET responses
