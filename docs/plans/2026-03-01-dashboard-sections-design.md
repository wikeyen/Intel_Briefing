# Dashboard Sections Redesign

**Date**: 2026-03-01
**Status**: Approved

## Summary

Replace the current groups-based dashboard with a tab-driven sectioned view. Seven sections (News, Research & Reports, Trending, Opinions, Voices, Topics, Product) map to existing DB groups plus a new Product group. Each tab provides rich content: AI intelligence panel, visual data charts, interactive filters, and detailed item cards with a slide-out detail panel.

## Architecture

**Approach**: Single page at `/dashboard` with tab-based navigation. No route changes — tabs switch content in-place. Sidebar refreshed with section nav + pipeline controls.

**Data sources** (unchanged):
- `/api/intel/latest` — Raw items by sensor
- `/api/summary` — LLM briefing with per-group summaries
- `/api/intelligence` — NLP analysis (trends, topics, accounts)
- `/api/groups` — Group definitions with sensor memberships

## Section Mapping (from DB groups)

| Section | Color | Sensors | Analysis Flags |
|---------|-------|---------|----------------|
| News | #2E7D9A | hacker_news, sources_36kr, wallstreetcn, rss_news, github | — |
| Research & Reports | #1A7A6D | arxiv | — |
| Trending | #C4851C | v2ex, zhihu, weibo, xiaohongshu, baidu_tieba, douyin, toutiao, netease, 36kr_trending, juejin, baidu, mastodon_trends | trend_enabled |
| Opinions | #8B5CF6 | hn_blogs, rss_blogs | — |
| Voices | #E05A8D | x_accounts, bluesky_accounts, mastodon_accounts | social_enabled, sentiment_enabled |
| Topics | #3B82F6 | bluesky_topics, mastodon_topics | topic_enabled |
| Product | #F59E0B (new) | product_hunt, chrome_radar (moved from News) | — |

## Layout

```
┌──────┬──────────────────────────────────────────┐
│      │  [Tab Bar — 7 section tabs]               │
│  S   ├───────────────────────────────────────────┤
│  I   │  Section Intelligence Panel               │
│  D   │  (AI summary, themes, shifts, risks)      │
│  E   ├───────────────────────────────────────────┤
│  B   │  Visual Data Strip                        │
│  A   │  (sentiment ring, source bars, activity,  │
│  R   │   velocity indicators)                    │
│      ├───────────────────────────────────────────┤
│      │  Filter Bar (source, sentiment, time, 🔍) │
│      ├───────────────────────────────────────────┤
│      │  Rich Item Cards (2-col grid)             │
│      │  Click → Detail Panel (right slide-out)   │
└──────┴───────────────────────────────────────────┘
```

## Components

### Tab Bar
- Horizontal pills with group category color underline
- Active tab: 3px bottom border in group color + color-wash background
- Item count badge per tab
- Freshness pulse dot (green <1h, amber <4h, red >4h)
- Mobile: horizontally scrollable strip

### Section Intelligence Panel
- 2-3 sentence AI narrative from group's briefing section
- Key Themes tag cloud (from intelligence report topics)
- Notable Shifts (velocity changes: rising/falling/new)
- Risk Flags (from risk analysis if relevant)
- Cross-references (items overlapping other groups)
- Collapsible with smooth max-height animation

### Visual Data Strip
4 compact inline-SVG chart cards (120px tall):
1. **Sentiment Ring** — Donut chart (positive/neutral/negative)
2. **Source Distribution** — Horizontal bars per sensor
3. **Activity Timeline** — Sparkline of publication times (24h)
4. **Velocity Indicators** — Trending up/down/new counts

### Filter Bar
Sticky below tab bar. Per-tab filter state preserved across tab switches.
- Source dropdown (checkboxes per sensor in group)
- Sentiment filter (positive/neutral/negative/all)
- Time range (6h/12h/24h/48h/all)
- Keyword search
- Active filter chips (dismissible)

### Rich Item Cards
2-column responsive grid (1-col on mobile):
- Title (bold, 2-line max with ellipsis)
- Excerpt (2-3 lines, expandable)
- Velocity badge (% change with arrow)
- Source + relative time
- Sentiment chip (color dot + label)
- Engagement metrics (points, comments where available)
- Left border: 3px in group category color
- Hover: shadow-card → shadow-card-hover lift
- Default sort: signal score (velocity + recency + sentiment)
- Sort options: Newest, Most Discussed, Highest Velocity

### Item Detail Panel (Right Sidebar)
Slides from right (~400px desktop, full-width mobile):
- Header: title, source, time, sentiment, engagement, "Open ↗" link
- Full Content: complete item text (scrollable)
- AI Analysis: entities, sentiment detail, relevance assessment
- Velocity Chart: sparkline of item's signal trajectory
- Related Items: other items sharing entities/topics
- Cross-Section: which other tabs contain this item
- Raw Source: collapsible debug view of raw data
- Animation: translateX 250ms ease, backdrop dim

### Sidebar (Refreshed)
Stripped down from widget-heavy to functional nav:
1. Brand header + pipeline health dot + last fetch time
2. Section Nav (7 items mirroring tabs, with item counts)
3. Pipeline Controls (last run, next scheduled, "Run Now" button)
4. Quick Stats (total items, overall sentiment, trending count)
5. Config links at bottom (Sources, Settings, Status)

## Responsive Breakpoints

- **<768px**: Hamburger sidebar, scrollable tabs, 1-col cards, full-screen detail panel
- **768-1080px**: Icon-only sidebar, visible tabs, 2-col cards, 70% width detail panel
- **>1080px**: Full sidebar + main content, 2-col cards, right sidebar detail panel
- All touch targets ≥44px, env(safe-area-inset-*), 100dvh

## Design Language
Preserves existing soft UI: warm sand neutrals, teal accent (#1A7A6D), Inter font, soft diffused shadows, monospace uppercase labels, color-wash backgrounds, micro-interactions (hover lift, pulse dots, smooth transitions).
