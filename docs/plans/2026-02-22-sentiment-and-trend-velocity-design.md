# Sentiment Analysis & Trend Velocity — Design

## Goal

Add per-item sentiment classification to social posts using a local transformer model (Transformers.js), and enrich trend items with velocity data by comparing snapshots across cron runs.

## Approach: Hybrid — Local Classification + LLM Synthesis

Local transformer handles per-item sentiment labeling (fast, free, consistent). The briefing LLM receives aggregated sentiment stats to write grounded narrative analysis. Trend velocity computed from stored snapshots using simple math.

## Data Model Changes

### IntelItem — New Fields

```typescript
sentiment?: {
  label: 'positive' | 'negative' | 'neutral'
  score: number  // confidence 0-1
} | null

velocity?: {
  previousCount: number | null
  currentCount: number
  changePercent: number | null   // +200%, -50%, null if first seen
  firstSeenAt: string | null     // ISO timestamp
  hoursOnTrend: number | null
} | null
```

- `sentiment` — populated for social-source items only (bluesky, mastodon, x)
- `velocity` — populated for trend items only (from social_trends sensor)

### Trend Snapshot Storage (SQLite KV)

- Key: `trends:{platform}:snapshot:{ISO-timestamp}`
- Value: JSON array of `{ name: string, count: number, rank: number }`
- Retention: 30 most recent per platform, pruned on each write
- Each snapshot is ~2-3 KB; 30 snapshots = ~60-90 KB total

## Sentiment Pipeline

### Model

`cardiffnlp/twitter-roberta-base-sentiment-latest` via `@huggingface/transformers`

- ~125 MB model, downloaded once to `.cache/` on first run
- Trained on tweets — handles emoji, slang, hashtags
- 3-class output: positive / negative / neutral with confidence score

### Architecture

Singleton `SentimentClassifier` in `frontend/src/lib/pipeline/sentiment.ts`

### Pipeline Integration

- Runs as post-fetch enrichment in report-builder, after dedup, before keyword filter
- Filters to social-source items only
- Attaches `sentiment` field to each qualifying `IntelItem`

### Briefing Integration

Aggregated sentiment stats injected into the summarizer prompt context.

## Trend Velocity

### Snapshot Lifecycle

1. Each cron run, `social_trends` sensor fetches current trends
2. After fetch, store raw trend list as snapshot with ISO-timestamped key
3. Load up to 30 previous snapshots for the same platform
4. For each current trend, compute velocity
5. Attach `velocity` to each trend `IntelItem`
6. Prune snapshots beyond 30

### UI Display

Velocity badge next to heat stat in ItemCard:
- Growing: green accent
- Declining: red accent
- New: yellow accent

## Files Modified

- `frontend/src/lib/models.ts` — add `sentiment` and `velocity` to IntelItem
- `frontend/src/api/client.ts` — mirror new IntelItem fields
- `frontend/src/lib/pipeline/sentiment.ts` — new file, singleton classifier
- `frontend/src/lib/pipeline/report-builder.ts` — add sentiment enrichment step
- `frontend/src/lib/sensors/social_trends.ts` — snapshot storage + velocity computation
- `frontend/src/lib/db.ts` — snapshot read/write/prune helpers
- `frontend/src/components/data/ItemCard.tsx` — sentiment badge + velocity display
- `frontend/src/lib/summary/summarizer.ts` — inject aggregated sentiment into prompts
- `frontend/package.json` — add `@huggingface/transformers`
