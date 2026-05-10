# RSS Feeds Sensor — Design

## Goal

Allow users to subscribe to arbitrary RSS/Atom feeds and see their items in the Info Aggregation alongside other sensor output.

## Requirements

- User-managed list of feed URLs (add/remove via UI)
- Single `rss_feeds` sensor with its own toggle, per-sensor limit, and lookback window
- Extract title, link, and publish date from each feed item
- Always scrape the full article content from the linked webpage using `@mozilla/readability`
- Feed title auto-detected from XML (no user-supplied labels)

## Architecture

A dedicated `rss_feeds` sensor following the established sensor pattern: `fetchRssFeeds(config, limit) → IntelItem[]`.

### Data Flow

```
User adds feed URLs in UI → saved to config as rss_feed_urls: string[]
                          ↓
Sensor runs → fetch each URL → parse XML (RSS 2.0 / Atom) → extract items
                          ↓
Filter by lookback window → sort by date → truncate to limit
                          ↓
For each item → fetch article URL → extract content with @mozilla/readability + jsdom
                          ↓
Return IntelItem[] with full article content
```

### Config Model

Add to `ConfigSettings`:

| Field | Type | Default |
|-------|------|---------|
| `rss_feed_urls` | `string[]` | `[]` |

No tokens or credentials needed — RSS feeds are public.

### Sensor Implementation

- New file: `frontend/src/lib/sensors/rss_feeds.ts`
- Uses `fast-xml-parser` (already in deps) to parse both RSS 2.0 and Atom feeds
- Fetches all URLs with `Promise.allSettled()` for resilience — individual feed failures don't block others
- Lookback filtering via `sensor_lookback_hours` (default 72h)
- After filtering/limiting, fetches each item's article URL and extracts content using `@mozilla/readability` + `jsdom` (already in deps)
- Content scraping runs concurrently with a concurrency cap to avoid hammering servers
- Registered in `SENSOR_REGISTRY` in `sensors/index.ts`

### Content Extraction

Every RSS item's linked URL is fetched and processed through Mozilla's Readability algorithm:

1. Fetch the article webpage (with timeout)
2. Parse HTML into a DOM using `jsdom`
3. Run `Readability.parse()` to extract the main article content
4. Store the extracted text in `IntelItem.content`
5. If scraping fails (timeout, blocked, non-HTML), fall back to the RSS description/summary field

Dependencies:
- `@mozilla/readability` — new dep to add
- `jsdom` — already in deps (used by tests)

### IntelItem Mapping

| RSS/Atom Field | IntelItem Field |
|---|---|
| `<title>` | `title` |
| `<link>` / `<id>` | `url` |
| `<pubDate>` / `<published>` | `published_at` |
| Readability-extracted article text | `content` (full article, fallback to RSS summary) |
| Feed title | `account` (identifies which feed an item came from) |
| `'rss_feeds'` | `source` |

### UI

- New "RSS" sensor group in `SENSOR_GROUPS` (both Sensors.tsx and Settings.tsx)
- Sensor entry: `{ key: 'rss_feeds', label: 'RSS Feeds', desc: 'Custom RSS/Atom feed subscriptions' }`
- Inline sub-config: TagInput for feed URLs (same pattern as social accounts)
- Added to `SENSOR_LOOKBACK_SUPPORT` with 72h default

### Error Handling

| Condition | Behaviour |
|---|---|
| No feed URLs configured | `SensorConfigError` — sensor shows as unconfigured |
| Individual feed fetch fails | Logged and skipped; other feeds still return |
| Malformed XML | Logged and skipped |
| Article scrape fails | Falls back to RSS description/summary |
| No items within lookback | Empty array (not an error) |

## Approach

Dedicated sensor (Approach 1) — does not touch the existing `hn_blogs` sensor. Some RSS parsing overlap with `hn_blogs.ts` is acceptable to keep concerns cleanly separated and avoid risk to working code.
