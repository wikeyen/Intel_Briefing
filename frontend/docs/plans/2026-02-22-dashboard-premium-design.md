# Dashboard Premium Redesign — Design Document

**Date:** 2026-02-22
**Status:** Approved
**Scope:** Both mobile and desktop/web UI

## Goal

Transform the Intel Briefing dashboard into a $1M Bloomberg Terminal-inspired experience with infographics, animations, and data-rich visualizations — for both mobile (deep reading) and desktop (dense data).

## Architecture

Pure CSS + hand-rolled SVG charts + Framer Motion (already installed). No new dependencies. The existing inline styles + CSS custom properties system stays. Dark mode works automatically via `prefers-color-scheme`.

---

## 1. Tech Stack Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Charting | Hand-rolled SVG | 3 simple chart types; Recharts adds 330KB for no value |
| Animation | Framer Motion (already installed v12.34.3) | Extend existing usage from ItemCard to dashboard widgets |
| CSS approach | Keep inline styles + CSS vars | Tailwind would fight the existing dark mode system |
| Component library | Stay headless | Existing components are well-structured |
| New dependencies | Zero | Everything achievable with current stack |

## 2. Information Hierarchy (Top to Bottom)

### Above the Fold (First Screen)

1. **Executive Summary** — 2-3 sentence AI brief. Accent-wash bg + left border. The #1 value item.
2. **Stats Strip** — 4 hero numbers: Items, Sources, Positive %, Mood. Monospace, big numbers.
3. **Risk Alert Card** (conditional) — Top risk flag from sentiment analysis. Red/amber accent. Only shows when `risk_flags.length > 0`.

### Below the Fold (Scroll)

4. **Quick Scan Bullets** — Already in ExecSummaryWidget. First 3 always visible, rest behind "show more".
5. **Trending + Velocity** — Top 5 items by velocity with hoursOnTrend badges.
6. **Infographics Row** — Sentiment ring gauge + Category distribution bar. 2-col on desktop, stacked on mobile.
7. **Source Activity Heatmap** — GitHub-style dot matrix (24h x N sources). Full-width desktop, scrollable mobile.
8. **Section Summaries** — Accordion sections with AnimatePresence expand/collapse.
9. **Source Health** — Dot grid showing ok/failed per source.
10. **View Full Feed link** — Kept as-is.

### Desktop Layout

- Stats Strip, Exec Summary, Risk Alert: full-width
- Sentiment + Category Distribution: 2-column grid (1.2fr 1fr)
- Trending: full-width
- Source Activity: full-width
- Sections: full-width

### Mobile Layout

- Everything single column, stacked vertically
- Stats strip stays 4-col but tighter padding
- Heatmap scrollable horizontally

## 3. The 4 Infographics

### A. Sentiment Ring Gauge

SVG donut ring showing positive/neutral/negative distribution:
- `<circle>` elements with `stroke-dasharray` for segments
- Ring: r=45, viewBox 0 0 100 100, stroke-width 8
- Colors: positive = var(--ok), neutral = var(--ink-faint), negative = var(--err)
- Center: percentage + mood label
- Sizes: 140px desktop, 100px mobile
- Animate: transition stroke-dasharray 800ms

### B. Source Activity Heatmap

CSS Grid dot matrix — 24 columns (hours) x top sources:
- Each cell: 10px desktop / 8px mobile, border-radius 2px
- Color scale via opacity on accent
- Mobile: horizontally scrollable

### C. Category Distribution Bar

Horizontal segmented bar — single row:
- Bar height 6px, border-radius 3px, 4 segments
- Category colors: Research (green), News (blue), Trend (amber), Opinion (violet)
- Legend: 2x2 grid with counts
- Animate width on mount

### D. Source Health Dots

Simple 16-dot grid showing source status:
- Green dot = ok, red dot = failed, gray = not configured
- Compact, fits in a single row

## 4. New CSS Variables

Category colors + surface-raised + shadow-xs (see implementation plan for exact values).

## 5. Visual Polish

- Card border-radius: 12px (from 10px)
- Monospace for all numbers (ui-monospace)
- Stats numbers: 2rem desktop / 1.25rem mobile
- Staggered Framer Motion fade-in on dashboard widgets
- AnimatePresence for section expand/collapse
- Skeleton crossfade transition

## 6. Files to Change

| File | Changes |
|------|---------|
| globals.css | Category color tokens, shadow-xs, surface-raised, mobile stats override |
| Dashboard.tsx | Major rewrite: new widgets, animations, responsive layout |
