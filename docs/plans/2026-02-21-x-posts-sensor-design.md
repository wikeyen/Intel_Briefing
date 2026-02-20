# X Posts Sensor via xcancel.com Scraping

## Problem

The existing X/Twitter integration relies on xAI's Grok API, which is expensive for the trivial task of pulling recent posts from a few accounts. We need a free, zero-auth alternative.

## Approach

Scrape public profile pages from xcancel.com (a Nitter instance) using `node-html-parser` (already in the project). No API keys, no whitelisting, no cost.

## Sensor Design

**Key:** `x_posts`
**Category:** `social` | **Language:** `row`
**File:** `frontend/src/lib/sensors/x_posts.ts`

### Data Flow

1. Read `social_accounts_x` from config (list of handles to monitor)
2. For each handle, fetch `https://xcancel.com/<handle>` with a browser User-Agent
3. Parse HTML with `node-html-parser`
4. Extract tweets from `.timeline-item` elements:
   - **Text:** `.tweet-content.media-body` inner text
   - **URL:** `.tweet-link` href → convert to `https://x.com/<user>/status/<id>`
   - **Date:** `.tweet-date a[title]` → e.g. `"Feb 20, 2026 · 10:33 AM UTC"`
   - **Engagement:** `.tweet-stats` → comments, retweets, likes, views
   - **Retweet detection:** `.retweet-header` presence → skip retweets
   - **Author:** `.fullname` + `.username`
5. Filter by `sensor_lookback_hours['x_posts']` (falls back to default)
6. Deduplicate by status ID across accounts
7. Return as `IntelItem[]`

### IntelItem Mapping

| Field        | Value                                        |
|-------------|----------------------------------------------|
| `id`        | `x-<status_id>`                              |
| `source`    | `x_posts`                                    |
| `title`     | Tweet text (first 280 chars)                 |
| `url`       | `https://x.com/<user>/status/<id>`           |
| `heat`      | `"1.2K likes · 234 retweets"`                |
| `account`   | Display name                                 |
| `handle`    | `@username`                                  |
| `published_at` | ISO timestamp parsed from title attribute |

### Config Changes

- **Reuse:** `social_accounts_x` (already exists — list of X handles)
- **Reuse:** `sensor_lookback_hours['x_posts']` for time filtering
- **Remove entirely:** `xai_api_key`, `xai_base_url`, `xai_model` from `ConfigSettings`, `defaultConfig()`, config UI, Connections page, and YAML defaults
- **Remove Grok platform:** delete `frontend/src/lib/platforms/x.ts` and its tests
- **Remove X from social sensors:** strip Grok/X paths from `social_accounts`, `social_topics`, `social_trends` (Bluesky + Mastodon remain)

### Integration Points

- Register `fetchXPosts` in `SENSOR_REGISTRY` (`sensors/index.ts`)
- Add `x_posts` to `SENSORS` array in `taxonomy.ts`
- Add `x_posts: true` to default `sensors_enabled`
- Remove xAI key field from `ApiKeys.tsx` KEY_FIELDS
- Remove xAI Model + xAI Base URL inputs from `ApiKeys.tsx`
- Remove `x_posts` from `SOURCE_URLS` if needed, or add xcancel fallback

### Error Handling

- Missing `social_accounts_x` or empty list → return `[]` (no error)
- xcancel.com returns non-200 → throw API error for that account, continue others
- HTML structure changed (no `.timeline-item`) → return `[]` with warning
- 10s timeout per account fetch
- Concurrent fetching with `Promise.allSettled`

### Risks

- xcancel.com could go down or change HTML structure
- X could block xcancel.com's access
- Rate limiting if monitoring many accounts (mitigated by concurrency limit)
