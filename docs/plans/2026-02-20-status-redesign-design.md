# Status Page Redesign — Design Document

## Problem

The current Status page is cluttered, duplicates information across sections, and is confusing during pipeline runs. It has 5 distinct visual sections (hero banner, overall summary bar, 3 stat cards, 8 section cards in a 2-column grid, and a separate console) that overlap in purpose and compete for attention.

## Design Principles

1. **No duplication** — every piece of information appears in exactly one place
2. **Clear feature boundaries** — each zone has a single responsibility
3. **Minimal + expandable** — high-level by default, detail on demand
4. **Two states** — the page transforms cleanly between idle and running

## Architecture: Three Clean Zones

### Zone 1 — Action Bar

**Responsibility:** System state + run controls.

A slim toolbar (~56px) at the top of the content area.

**Idle state:**
- Left: health dot (green/amber/red/gray) + label ("Healthy", "Stale", "No Data", "Error") + `· 3h ago` relative timestamp (tooltip shows full ISO datetime)
- Right: mode dropdown (`Fetch + Summarize ▾`) + accent "Run" button

**Running state:**
- Left: pulsing dot + phase label ("Fetching · 7 of 13 sensors" → "Summarizing · 3 of 13" → "Generating briefing...")
- A thin progress bar at the bottom of the bar
- Run button disabled with "Running..." text
- Mode selector hidden during run

### Zone 2 — Sensor Table

**Responsibility:** Per-sensor results and errors.

A flat, single-column list grouped by category with subtle section headers. This is the main content area.

**Idle state:**
- Section headers: small-caps, muted, right-aligned section total
- Sensor rows: status dot | sensor name | (optional error text) | right-aligned item count
- Status dots: `●` green = ok, `⚠` amber = config error/zero items, `✕` red = API error, `○` gray = disabled
- Errors shown inline in muted text between sensor name and count (replaces the Console)
- Disabled sensors show "Off"
- Total items at the bottom right with a subtle divider

**Running state (collapsed, default):**
- Active sensors: pulsing dot + "Fetching..." or "Summarizing..." replacing the count
- Completed sensors: green dot + item count
- Queued sensors: gray dot + dash

**Running state (expanded, click to toggle):**
- Shows two-stage detail beneath the sensor row:
  - `├ Fetch     ● Done · 3 items`
  - `└ Summary   ○ Queued`
- Only expanded rows show this — minimal by default

**No-data state:**
- All gray dots, all dashes

### Zone 3 — Schedule Footer

**Responsibility:** Next scheduled run.

One centered line at the bottom:
```
Next run: 06:00 · in 12h 59m · Asia/Shanghai
```
Live countdown updates. If no schedule configured: `No scheduled run configured`.

## What Gets Deleted

| Current Component | Replaced By |
|-------------------|-------------|
| HeroBanner (health + segmented control + progress + timestamp) | Zone 1 Action Bar |
| Overall Summary bar | Zone 1 running state ("Generating briefing...") |
| StatCards (Last Run, Next Run, Items Fetched) | Last Run → Zone 1. Next Run → Zone 3. Items → Zone 2 total |
| SensorGrid (2-column, 8 section cards) | Zone 2 flat sensor table |
| "0 items total" footer | Zone 2 total row |
| Console (separate error section) | Errors inline in Zone 2 rows |

**Net result:** 5 visual sections → 3 clean zones. Zero information duplication.

## Component Plan

### New/Rewritten Components
- `ActionBar.tsx` — Zone 1 (replaces HeroBanner)
- `SensorTable.tsx` — Zone 2 (replaces SensorGrid + Console)
- `ScheduleFooter.tsx` — Zone 3 (new, extracted from StatCards)

### Kept (modified)
- `Status.tsx` — parent orchestrator, simplified props
- `constants.ts` — sensor definitions and metadata (unchanged)
- `time-helpers.ts` — timeAgo, nextFetchIn (unchanged)

### Deleted
- `HeroBanner.tsx`
- `StatCards.tsx`
- `SensorGrid.tsx`
- `Console.tsx`
- `StageBadge.tsx` (functionality absorbed into SensorTable expandable rows)
