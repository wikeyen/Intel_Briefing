# X Scraper Provider Selection — Design

## Overview

Add a user-selectable setting to choose which X (Twitter) scraper runs as the primary provider (`twitter-scraper` vs `apify`), with automatic fallback to the other on authentication errors.

## Approach: Strategy Pattern in the Sensor

All changes are contained within the X sensor domain. The pipeline and sensor registry stay untouched.

## Changes

### 1. Config Model (`models.ts`)

- Add `x_scraper_provider: 'twitter-scraper' | 'apify'` (default: `'twitter-scraper'`)
- Add `apify_token: string | null` (default: `null`)

### 2. Config System (`config/index.ts`)

- Add `'apify_token'` to `KEY_FIELDS` for masking
- Add `APIFY_TOKEN` env var override in `applyEnvOverrides`

### 3. Credentials UI (`ApiKeys.tsx`)

- Add `apify_token` to the "Data Sources" group

### 4. Sensor (`x_posts.ts`)

- Add `fetchViaApify()` — calls `apify/twitter-scraper` actor per handle via `apify-client`, maps results to `IntelItem[]`
- Modify `fetchXPosts()`:
  1. Pick primary strategy based on `config.x_scraper_provider`
  2. Try primary
  3. On auth error, try fallback (if fallback credentials exist)
  4. Report which provider was used in `onProgress`

### 5. Sources UI (`Sensors.tsx`)

- Add a provider selector dropdown in the X sub-config section (below accounts)
- Two options: "Twitter Scraper" (default) and "Apify"
- Wire to auto-save via `x_scraper_provider` config field

## Fallback Behaviour

- Triggers only on authentication errors (missing credentials, expired tokens, auth rejection)
- Transient errors (rate limits, network timeouts) do NOT trigger fallback
- Fallback only attempted if the alternate provider has credentials configured
- Progress messages indicate which provider is active

## Data Mapping (Apify → IntelItem)

| Apify Field       | IntelItem Field |
|--------------------|----------------|
| `id`               | `x-{id}`       |
| `full_text`/`text` | `title`        |
| `url`              | `url`          |
| `favorite_count`   | `heat` (likes) |
| `retweet_count`    | `heat` (RTs)   |
| `views_count`      | `heat` (views) |
| `user.name`        | `account`      |
| `user.screen_name` | `handle`       |
| `created_at`       | `published_at` |
