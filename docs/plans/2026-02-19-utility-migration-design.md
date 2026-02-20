# Utility Migration Design: Chrome Radar + Link Verifier + Jina Reader + HN Comments

**Goal:** Migrate three Python utilities to TypeScript and enhance the HN sensor with comment fetching.

**Architecture:** Four new/modified modules that plug into the existing collector pipeline. Link verification and content enrichment run as post-processing steps after dedup. Chrome Radar is a new sensor. HN sensor gets parallel fetching and top-level comments.

---

## 1. Link Verifier (`lib/utils/verifier.ts`)

Async function: `verifyLink(url: string, timeout?: number): Promise<boolean>`

- HEAD request, follow redirects, accept 2xx as valid
- Fall back to GET if HEAD rejected
- Timeout default: 5s
- Integration: post-dedup in `collector.ts`, Grok-sourced items only (`grok`, `politics`, `topics`)
- Sets `verified?: boolean | null` on IntelItem (`true` = valid, `false` = bad URL)
- Non-Grok items skip verification (their URLs come from real APIs)

## 2. Jina Reader (`lib/utils/jina-reader.ts`)

Async function: `fetchContent(url: string, maxChars?: number): Promise<string | null>`

- Calls `https://r.jina.ai/{url}` — free, no key needed, 20 req/min
- Returns clean markdown text, truncated to maxChars (default 3000)
- Returns null on error/timeout
- Integration: post-dedup in `collector.ts`, `hn_blogs` items only
- Populates the existing `content` field on IntelItem

## 3. Chrome Radar Sensor (`lib/sensors/chrome_radar.ts`)

New pipeline sensor: `fetchChromeRadar(config: ConfigSettings, limit: number): Promise<IntelItem[]>`

- Scrapes Chrome Web Store categories: workflow + developer_tools
- Filters: >5000 users AND <3.8 rating
- Visits detail pages to extract user count
- Returns IntelItem[] with source `chrome_radar`
- Config: `sensors_enabled.chrome_radar` (default false, opt-in), `sensor_limits.chrome_radar`
- Section mapping: items go to `products`

## 4. HN Sensor Enhancement (`lib/sensors/hacker_news.ts`)

Enhance existing sensor:

- Parallel story fetching via `Promise.allSettled` (was sequential)
- Populate `published_at` from the `time` field (Unix timestamp → ISO string)
- Fetch top 5 `kids` (top-level comments) per story
- Strip HTML from comment text, format into `content` field:
  ```
  Top comments:
  @username1: comment text (truncated ~200 chars)
  @username2: comment text...
  ```

## Model Changes

- Add `verified?: boolean | null` to `IntelItem` in `models.ts`

## Data Page Changes

- Items with `content` show richer preview (use content instead of abstract for 2-line clamp)
- Items with `verified === false` get a subtle warning indicator

## Pipeline Flow (Updated)

```
1. Run all sensors in parallel (including chrome_radar)
2. Dedup within sections
3. Dedup across politics/topics
4. NEW: Verify links (Grok items only) + Enrich content (hn_blogs via Jina) — concurrent
5. Write report to cache
```
