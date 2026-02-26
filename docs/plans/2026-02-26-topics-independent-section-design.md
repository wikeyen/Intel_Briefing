# Topics as Independent Section

## Problem

Topics (social keyword search) is currently embedded inside the Trend section on the Sources page. This is conceptually wrong — Trend is for trending platform data, Topics is keyword-based search across Bluesky/Mastodon. They should be separate.

## Design

Add a 5th section to both Sources and Status pages: **General, Social, Trend, Topics, RSS**.

### Sources page

- Extract Topics UI (toggle, platform checkboxes, keyword list + input) from Trend `FoldableSection` into its own `FoldableSection`
- Trend section keeps only: Mastodon Trends toggle + trending platform sensors (Weibo, Xiaohongshu, etc.)
- Trend counter no longer includes topics in enabled/total count

### Status page

- Add Topics section between Trend and RSS
- Group by keyword (not by platform):
  ```
  TOPICS
    AI
      bluesky: ok (12 items)
      mastodon: running
    Rust
      bluesky: ok (8 items)
      mastodon: ok (5 items)
  ```
- Progress data comes from existing `sub_items` on bluesky/mastodon sensor progress

### Files

1. `sources/sections.ts` — add `'topics'` to `SourceSection` union + `SOURCE_SECTIONS`
2. `Sensors.tsx` — extract Topics UI into own `FoldableSection`
3. `status/constants.ts` — add Topics to `STATUS_SECTIONS`
4. `status/SensorGrid.tsx` — render Topics section with keyword-grouped progress
5. i18n (`en.ts`, `zh.ts`) — add `sources.section_topics`

### No backend changes

The `sub_items` progress data already exists from the previous feature. This is purely UI reorganization.
