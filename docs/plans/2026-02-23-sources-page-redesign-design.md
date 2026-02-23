# Sources Page Redesign — Design Doc

**Date:** 2026-02-23

## Goal

Reorganize the Sources configuration page from 9+ sub-groups across 2 language buckets (ROW/CN) into 4 flat, foldable sections. Add CN badges inline (same style as Dashboard). Replace RSS chip input with a proper feed list with per-feed category switching.

## 4 Sections

### 1. General (10 sensors)

Simple toggle rows. CN sensors get a badge after the name.

| Sensor | Badge | Config |
|--------|-------|--------|
| Hacker News | — | toggle, items, lookback |
| GitHub Trending | — | toggle, items, lookback |
| ArXiv AI | — | toggle, items, lookback |
| Product Hunt | — | toggle, items, lookback |
| Chrome Radar | — | toggle, items, lookback |
| HN Blogs | — | toggle, items, lookback |
| 36Kr | CN | toggle, items, lookback |
| WallStreetCN | CN | toggle, items, lookback |
| V2EX | CN | toggle, items, lookback |
| Zhihu | CN | toggle, items, lookback |

### 2. Social Accounts (3 sensors)

Account-specific post fetching. Each sensor has a sub-config for adding/removing handles.

| Sensor | Config |
|--------|--------|
| X | toggle, account handles (TagInput), items, lookback |
| Bluesky | toggle, account handles (TagInput), following toggle, items, lookback |
| Mastodon | toggle, account handles (TagInput), following toggle, items, lookback |

### 3. Trend (2 sub-sections)

#### 3a. Trending Platforms

Tick to enable trending content from each platform. Per-platform items count.

| Platform | Badge | Config |
|----------|-------|--------|
| X Trends | — | toggle, items |
| Mastodon Trends | — | toggle, items |
| Weibo | CN | toggle, items |
| Xiaohongshu | CN | toggle, items |

Maps to existing config: `social_trends` sensor (X, Mastodon) + `weibo` + `xiaohongshu` sensors.

#### 3b. Topics

Keyword search across selected platforms.

- **Platform checkboxes**: Bluesky, Mastodon (tick which platforms to search)
- **Keyword input**: text field, press Enter to add
- **Keyword list**: below input, each with × to remove
- **Lookback hours**: shared across topic searches

Maps to existing config: `bluesky_topics_enabled`, `mastodon_topics_enabled`, topic keyword lists.

### 4. RSS (1 master toggle + feed list)

Single RSS toggle. Below it, a feed management UI:

- **Add input**: text field at top, press Enter. Auto-discovery runs on add.
- **Feed list**: newest first. Each row = `[category toggle] [URL] [×]`
  - Category cycles: `news` → `blog` → `other` (or a dropdown)
  - `news` routes to dashboard News section
  - `blog` / `other` routes to dashboard Opinions section
- No separate RSS Feeds / RSS News toggles — one unified sensor, category per feed.

Maps to existing: `ConfigSettings.rss_feed_urls: RssFeedEntry[]` where `RssFeedEntry = { url, type: 'news' | 'blog' | 'other' }`.

## UI Details

### Foldable Sections

- Click section header to expand/collapse
- Header shows: chevron + title + enabled count (e.g. "8 / 10")
- All sections expanded by default
- Fold state is local (useState), not persisted

### CN Badges

Same style as Dashboard:
- **CN**: `background: #c8102e, color: #ffe066` (red + gold)
- Positioned after sensor name, small pill shape
- No "Global" badge — only CN sensors are tagged

### Items & Lookback

Where the source supports it, show:
- **Items per source**: small number input or stepper
- **Lookback hours**: small number input

These use existing config fields: `items_per_source[sensorKey]` and `sensor_lookback_hours[sensorKey]`.

## Data Model Changes

**None.** All config fields already exist:
- `sensors_enabled` — per-sensor toggle
- `rss_feed_urls` — `RssFeedEntry[]` with `{url, type}`
- `social_accounts_x`, `social_accounts_bluesky`, `social_accounts_mastodon` — handle lists
- `bluesky_topics_enabled`, `mastodon_topics_enabled` — topic toggles
- `mastodon_trends_enabled` — trends toggle
- `items_per_source`, `sensor_lookback_hours` — per-sensor config

## Scope

- **In scope**: Sensors.tsx UI reorganization, RSS feed list component, section folding, CN badges
- **Out of scope**: Backend sensor changes, pipeline changes, new sensors, taxonomy.ts changes
- **Files changed**: Primarily `frontend/src/components/Sensors.tsx`, possibly extract section components
