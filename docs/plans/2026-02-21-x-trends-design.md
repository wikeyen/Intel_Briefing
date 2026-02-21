# X/Twitter Trends via Apify — Design

## Goal

Add X/Twitter worldwide trends to the existing `social_trends` sensor using an Apify actor. No new sensor — folds into the same `Promise.allSettled` pattern alongside Bluesky and Mastodon trends.

## Actor

`eunit/x-twitter-trends-scraper` — $0.0005/trend, returns trend name, tweet volume, rank, and URL. Single call for worldwide yields ~50 trends.

## Data Mapping

Each trend maps to an `IntelItem`:

| Field | Value |
|-------|-------|
| `id` | `x-trend-{normalized-name}` |
| `source` | `'x'` |
| `title` | Trend name/hashtag |
| `url` | `https://x.com/search?q={encodedTrend}` |
| `heat` | Tweet volume (e.g. "125K posts") |
| `account` | `null` |

## Gating

Uses existing `config.apify_token`. If not set, returns `[]` silently (same as Bluesky without credentials). No new config fields needed.

## Error Handling

Same `Promise.allSettled` pattern — X trends failing doesn't block Bluesky/Mastodon. Sensor only throws if ALL platforms return zero items and all errored.

## Files

- `frontend/src/lib/sensors/social_trends.ts` — add `fetchXTrends()`, update `fetchSocialTrends()`
- `frontend/src/lib/sensors/social.test.ts` — X trends test cases
