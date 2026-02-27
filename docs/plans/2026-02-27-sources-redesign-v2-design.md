# Sources Page Redesign v2 — Design

## Goal

Restructure the Sources page to separate sensors by concept (not platform), apply soft glassmorphism visual style, and split RSS feeds by type.

## Three Pillars

1. **Sensor key split** — monolithic platform sensors become distinct accounts/topics/trends keys
2. **Group redistribution** — 6 default groups reflecting data type, not platform origin
3. **Visual polish** — soft glassmorphism across the entire Sources page

---

## 1. New Sensor Keys

### Social Platform Split

| Old Key | New Keys | Fetch Function |
|---|---|---|
| `x` | `x_accounts` | `fetchXPosts()` |
| `bluesky` | `bluesky_accounts` | `fetchSocialAccounts(config, limit, 'bluesky')` |
| `bluesky` | `bluesky_topics` | `fetchSocialTopics(config, limit, 'bluesky')` |
| `mastodon` | `mastodon_accounts` | `fetchSocialAccounts(config, limit, 'mastodon')` |
| `mastodon` | `mastodon_topics` | `fetchSocialTopics(config, limit, 'mastodon')` |
| `mastodon_trends` | `mastodon_trends` | *(unchanged)* |

`x_topics` registered as stub for future implementation.

### RSS Split

| Old Key | New Key | Filter |
|---|---|---|
| `rss_feeds` | `rss_blogs` | `['blog', 'other']` types |
| `rss_news` | `rss_news` | *(unchanged)* |

### Migration

- DB migration maps old `source_group_members` entries to new keys
- Old keys removed from registry
- `sensors_enabled` migrated accordingly

### Taxonomy

| Key | Label | Category | Language |
|---|---|---|---|
| `x_accounts` | X Accounts | `social` | `row` |
| `bluesky_accounts` | Bluesky Accounts | `social` | `row` |
| `bluesky_topics` | Bluesky Topics | `social` | `row` |
| `mastodon_accounts` | Mastodon Accounts | `social` | `row` |
| `mastodon_topics` | Mastodon Topics | `social` | `row` |
| `rss_blogs` | RSS Blogs | `feeds` | `row` |

---

## 2. Default Groups (6 total)

| Group | Color | Processing | Sensors |
|---|---|---|---|
| Research & Reports | `#1A7A6D` | `research` | `arxiv` |
| News | `#2E7D9A` | `news` | `hacker_news`, `product_hunt`, `sources_36kr`, `wallstreetcn`, `rss_news`, `github` |
| Trending | `#C4851C` | `trend` | CN trend sensors + `mastodon_trends` |
| Opinions | `#8B5CF6` | `opinion` | `hn_blogs`, `rss_blogs` |
| Voices | `#E05A8D` | `social` | `x_accounts`, `bluesky_accounts`, `mastodon_accounts` |
| Topics | `#3B82F6` | `topic` | `bluesky_topics`, `mastodon_topics` |

Inline controls follow the sensor (Approach A).

---

## 3. Visual — Soft Glassmorphism

- Cards: `rgba(255,255,255,0.6)` + `backdrop-filter: blur(12px)`, 16px radius
- Headers: group color at 8% opacity, larger name, frosted badges
- Rows: softer separators, hover states, more padding
- Dark mode: flipped glass values via CSS custom properties
- Mobile: solid fallback for reduced-motion preference
