# Overview Tab Redesign — Design

## Problem

The Overview tab is not the default landing tab (first group tab is auto-selected), and its content is a bare wall of text (executive summary + risk flags) with no visual structure or analytics. It doesn't feel like a command center landing page.

## Design

### Default Tab Behavior

Make Overview the default tab on load. When groups load and Overview is available (`summary?.overall?.executive_summary` exists), auto-select `OVERVIEW_TAB_ID`. If no summary exists, fall back to first group tab.

### Layout (top to bottom)

```
┌─────────────────────────────────────────────────┐
│ AGGREGATE ANALYTICS STRIP                        │
│ [Sentiment Ring] [Top Sources] [24h Activity]    │
├─────────────────────────────────────────────────┤
│ EXECUTIVE SUMMARY (hero card)                    │
│ Mood badge · Cleaned text with [N] → links       │
├─────────────────────────────────────────────────┤
│ RISK FLAGS (collapsible section)                 │
│ ⚠ Risk 1 · ⚠ Risk 2 · ⚠ Risk 3                │
├─────────────────────────────────────────────────┤
│ GROUP SNAPSHOTS (responsive grid)                │
│ [News ▪] [Product ▪] [Trending ▪]               │
│ [Opinions ▪] [Topics ▪] [Research ▪]            │
└─────────────────────────────────────────────────┘
```

### 1. Aggregate Analytics Strip

Reuse `VisualDataStrip` with ALL items across all groups. 3 cards: sentiment ring, top sources bar chart, 24h activity timeline. No velocity card at aggregate level (velocity is per-item relative and doesn't aggregate meaningfully).

Data source: flatten all group items into a single array, pass to VisualDataStrip with combined sensorKeys from all groups.

### 2. Executive Summary (Hero Card)

Redesigned card with:
- **Header**: "EXECUTIVE SUMMARY" label + mood badge (bullish/bearish/mixed/neutral)
- **Citation resolution**: Parse `[N]` references in the text, resolve against `summary.overall.sources[]` array (`{ id, title, url }`), render as superscript clickable links. Unresolvable refs stripped silently.
- **Typography**: Better line spacing, paragraph breaks where possible, slightly larger font for readability.
- **Card styling**: Accent-tinted background (existing), improved padding and visual hierarchy.

### 3. Risk Flags (Collapsible)

Same data as current (`summary.overall.sentiment.risk_flags`), but:
- Collapsible section (starts expanded on desktop, collapsed on mobile)
- Better visual treatment: warning icon, topic as heading, analysis as body text
- Consistent card styling with the rest of the page

### 4. Group Snapshot Cards

Responsive grid of mini cards, one per group (skip groups with 0 items). Each card:
- **Group color accent** (left border)
- **Group name** + item count badge
- **Mini sentiment donut** (32px diameter, inline — same logic as SentimentRing but smaller)
- **Top 3 theme tags** from that group's intelligence data (if available)
- **1-line brief** truncated from per-group narrative in the summary
- **Clickable** — entire card switches to that group's tab

Grid: 3 columns desktop, 2 columns tablet, 1 column mobile.

### 5. Mobile Responsive

- Analytics strip: 2-column grid (existing mobile behavior)
- Executive summary: full width, slightly smaller font
- Risk flags: collapsible, starts collapsed on mobile
- Group snapshot cards: single-column stack

## Key Files

- `frontend/src/components/Dashboard.tsx` — default tab selection logic
- `frontend/src/components/dashboard/ExecutiveSummaryCard.tsx` — major redesign
- `frontend/src/components/dashboard/OverviewTab.tsx` — NEW: orchestrates the full Overview layout
- `frontend/src/components/dashboard/GroupSnapshotCard.tsx` — NEW: mini card per group
- `frontend/src/components/dashboard/CitationText.tsx` — NEW: resolves [N] → links
- `frontend/src/components/dashboard/VisualDataStrip.tsx` — reused as-is for aggregate data

## Decisions

- Velocity card excluded from aggregate strip (doesn't aggregate well)
- Citations resolved to clickable links (full sourced version also in AI Summary page)
- Groups with 0 items excluded from snapshot grid
- Risk flags collapsible (collapsed by default on mobile)
