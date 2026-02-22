# Dashboard V2 — Data Terminal Redesign

**Date:** 2026-02-22
**Status:** Approved
**Scope:** Desktop + mobile

## Goal

Transform the dashboard from a narrow single-column layout into a fluid, dense data terminal (Grafana/Datadog-style tile grid) that fills the screen and surfaces all available intelligence data.

## Architecture

Fluid CSS Grid layout with responsive breakpoints. No maxWidth cap. Zero new dependencies — hand-rolled SVG, CSS Grid, Framer Motion (already installed). Two new widgets (StatusTicker, RiskIntelPanel), one major layout restructure.

---

## 1. Layout

| Viewport | Grid | Behavior |
|----------|------|----------|
| ≤768px (mobile) | 1 column | Stacked, tighter padding |
| 769–1399px | 3 columns | Standard desktop |
| 1400px+ | 4 columns | Ultrawide/4K |

- Gap: `0.75rem`
- Padding: `1.25rem` (no centering, no maxWidth)
- Widgets span 1–N columns via `gridColumn: 'span N'`

### Grid Map (3-col)

```
┌─────────────────────────────────┐
│  Status Ticker (full)           │
├──────────┬──────────┬──────────┤
│  Items   │ Sources  │Sentiment%│
│          │          │  Mood    │
├──────────┴──────────┼──────────┤
│  Exec Summary (×2)  │ Risk &   │
│                     │ Intel    │
├──────────┬──────────┤ Panel    │
│Sentiment │ Category │          │
│ Ring     │ Distrib  │          │
├──────────┼──────────┼──────────┤
│ Trending │ Heatmap (×2)        │
├──────────┴──────────┴──────────┤
│  Section Summaries (full)       │
├──────────┬──────────┬──────────┤
│Src Health│          │          │
└──────────┴──────────┴──────────┘
```

### Grid Map (4-col, 1400px+)

```
┌────────┬────────┬────────┬────────┐
│  Status Ticker (full)              │
├────────┼────────┼────────┼────────┤
│ Items  │Sources │Sentmnt%│ Mood   │
├────────┴────────┼────────┼────────┤
│ Exec Summary    │ Risk & │Category│
│ (×2)            │ Intel  │Distrib │
├────────┬────────┤ Panel  ├────────┤
│Sentmnt │Trending│        │Heatmap │
│Ring+Bar│        │        │(×1)    │
├────────┴────────┴────────┴────────┤
│  Heatmap (full, if not in col)    │
├────────┴────────┴────────┴────────┤
│  Section Summaries (full)          │
├────────┬────────┬────────┬────────┤
│SrcHlth│        │        │        │
└────────┴────────┴────────┴────────┘
```

## 2. Widgets (10 total)

### Widget 0: Status Ticker Bar (NEW)

Full-width dense strip above the grid. Single row showing:
- Pipeline state indicator (idle/running with pulsing dot)
- Last fetch timestamp (monospace, relative e.g. "2h ago")
- Source health summary ("14/16 ok")
- Mood indicator (colored dot + word)
- Risk flag count (red badge, only if > 0)

Style: `var(--surface-alt)` background, compact padding `0.5rem 1.25rem`, monospace values.

### Widget 1: Stats Strip (EXISTING, layout change only)

4 hero metric cells spanning full width. Same content as current:
- Items count, Sources count, Positive %, Mood
- Monospace numbers, motion.div for value changes

No content changes — just moves into the grid as a full-span row.

### Widget 2: Executive Summary (EXISTING, span change)

Spans 2 columns (3-col grid) or 2 columns (4-col grid). Same accent-wash design with quick scan bullets. No content changes.

### Widget 3: Risk & Intel Panel (NEW)

Replaces the single conditional RiskAlertWidget. Always visible. Contains three tabs:

- **Risk** tab — All `sentiment.risk_flags[]` entries with topic + analysis + red severity dot
- **Controversies** tab — All `sentiment.controversies[]` entries with topic + analysis
- **Shifts** tab — All `sentiment.opinion_shifts[]` entries with topic + analysis

Tab header shows count per tab. Active tab has accent underline. If a tab's array is empty, shows "None detected" in muted text.

When all three arrays are empty, the entire widget shows a compact "No alerts" state.

Style: Same card chrome. Tab buttons are text-only, compact. Active tab gets `borderBottom: 2px solid var(--accent)`.

### Widget 4: Sentiment Panel (EXISTING, no changes)

Ring gauge + mood summary + per-platform bars. No changes needed.

### Widget 5: Category Distribution (EXISTING, no changes)

Segmented bar + 2×2 legend. No changes needed.

### Widget 6: Trending (EXISTING, minor)

Same ranked list. Show top 8 items instead of 6 since the card can be taller in the grid.

### Widget 7: Source Activity Heatmap (EXISTING, span 2)

Same 24-column CSS grid heatmap. Spans 2 columns for more room. Show top 8 sources instead of 6.

### Widget 8: Section Summaries (EXISTING, full span)

Same collapsible accordion. Full width span.

### Widget 9: Source Health (EXISTING, no changes)

Same dot grid. No changes needed.

## 3. Mobile (≤768px)

- Single column, everything stacks
- Status ticker becomes compact (hides some items, shows just pipeline state + last fetch)
- Heatmap scrolls horizontally
- Stats strip stays 4-col but tighter padding (existing CSS handles this)

## 4. Visual Constants

- Card border-radius: 12px
- Card shadow: `var(--shadow-xs)`
- Card border: `1px solid var(--border)`
- Card bg: `var(--surface)`
- Card padding: `1rem 1.25rem`
- Section labels: uppercase monospace `0.5625rem`, `var(--ink-faint)`
- Numbers: `ui-monospace, monospace`
- Stagger animation: 60ms delay per widget (slightly faster than current 80ms)

## 5. Files to Change

| File | Changes |
|------|---------|
| `globals.css` | Add `.dashboard-grid` with responsive grid-template-columns, remove old maxWidth/padding overrides |
| `Dashboard.tsx` | Grid layout wrapper, StatusTicker component, RiskIntelPanel component (tabbed), remove old RiskAlertWidget, adjust widget spans |

## 6. No New Dependencies

Everything achievable with CSS Grid + existing Framer Motion + hand-rolled components.
