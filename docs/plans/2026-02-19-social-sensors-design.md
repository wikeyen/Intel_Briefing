# Design: Multi-Platform Social Sensors

## Overview

Replace the existing platform-specific social sensors (grok, politics, topics) with three **function-oriented, multi-platform sensors** that pull from X, Bluesky, and Mastodon. Organize under a single "social" section.

## Architecture

```
social (section on Data page)
├── accounts (sensor) — posts from specific people you watch
│   ├── X (via Grok API)
│   ├── Bluesky (via AT Protocol API)
│   └── Mastodon (via REST API)
├── topics (sensor) — posts matching keywords/hashtags
│   ├── X (via Grok API)
│   ├── Bluesky (via search API)
│   └── Mastodon (via hashtag API)
└── trends (sensor) — what's hot right now
    ├── X (via Grok API)
    ├── Bluesky (via popular/trending)
    └── Mastodon (via trending API)
```

Each sensor queries all configured platforms internally and tags every item with its platform source (e.g., `source: 'x'`, `source: 'bluesky'`, `source: 'mastodon'`). The Data page source filter lets you slice by platform within any sub-category.

## Sensors

### 1. `accounts` (replaces `politics` / `x_accounts`)

Monitor specific accounts across platforms.

**X (via Grok):** Same approach as the existing politics sensor — prompts Grok to fetch recent posts from a configured list of X handles.

**Bluesky:** Use `@atproto/api` to fetch posts from specific users via `app.bsky.feed.getAuthorFeed({ actor })`. Requires the user's Bluesky handle + app password for auth. Configured accounts list in settings.

**Mastodon:** Use `GET /api/v1/accounts/:id/statuses` to fetch posts from specific users. Requires OAuth token. Configured accounts list in settings (as `@user@instance` handles).

**Config:**
- `social_accounts_x`: string[] — X handles to monitor (renamed from `politics_accounts`)
- `social_accounts_bluesky`: string[] — Bluesky handles to monitor
- `social_accounts_mastodon`: string[] — Mastodon handles to monitor

### 2. `topics` (replaces existing `topics`)

Monitor keywords and hashtags across platforms.

**X (via Grok):** Same approach as the existing topics sensor — prompts Grok to search for posts matching configured keywords/hashtags.

**Bluesky:** Use `app.bsky.feed.searchPosts({ q })` to search for keyword matches.

**Mastodon:** Use `GET /api/v1/timelines/tag/:hashtag` for hashtag monitoring (no auth needed for public hashtags).

**Config:**
- `social_topics_keywords`: string[] — keywords/hashtags to monitor (renamed from `topics_keywords`)

### 3. `trends` (replaces `grok`)

Surface trending content across platforms.

**X (via Grok):** Same approach as the existing grok sensor — prompts Grok for trending tech discussions, product launches, AI breakthroughs.

**Bluesky:** Aggregate popular posts from timeline or use the `app.bsky.unspecced.getPopularFeedGenerators` or similar trending endpoints if available; fallback to sorting timeline by engagement.

**Mastodon:** Use `GET /api/v1/trends/statuses` to get trending posts on mastodon.social (no auth needed).

## Sensors Removed

These individual sensors are absorbed into the multi-platform sensors above:

| Old sensor | Old file | Absorbed into |
|------------|----------|---------------|
| `politics` | `sensors/politics.ts` | `accounts` |
| `topics` | `sensors/topics.ts` | `accounts` / `topics` |
| `grok` | `sensors/grok.ts` | `trends` |

The old files are deleted and replaced by:
- `sensors/social_accounts.ts`
- `sensors/social_topics.ts`
- `sensors/social_trends.ts`

## Platform Adapters

Each platform's API logic lives in a shared helper module to avoid duplication across the 3 sensors:

**`lib/platforms/x.ts`** — Grok API wrapper (chat completion with JSON parsing)
**`lib/platforms/bluesky.ts`** — AT Protocol agent creation, auth, timeline/search/author-feed helpers
**`lib/platforms/mastodon.ts`** — REST fetch helpers for timelines, hashtags, trending, account statuses

## IntelItem Mapping

All social items use the same IntelItem fields:

| Field | Value |
|-------|-------|
| `id` | `{platform}-{sensor}-{unique_id}` e.g., `x-accounts-2026-02-19-0` |
| `source` | Platform: `'x'`, `'bluesky'`, or `'mastodon'` |
| `title` | Post text |
| `url` | Link to original post |
| `heat` | Engagement string: `"12 likes · 3 reposts"` |
| `published_at` | ISO date |
| `account` | Author display name |
| `handle` | `@handle` |

## Config Changes

### New fields in ConfigSettings

```typescript
// Platform credentials
bluesky_handle: string | null
bluesky_app_password: string | null
mastodon_token: string | null
// xai_api_key already exists

// Accounts sensor config
social_accounts_x: string[]        // X handles to monitor (replaces politics_accounts)
social_accounts_bluesky: string[]  // Bluesky handles to monitor
social_accounts_mastodon: string[] // Mastodon handles to monitor

// Topics sensor config (replaces topics_keywords)
social_topics_keywords: string[]
```

### Removed fields

```typescript
politics_accounts: string[]  // → social_accounts_x
topics_keywords: string[]    // → social_topics_keywords
```

### SENSOR_TOKEN_FIELD updates

```typescript
// Remove
politics: 'xai_api_key'
topics: 'xai_api_key'
grok: 'xai_api_key'

// Add (each sensor needs at least one platform configured)
social_accounts: 'xai_api_key'   // or bluesky/mastodon token
social_topics: 'xai_api_key'     // or bluesky/mastodon token
social_trends: 'xai_api_key'     // or bluesky/mastodon token
```

## Section Map

```typescript
// Remove
grok: 'tech_trends'
politics: 'politics'
topics: 'topics'

// Add
social_accounts: 'social'
social_topics: 'social'
social_trends: 'social'
```

## UI Changes

### Data page
- New "Social" section tab
- Remove "Politics" and "Topics" section tabs
- Source filter shows platform names: X, Bluesky, Mastodon

### Settings page
- New "Social Platforms" credential section: Bluesky handle/password, Mastodon token
- xAI API key stays where it is (shared with other Grok usage)

### Sensors config page
- 3 new sensor rows: Accounts, Topics, Trends
- Accounts row: configure watch lists per platform
- Topics row: configure keywords (shared across platforms)
- Remove old politics/topics/grok rows

### Console page
- Error labels update: "Accounts", "Topics", "Trends" (instead of politics/topics/grok)

### Pipeline status
- Sensor names update in status display

## Display

Each social post item shows:
- Platform badge (X / Bluesky / Mastodon)
- Author display name + @handle
- Post text (full content)
- Engagement metrics (likes/reposts or favourites/boosts)
- Link to original post
- Relative timestamp

## Migration

On first load after deployment, config migration should:
1. Copy `politics_accounts` → `social_accounts_x` if non-empty
2. Copy `topics_keywords` → `social_topics_keywords` if non-empty
3. Keep old fields in DB for one release cycle (no data loss)
