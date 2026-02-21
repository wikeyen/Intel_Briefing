# Social Platform Cards — Design Doc

## Problem

Social source configuration is split confusingly: `x_posts` sensor fetches X/Twitter but handles are configured under `social_accounts`. Four separate sensor toggles (`x_posts`, `social_accounts`, `social_topics`, `social_trends`) obscure the per-platform mental model.

## Solution

Replace the 4 social sensors with 3 platform cards (X, Bluesky, Mastodon), each with its own toggle and nested sub-options. Backend sensors gain a `platform` filter parameter; the pipeline calls them per-platform.

## UI Layout

```
Social
├── X / Twitter       [toggle]
│   ├── Accounts: [@handle, @handle, ...]
│   └── Auth: twitter_auth_token, twitter_ct0
│
├── Bluesky           [toggle]
│   ├── Accounts: [handle.bsky.social, ...]
│   ├── ☑ Include accounts I follow
│   ├── ☑ Topics (shared keyword list)
│   └── ☑ Trends
│
├── Mastodon          [toggle]
│   ├── Accounts: [@user@instance, ...]
│   ├── ☑ Include accounts I follow
│   ├── ☑ Topics (shared keyword list)
│   └── ☑ Trends
│
└── Topic Keywords    [shared config section]
    └── [keyword, #hashtag, ...]
```

Each platform card has Items limit + Lookback pills. Sub-checkboxes only visible when platform toggle is on.

## Config Model Changes

### New sensor keys (in `sensors_enabled`)

- `x` — replaces `x_posts`
- `bluesky` — replaces `social_accounts` for Bluesky
- `mastodon` — replaces `social_accounts` for Mastodon

### New boolean fields

- `bluesky_topics_enabled` — was implicit via `social_topics` toggle
- `bluesky_trends_enabled` — was implicit via `social_trends` toggle
- `mastodon_topics_enabled` — was implicit via `social_topics` toggle
- `mastodon_trends_enabled` — was implicit via `social_trends` toggle

### Removed sensor keys

- `x_posts` → migrated to `x`
- `social_accounts` → split into `bluesky` + `mastodon`
- `social_topics` → per-platform sub-toggles
- `social_trends` → per-platform sub-toggles

### Unchanged

All account lists (`social_accounts_x`, `social_accounts_bluesky`, `social_accounts_mastodon`), auth fields, `social_topics_keywords`, and `social_following_*` toggles remain as-is.

### Migration

`migrateConfig()` maps old → new:
- `x_posts: true` → `x: true`
- `social_accounts: true` → `bluesky: true, mastodon: true`
- `social_topics: true` → `bluesky_topics_enabled: true, mastodon_topics_enabled: true`
- `social_trends: true` → `bluesky_trends_enabled: true, mastodon_trends_enabled: true`

## Backend Sensor Mapping

| UI Toggle | Backend Call | Condition |
|---|---|---|
| `sensors_enabled.x` | `fetchXPosts()` | Platform on |
| `sensors_enabled.bluesky` | `fetchSocialAccounts(platform: 'bluesky')` | Platform on |
| `sensors_enabled.mastodon` | `fetchSocialAccounts(platform: 'mastodon')` | Platform on |
| `bluesky_topics_enabled` | `fetchSocialTopics(platform: 'bluesky')` | Platform on + sub-toggle on |
| `mastodon_topics_enabled` | `fetchSocialTopics(platform: 'mastodon')` | Platform on + sub-toggle on |
| `bluesky_trends_enabled` | `fetchSocialTrends(platform: 'bluesky')` | Platform on + sub-toggle on |
| `mastodon_trends_enabled` | `fetchSocialTrends(platform: 'mastodon')` | Platform on + sub-toggle on |

Sensor functions gain `platform?: 'bluesky' | 'mastodon'` param — when set, skip the other platform.

## Taxonomy & Status

- Social category sensors: `x`, `bluesky`, `mastodon` (replaces 4 old keys)
- Status page: items from sub-modes roll up under platform name
- Status dot: worst state across sub-modes (topics fail + accounts ok → warn)
- Briefing sections: items tagged by platform key

## Post-Implementation

Add these X accounts to `social_accounts_x`:
@sama, @elonmusk, @peterthiel, @geoffreyhinton, @a16z, @deedydas, @vivekramaswami, @alexalbert__, @claudeai, @demishassabis, @DarioAmodei, @bcherny, @foundersfund, @sequoia, @benchmark, @Mayhem4Markets, @michaeljburry, @Thom_Wolf, @balajis, @alex_prompter, @AmandaAskell, @ShunyuYao14, @dwarkesh_sp, @SawyerMerritt, @gdb, @heyshrutimishra
