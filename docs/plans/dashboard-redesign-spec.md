# Dashboard Redesign Specification — Intel Briefing

> Premium data platform aesthetic. Think Bloomberg Terminal meets Vercel Dashboard meets Linear.
> Every value in this spec is implementation-ready. No ambiguity.

---

## 1. Current Issues

### Layout & Grid
- **3-column grid with 0.75rem gap is cramped.** Cards feel packed together with insufficient breathing room. Premium dashboards (Datadog, Vercel) use 16-24px gaps.
- **No intermediate breakpoint.** Jumps from 3-col desktop straight to 1-col mobile at 768px. Missing tablet (1024px → 2-col) and large desktop (1440px+ → wider margins).
- **`max-width: 1280px` is too narrow** for a data-dense dashboard on wide screens. Content feels squeezed at 1440px+.
- **Widget flow is unpredictable.** Span-2 and span-full widgets mixed with single-col widgets create uneven rows. The bottom of the grid (Source Health orphaned as single col after full-width Section Summaries) looks unfinished.
- **Stats Strip is a rigid 4-col grid** that doesn't adapt — on mobile the cells become micro-sized with 0.25rem padding.

### Visual Hierarchy
- **Flat hierarchy.** Every card has the same visual weight — white bg, 1px border, same shadow. The Executive Summary (the most important content) doesn't stand out enough despite the left-border treatment.
- **Section labels are too small** (`0.625rem` / 10px). On high-DPI screens they become micro-text that's easy to miss.
- **No clear information flow.** Users' eyes don't have a guided path from most-important to least-important data.

### Color System
- **Forest green (`#1D6B4F`) as the primary accent is generic.** It reads as "eco brand" or "banking app", not "premium intelligence platform." The green dominates without conveying information.
- **The warm canvas (`#F8F7F4`)** has a parchment/cream undertone that conflicts with the tech-intelligence brand. Premium data tools (Bloomberg, Datadog) use cooler, more neutral surfaces.
- **Semantic colors are stock Tailwind values** (`#16A34A`, `#B91C1C`) — they clash with the green accent and don't form a cohesive palette.
- **Dark mode greens** (`#4D9478`) are washed out and lack the punch needed for key interactive elements.
- **Category spectrum colors** (research green, news blue, trend orange, opinion purple) are randomly chosen with no colorimetric harmony.

### Typography
- **Base font-size of 15px is non-standard.** Creates odd rem calculations. Should be 16px (1rem) for predictable scaling.
- **Type scale is ad-hoc.** Font sizes are scattered across the codebase as arbitrary pixel values: `0.5rem`, `0.5625rem`, `0.625rem`, `0.6875rem`, `0.8125rem`, `1.375rem`, `1.75rem`. No modular scale.
- **Mono font usage is inconsistent.** Some numbers are mono, some aren't. Stats Strip values use mono except "Mood" which uses sans.
- **Font weight variety is excessive.** 400, 500, 600, 700 all used without clear roles.

### Spacing
- **No consistent spacing scale.** Padding values are a mix: `px-5` (20px), `py-4` (16px), `py-2` (8px), `gap-3` (12px), `gap-2.5` (10px), `gap-0.5` (2px), `py-[7px]`, `pl-[1.125rem]`. This creates visual rhythm inconsistency.
- **Cards use `py-4 px-5`** — asymmetric with no clear reason. Vertical and horizontal padding should relate to each other.
- **Ticker bar padding (`px-5 py-2`)** feels too tight for the information density.

### Card Design
- **Cards are flat and samey.** `shadow-sm` is barely visible. On light mode, cards are white-on-off-white with a thin border — they don't "lift" off the page.
- **Border radius inconsistency.** Cards use `rounded-xl` (0.75rem) but the ticker uses `rounded-[10px]` and heatmap cells use `rounded-sm`. No system.
- **No hover states on cards.** Dashboard widgets feel static and non-interactive.
- **No inner content zones.** All widgets are just a flat CardContent with no visual structure inside.

### Data Visualizations
- **Sentiment Ring** is basic SVG with hardcoded stroke widths. The `strokeWidth: 8` is too thick, making it look chunky rather than refined. Center text is cramped.
- **Heatmap cells are 5px minimum** with 2px gap — too small to click/hover on. The color scale uses opacity variants of the accent green, making it hard to distinguish intensity levels.
- **Distribution bar is 6px tall** (`h-1.5`) — so thin it's almost invisible. Legend dots are 6px — tiny and hard to scan.
- **Platform sentiment bars are 3px** (`h-[3px]`) — nearly invisible. Users can't compare platform sentiment at this scale.

### Animations
- **Stagger animation is uniform** (`delay: index * 0.06`). Every widget enters the same way — no visual emphasis on important content.
- **No micro-interactions.** Cards don't respond to hover. Stat values have a scale animation but it's barely perceptible (0.95 → 1).
- **No loading shimmer on skeletons.** Just static gray blocks. Premium dashboards use animated gradients.

### Mobile Responsiveness
- **768px single breakpoint is too aggressive.** iPad in portrait (768px) gets the single-column layout meant for phones.
- **Stats strip on mobile** has `padding: 0.875rem 0.25rem` — the horizontal padding is nearly zero.
- **Heatmap is unusable on mobile.** 24 columns compressed into a single grid column becomes unreadable. No horizontal scroll hint.
- **Ticker wraps poorly** on mobile — items overflow and stack.

### Premium Feel Assessment
**Current state: 4/10.** This looks like a competent developer's first dashboard — clean and functional but generic. It lacks:
- Visual depth and layering
- Sophisticated color relationships
- Information density without clutter
- Microinteractions that convey quality
- Typography that commands authority

---

## 2. Design Direction

### Aesthetic Vision: "Dark Intelligence Terminal"

**Primary reference: Bloomberg Terminal** — information density, dark confidence, data-first.
**Secondary: Linear** — clean grid, sophisticated neutral palette, subtle depth.
**Tertiary: Vercel Dashboard** — crisp typography, monospace data, minimal but premium.
**Accent: Raycast** — glass effects, smooth animations, keyboard-first feel.

### Principles
1. **Dark-mode-first.** The dashboard should shine in dark mode. Light mode is secondary but equally polished.
2. **Data density > decoration.** Every pixel should inform. Remove visual noise, increase data clarity.
3. **Depth through layering.** Use subtle elevation (shadows, background tones, borders) to create visual hierarchy without color.
4. **Cool neutrals.** Replace warm parchment tones with cooler, more technical grays.
5. **Accent as signal, not decoration.** Color means something — status, category, change. Never purely decorative.
6. **Monospace numbers, sans-serif prose.** All numeric data in a monospace face for alignment and technical feel.

---

## 3. Color Palette

### Light Mode

```css
/* Surfaces */
--canvas:          #FAFAFA;       /* Cool near-white — replaces warm #F8F7F4 */
--surface:         #FFFFFF;       /* Card backgrounds */
--surface-raised:  #FFFFFF;       /* Elevated surfaces */
--surface-inset:   #F5F5F5;       /* Recessed areas, input backgrounds */
--surface-overlay: #FFFFFF;       /* Modals, popovers */

/* Borders */
--border:          #E5E5E5;       /* Default border */
--border-subtle:   #F0F0F0;       /* Inner dividers */
--border-strong:   #D4D4D4;       /* Emphasized borders */

/* Text */
--ink:             #171717;       /* Primary text — near-black */
--ink-secondary:   #525252;       /* Secondary text */
--ink-tertiary:    #A3A3A3;       /* Tertiary/placeholder text */
--ink-disabled:    #D4D4D4;       /* Disabled text */

/* Accent — Electric indigo. Distinctive, premium, unmistakable. */
--accent:          #6366F1;       /* indigo-500 — primary actions, key indicators */
--accent-hover:    #4F46E5;       /* indigo-600 — hover state */
--accent-subtle:   #EEF2FF;       /* indigo-50 — tinted backgrounds */
--accent-muted:    #A5B4FC;       /* indigo-300 — secondary accent elements */
--accent-strong:   #4338CA;       /* indigo-700 — high-contrast accent */

/* Semantic */
--ok:              #22C55E;       /* green-500 */
--ok-subtle:       #F0FDF4;       /* green-50 */
--ok-text:         #15803D;       /* green-700 — text on light bg */
--warn:            #EAB308;       /* yellow-500 */
--warn-subtle:     #FEFCE8;       /* yellow-50 */
--warn-text:       #A16207;       /* yellow-700 */
--err:             #EF4444;       /* red-500 */
--err-subtle:      #FEF2F2;       /* red-50 */
--err-text:        #B91C1C;       /* red-700 */

/* Category spectrum — harmonized indigo-anchored palette */
--cat-research:      #6366F1;     /* indigo — matches accent */
--cat-news:          #3B82F6;     /* blue-500 */
--cat-trend:         #F59E0B;     /* amber-500 */
--cat-opinion:       #8B5CF6;     /* violet-500 */
--cat-research-bg:   rgba(99, 102, 241, 0.08);
--cat-news-bg:       rgba(59, 130, 246, 0.08);
--cat-trend-bg:      rgba(245, 158, 11, 0.08);
--cat-opinion-bg:    rgba(139, 92, 246, 0.08);

/* Heatmap intensity (indigo-based) */
--heat-0:          var(--surface-inset);
--heat-1:          rgba(99, 102, 241, 0.15);
--heat-2:          rgba(99, 102, 241, 0.35);
--heat-3:          rgba(99, 102, 241, 0.60);
--heat-4:          rgba(99, 102, 241, 0.85);

/* Shadows */
--shadow-xs:       0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-sm:       0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-md:       0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
--shadow-lg:       0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
--shadow-card:     0 1px 3px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.03);
--shadow-card-hover: 0 4px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);

/* Focus */
--focus-ring:      0 0 0 2px var(--surface), 0 0 0 4px rgba(99, 102, 241, 0.5);
```

### Dark Mode

```css
/* Surfaces */
--canvas:          #0A0A0A;       /* Near-black canvas */
--surface:         #141414;       /* Card backgrounds */
--surface-raised:  #1A1A1A;       /* Elevated surfaces */
--surface-inset:   #0F0F0F;       /* Recessed areas */
--surface-overlay: #1E1E1E;       /* Modals, popovers */

/* Borders */
--border:          #262626;       /* Default border */
--border-subtle:   #1C1C1C;       /* Inner dividers */
--border-strong:   #333333;       /* Emphasized borders */

/* Text */
--ink:             #FAFAFA;       /* Primary text */
--ink-secondary:   #A3A3A3;       /* Secondary text */
--ink-tertiary:    #666666;       /* Tertiary text */
--ink-disabled:    #404040;       /* Disabled text */

/* Accent — brighter indigo for dark surfaces */
--accent:          #818CF8;       /* indigo-400 */
--accent-hover:    #6366F1;       /* indigo-500 */
--accent-subtle:   rgba(99, 102, 241, 0.12);  /* tinted bg */
--accent-muted:    #6366F1;       /* indigo-500 as muted on dark */
--accent-strong:   #A5B4FC;       /* indigo-300 for high contrast */

/* Semantic — adjusted for dark bg */
--ok:              #4ADE80;       /* green-400 */
--ok-subtle:       rgba(74, 222, 128, 0.10);
--ok-text:         #4ADE80;
--warn:            #FACC15;       /* yellow-400 */
--warn-subtle:     rgba(250, 204, 21, 0.10);
--warn-text:       #FACC15;
--err:             #F87171;       /* red-400 */
--err-subtle:      rgba(248, 113, 113, 0.10);
--err-text:        #F87171;

/* Category spectrum — brightened for dark bg */
--cat-research:      #818CF8;
--cat-news:          #60A5FA;
--cat-trend:         #FBBF24;
--cat-opinion:       #A78BFA;
--cat-research-bg:   rgba(129, 140, 248, 0.10);
--cat-news-bg:       rgba(96, 165, 250, 0.10);
--cat-trend-bg:      rgba(251, 191, 36, 0.10);
--cat-opinion-bg:    rgba(167, 139, 250, 0.10);

/* Heatmap intensity */
--heat-0:          var(--surface-inset);
--heat-1:          rgba(129, 140, 248, 0.15);
--heat-2:          rgba(129, 140, 248, 0.30);
--heat-3:          rgba(129, 140, 248, 0.50);
--heat-4:          rgba(129, 140, 248, 0.75);

/* Shadows — deeper for dark mode */
--shadow-xs:       0 1px 2px rgba(0, 0, 0, 0.20);
--shadow-sm:       0 1px 3px rgba(0, 0, 0, 0.30), 0 1px 2px rgba(0, 0, 0, 0.20);
--shadow-md:       0 4px 6px -1px rgba(0, 0, 0, 0.40), 0 2px 4px -2px rgba(0, 0, 0, 0.30);
--shadow-lg:       0 10px 15px -3px rgba(0, 0, 0, 0.50), 0 4px 6px -4px rgba(0, 0, 0, 0.35);
--shadow-card:     0 1px 3px rgba(0, 0, 0, 0.20), 0 0 0 1px rgba(255, 255, 255, 0.04);
--shadow-card-hover: 0 4px 12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.06);

/* Focus */
--focus-ring:      0 0 0 2px var(--surface), 0 0 0 4px rgba(129, 140, 248, 0.5);
```

### Sidebar (both modes)
```css
--sb:              #0A0A0A;
--sb-surface:      #111111;
--sb-border:       #1C1C1C;
--sb-ink:          #FAFAFA;
--sb-secondary:    #A3A3A3;
--sb-tertiary:     #525252;
--sb-accent:       #818CF8;
```

---

## 4. Typography Scale

Base: `16px` (1rem). Font: `'Inter', system-ui, -apple-system, sans-serif`.
Mono: `'JetBrains Mono', 'SF Mono', ui-monospace, monospace`.

| Token            | Size      | Weight | Line Height | Letter Spacing | Usage                          |
|------------------|-----------|--------|-------------|----------------|--------------------------------|
| `--text-h1`      | 1.5rem    | 700    | 1.25        | -0.025em       | Page titles (not on dashboard) |
| `--text-h2`      | 1.25rem   | 600    | 1.3         | -0.02em        | —                              |
| `--text-stat`    | 1.75rem   | 700    | 1.1         | -0.03em        | Stats strip big numbers        |
| `--text-widget`  | 0.8125rem | 600    | 1.3         | 0              | Widget headers                 |
| `--text-body`    | 0.875rem  | 400    | 1.6         | 0              | Body text, summaries           |
| `--text-sm`      | 0.8125rem | 400    | 1.5         | 0              | Secondary body text            |
| `--text-xs`      | 0.75rem   | 500    | 1.4         | 0              | Supporting text, metadata      |
| `--text-label`   | 0.6875rem | 600    | 1.2         | 0.06em         | Section labels (uppercase)     |
| `--text-micro`   | 0.625rem  | 500    | 1.2         | 0.04em         | Badges, tiny counts            |
| `--text-mono`    | 0.8125rem | 500    | 1.4         | 0              | All numeric data (mono font)   |
| `--text-mono-sm` | 0.6875rem | 500    | 1.3         | 0              | Small numeric data (mono)      |
| `--text-mono-xs` | 0.625rem  | 500    | 1.2         | 0              | Heatmap labels, ticker (mono)  |
| `--text-ring`    | 1.25rem   | 700    | 1           | -0.02em        | Sentiment ring center number   |
| `--text-ring-label` | 0.5rem | 600   | 1           | 0.08em         | "POSITIVE" label in ring       |

### Rules
- All numeric values (stats, percentages, counts, timestamps) use the mono typeface.
- Widget section labels: `--text-label` in `var(--ink-tertiary)`, uppercase.
- Body text in widgets: `--text-sm` (13px).
- Do NOT use `font-bold` (700) for text smaller than 12px — use `font-semibold` (600) as max weight for small text.

---

## 5. Spacing System

**Base-4 spacing scale.** All spacing values are multiples of 4px (0.25rem).

| Token     | Value    | Px  | Usage                                            |
|-----------|----------|-----|--------------------------------------------------|
| `--sp-1`  | 0.25rem  | 4   | Tight inline gaps, icon-to-text gaps             |
| `--sp-2`  | 0.5rem   | 8   | Inner element gaps, compact padding              |
| `--sp-3`  | 0.75rem  | 12  | Small section gaps                               |
| `--sp-4`  | 1rem     | 16  | Default card internal padding, widget gaps       |
| `--sp-5`  | 1.25rem  | 20  | Card padding (horizontal)                        |
| `--sp-6`  | 1.5rem   | 24  | Section spacing, card outer padding              |
| `--sp-8`  | 2rem     | 32  | Major section gaps                               |
| `--sp-10` | 2.5rem   | 40  | Page-level padding                               |
| `--sp-12` | 3rem     | 48  | Large spacing (empty states, hero areas)         |

### Application
- **Grid gap**: `--sp-4` (16px) — up from 12px
- **Card internal padding**: `--sp-5` horizontal (20px), `--sp-4` vertical (16px)
- **Page padding**: `--sp-6` (24px) on desktop, `--sp-4` (16px) on mobile
- **Widget section label to content**: `--sp-3` (12px)
- **Between sibling items in a list**: `--sp-2` (8px)
- **Inline gap (icon + text)**: `--sp-1` to `--sp-2` (4-8px)

---

## 6. Grid Layout

### Breakpoints

| Name    | Min Width | Columns | Grid Gap | Page Padding | Max Content Width |
|---------|-----------|---------|----------|--------------|-------------------|
| Mobile  | 0         | 1       | 12px     | 16px         | 100%              |
| Tablet  | 768px     | 2       | 16px     | 24px         | 100%              |
| Desktop | 1024px    | 3       | 16px     | 24px         | 1360px            |
| Wide    | 1440px    | 3       | 20px     | 32px         | 1440px            |

### Widget Placement (Desktop 3-col)

```
Row 1: [Status Ticker ──────────────────────── span 3]
Row 2: [Stats 1] [Stats 2] [Stats 3] [Stats 4] ← inside a span-3 card
Row 3: [Executive Summary ─── span 2] [Risk & Intel Panel]
Row 4: [Sentiment] [Category Distribution] [Trending]
Row 5: [Source Activity Heatmap ── span 2] [Source Health]
Row 6: [Section Summaries ──────────────────── span 3]
```

### Widget Placement (Tablet 2-col)
```
Row 1: [Status Ticker ────── span 2]
Row 2: [Stats Strip ──────── span 2]
Row 3: [Executive Summary ── span 2]
Row 4: [Risk & Intel] [Sentiment]
Row 5: [Category] [Trending]
Row 6: [Heatmap ───────────── span 2]
Row 7: [Section Summaries ── span 2]
Row 8: [Source Health ─────── span 2]
```

### Widget Placement (Mobile 1-col)
All widgets stack vertically. Stats Strip switches to 2x2 grid instead of 4-across.

### CSS Grid Implementation
```css
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

@media (min-width: 768px) {
  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
}

@media (min-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }
}

@media (min-width: 1440px) {
  .dashboard-grid {
    gap: 1.25rem;
  }
}
```

---

## 7. Widget Redesign

### 7.1 Status Ticker Bar

**Current:** Flat secondary background, mono text, pulse dot.
**Redesigned:**
- Background: `var(--surface)` with `var(--shadow-xs)` and `1px solid var(--border-subtle)`.
- Height: 40px fixed. Vertically centered content.
- Items separated by `var(--border-subtle)` vertical rules (1px, 16px tall).
- Pipeline status dot: 6px, CSS animation `pulse` for active state using `var(--accent)`.
- Font: `--text-mono-xs` (10px mono) for all ticker items.
- Mood indicator: colored dot + mood word in the semantic color.
- Risk badge: `var(--err)` background with white text, `border-radius: 4px`, `padding: 2px 6px`.
- On mobile: hide fetch time, summary time. Keep: status dot, sources, mood. Wrap allowed.

### 7.2 Stats Strip

**Current:** 4-col grid inside a Card, large numbers with tiny labels.
**Redesigned:**
- Remove the Card wrapper. Stats sit in a `span-full` strip with `var(--surface)` background, `border-radius: 12px`, and `var(--shadow-card)`.
- Each stat cell: `padding: 16px 0`.
- Numbers: `--text-stat` (28px, mono, weight 700). Color: `var(--ink)` for neutral values, semantic colors for mood.
- Labels: `--text-label` (11px, uppercase, `var(--ink-tertiary)`).
- Dividers: `1px solid var(--border-subtle)` between cells.
- Hover: cell background transitions to `var(--surface-inset)` with `150ms ease`.
- **Mobile (< 768px):** Switch to 2x2 grid. Each cell gets `padding: 12px 8px`.

### 7.3 Executive Summary

**Current:** Left-border accent wash with SectionLabel.
**Redesigned:**
- Container: `var(--surface)` background, `border-radius: 12px`, `var(--shadow-card)`.
- Left border: `3px solid var(--accent)`, only on the left edge (`border-left`), with `border-radius: 12px` on the container.
- Inner padding: `20px 24px`.
- Section label: `--text-label`, color `var(--accent)`.
- Summary text: `--text-body` (14px), `var(--ink)`, `line-height: 1.6`.
- Quick Scan bullets: `--text-sm` (13px), `var(--ink-secondary)`. Bullet is a 4px circle in `var(--accent)`.
- Quick Scan divider: `1px solid var(--border-subtle)`, `margin: 16px 0 12px 0`.
- Citation links: `var(--accent)`, `font-weight: 600`, `font-size: 0.625rem`, superscript.

### 7.4 Risk & Intelligence Panel

**Current:** Card with line-variant tabs, badge counts, dotted dividers.
**Redesigned:**
- Card: standard card styling (see Section 8).
- Tab bar: pill-style tabs instead of line tabs. Each tab is a rounded pill (`border-radius: 6px`, `padding: 4px 12px`). Active tab: `var(--surface-inset)` background, `var(--ink)` text. Inactive: transparent, `var(--ink-tertiary)`.
- Tab count badges: `--text-micro` (10px), `font-weight: 600`. Risk: `var(--err-text)`, Controversies: `var(--warn-text)`, Shifts: `var(--accent)`.
- Alert count header: right-aligned, `--text-mono-xs`, `var(--err-text)` if risks exist.
- List items: `padding: 10px 0`, separated by `1px solid var(--border-subtle)`.
- Item topic: `--text-sm` (13px), `font-weight: 600`, `var(--ink)`.
- Item analysis: `--text-xs` (12px), `var(--ink-secondary)`, `line-height: 1.5`.
- Status dot: 5px circle, colored per tab (err/warn/accent).

### 7.5 Sentiment Widget (with Ring Gauge)

**Current:** Basic SVG ring, mood dot, platform bars.
**Redesigned:**
- Ring gauge size: 96px on desktop, 80px on mobile.
- Ring stroke width: **6** (down from 8). More refined.
- Ring track (background): `var(--border-subtle)`.
- Ring positive arc: `var(--ok)`.
- Ring neutral arc: `var(--ink-tertiary)`.
- Ring negative arc: `var(--err)`.
- Center text: `--text-ring` (20px, mono, 700). Percentage value.
- Center sublabel: `--text-ring-label` (8px, uppercase, `var(--ink-tertiary)`).
- Mood indicator (header right): 6px dot + mood word, both in semantic color. `--text-xs`, `font-weight: 600`.
- Platform sentiment bars: height **6px** (up from 3px). `border-radius: 3px`. Add subtle 1px gap between segments.
- Platform label: `--text-mono-xs`, platform brand color.
- Percentage breakdown: `--text-mono-xs`, right-aligned. Green/gray/red.

### 7.6 Category Distribution Widget

**Current:** Very thin bar (6px) with small legend.
**Redesigned:**
- Distribution bar: height **8px**, `border-radius: 4px`. Segments have `1px` gap between them.
- Segments use category colors from the palette.
- Transition: `width 500ms cubic-bezier(0.4, 0, 0.2, 1)`.
- Legend: 2-col grid. Each item: 8px color dot + label (`--text-xs`, `var(--ink-secondary)`) + count (`--text-mono-xs`, `var(--ink)`, `font-weight: 600`).
- Add hover: hovering a legend item highlights the corresponding bar segment (increase opacity, others dim to 0.3).

### 7.7 Source Activity Heatmap

**Current:** Tiny 5px cells, 4-level opacity scale, difficult to read.
**Redesigned:**
- Cell minimum size: **8px** with `2px` gap. `border-radius: 2px`.
- 5-level intensity scale using the `--heat-*` tokens (0, 1, 2, 3, 4).
- Source labels: `--text-mono-xs` (10px), `var(--ink-secondary)`, width `56px`, truncated.
- Hour labels: show every 6th hour (`0h`, `6h`, `12h`, `18h`) above the grid in `--text-mono-xs`, `var(--ink-tertiary)`.
- Legend: horizontal strip below. Each level is a 10px square with label.
- Cell hover: `outline: 1px solid var(--accent)`, `z-index: 1`.
- Transition: `background 200ms ease`.
- On mobile (< 768px): horizontal scroll with fade mask on edges. Show scroll hint icon.

### 7.8 Source Health Widget

**Current:** Tiny 5px dots with 8-char labels.
**Redesigned:**
- Health dots: **8px** circles. OK: `var(--ok)`. Failed: `var(--err)`.
- Layout: flex-wrap with `8px` gap.
- Source labels: `--text-mono-xs` (10px), `var(--ink-secondary)`. Full sensor label (don't truncate to 8 chars — truncate at 12).
- Header: "Source Health" + "{ok}/{total} operational" in `--text-mono-xs`, `var(--ok-text)` or `var(--err-text)` if failures exist.
- Failed sources should appear first, sorted, so failures are immediately visible.

### 7.9 Trending Widget

**Current:** Ranked list with dotted dividers, rank numbers, velocity percentages.
**Redesigned:**
- Each item: `padding: 10px 0`, `1px solid var(--border-subtle)` divider.
- Rank number: `--text-mono-sm` (11px), `font-weight: 700`. Top 3: `var(--accent)`. Rest: `var(--ink-disabled)`.
- Title: `--text-sm` (13px), `font-weight: 500`, `var(--ink)`. Single line, truncated.
- Metadata row: `--text-micro` (10px). Source badge: `var(--surface-inset)` bg, `border-radius: 4px`, `padding: 1px 6px`. Heat badge. Hours-on-trend badge.
- Velocity percentage: `--text-mono-sm` (11px), `font-weight: 700`. Positive: `var(--ok-text)`. Negative: `var(--err-text)`.
- Hover: entire row gets `var(--surface-inset)` background, smooth transition `150ms`.
- "View all" link: `--text-xs`, `var(--accent)`, right-aligned in header.

### 7.10 Section Summaries (Accordion)

**Current:** Accordion with border-left-2 entries.
**Redesigned:**
- Full-width card with standard card styling.
- Accordion triggers: `--text-sm` (13px), `font-weight: 600`, `padding: 14px 0`.
- Count badge: `var(--surface-inset)` bg, `--text-micro`, `font-weight: 600`, `border-radius: 4px`.
- Accordion content: entries with `2px solid var(--accent-subtle)` left border in light mode, `2px solid var(--border-strong)` in dark mode.
- Entry text: `--text-sm` (13px), `var(--ink-secondary)`, `line-height: 1.6`, `padding-left: 12px`.
- Divider between accordion items: `1px solid var(--border-subtle)`.
- Animation: smooth height transition `200ms ease-out`.

---

## 8. Card System

### Base Card
```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  transition: box-shadow 200ms ease, border-color 200ms ease;
}

.card:hover {
  box-shadow: var(--shadow-card-hover);
  border-color: var(--border-strong);
}
```

### Card Variants

| Variant     | Background             | Border                                                      | Shadow               | Usage               |
|-------------|------------------------|-------------------------------------------------------------|----------------------|---------------------|
| Default     | `var(--surface)`       | `1px solid var(--border)`                                   | `var(--shadow-card)` | Most widgets        |
| Inset       | `var(--surface-inset)` | `1px solid var(--border-subtle)`                            | none                 | Stats cells, recessed areas |
| Accent      | `var(--accent-subtle)` | `3px solid var(--accent)` left, `1px var(--border-subtle)` rest | `var(--shadow-card)` | Executive Summary |
| Transparent | transparent            | none                                                        | none                 | Full-width containers |

### Card Inner Spacing
- Horizontal padding: `20px` (`--sp-5`)
- Vertical padding: `16px` (`--sp-4`)
- Section label to content gap: `12px` (`--sp-3`)
- Content item gap: `8px` (`--sp-2`)

### Border Radius System
- Cards: `12px`
- Inner elements (badges, inputs): `8px`
- Pills/tabs: `6px`
- Micro elements (dots, heatmap cells): `4px` or `2px`

---

## 9. Data Visualization Styling

### Sentiment Ring Gauge
```
Diameter: 96px (desktop), 80px (mobile)
Stroke width: 6
Background track: var(--border-subtle), stroke-width 6
Segment stroke-linecap: round (only for the positive arc start and negative arc end)
Positive: var(--ok)
Neutral: var(--ink-tertiary) at 0.5 opacity
Negative: var(--err)
Animation: stroke-dasharray transition 600ms cubic-bezier(0.4, 0, 0.2, 1)
Center number: --text-ring (20px), mono, bold
Center label: --text-ring-label (8px), uppercase, var(--ink-tertiary)
```

### Heatmap Grid
```
Cell size: minmax(8px, 1fr) square
Cell gap: 2px
Cell radius: 2px
Intensity levels:
  0 items:  var(--heat-0) — surface-inset
  1-3:      var(--heat-1) — lightest tint
  4-8:      var(--heat-2)
  9-15:     var(--heat-3)
  16+:      var(--heat-4) — near-solid accent
Cell hover: outline 1px solid var(--accent), z-index 1
Transition: background 200ms ease
```

### Distribution Bar
```
Height: 8px
Border-radius: 4px (outer container), 0 for inner segments (overflow hidden on container)
Segment gap: 1px (transparent gap between segments)
Colors: category palette
Transition: width 500ms cubic-bezier(0.4, 0, 0.2, 1)
```

### Platform Sentiment Bars
```
Height: 6px
Border-radius: 3px (outer container)
Positive segment: var(--ok)
Neutral segment: var(--ink-tertiary) at 0.3 opacity
Negative segment: var(--err)
Transition: width 400ms ease
```

---

## 10. Animation Strategy

### Page Load — Stagger Entrance
```
Widget stagger: delay = index * 0.04s (faster than current 0.06s)
Entry animation:
  from: opacity: 0, transform: translateY(8px)
  to:   opacity: 1, transform: translateY(0)
  duration: 400ms
  easing: spring(stiffness: 300, damping: 28)
Priority widgets (ticker, stats, exec summary): stagger delay 0 / 0.04 / 0.08
Secondary widgets: stagger delay 0.12+
```

### Data Update Transitions
```
Stat value change:
  Scale: 0.97 → 1.0
  Opacity: 0.4 → 1.0
  Duration: 300ms
  Easing: ease-out

Bar width changes (distribution, sentiment):
  Duration: 500ms
  Easing: cubic-bezier(0.4, 0, 0.2, 1)

Ring gauge arc changes:
  Duration: 600ms
  Easing: cubic-bezier(0.4, 0, 0.2, 1)
```

### Hover Micro-interactions
```
Cards:
  Shadow: var(--shadow-card) → var(--shadow-card-hover)
  Border: var(--border) → var(--border-strong)
  Duration: 200ms ease

Trending list items:
  Background: transparent → var(--surface-inset)
  Duration: 150ms ease

Stats cells:
  Background: transparent → var(--surface-inset)
  Duration: 150ms ease

Interactive elements (links, buttons):
  Opacity: 1 → 0.8 on active
  Duration: 0ms (instant feedback)
```

### Skeleton Loading
```css
/* Animated shimmer gradient */
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-inset) 0%,
    var(--border-subtle) 50%,
    var(--surface-inset) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 6px;
}
```

### Accordion
```
Height transition: 200ms ease-out
Content fade: opacity 0 → 1, 150ms ease, 50ms delay
Chevron rotation: 0deg → 180deg, 200ms ease
```

---

## 11. Responsive Strategy

### Mobile (< 768px)

| Widget               | Adaptation                                                    |
|----------------------|---------------------------------------------------------------|
| Status Ticker        | Hide fetch time, summary time. Keep: status dot, sources, mood. Wrap allowed. |
| Stats Strip          | 2x2 grid. Number size: `1.25rem`. Cell padding: `12px 8px`.  |
| Executive Summary    | Full width. Same styling, just narrower.                      |
| Risk & Intel Panel   | Full width. Tabs scroll horizontally if needed.               |
| Sentiment Widget     | Ring at 80px. Platform bars stack if > 3 sources.             |
| Category Distribution| Full width. Legend switches to single column.                  |
| Trending             | Full width. Truncate titles more aggressively.                |
| Heatmap              | Horizontal scroll with fade mask. Min-width: 400px on inner.  |
| Source Health         | Full width. Dots wrap naturally.                              |
| Section Summaries    | Full width. Accordion is naturally mobile-friendly.           |

Page padding: `16px`. Grid gap: `12px`.

### Tablet (768px – 1023px)

| Widget               | Span | Notes                                       |
|----------------------|------|---------------------------------------------|
| Status Ticker        | 2    | Full row                                    |
| Stats Strip          | 2    | 4-col grid (fits at 768px)                  |
| Executive Summary    | 2    | Full row (important content gets full space) |
| Risk & Intel Panel   | 1    |                                              |
| Sentiment Widget     | 1    |                                              |
| Category Distribution| 1    |                                              |
| Trending             | 1    |                                              |
| Heatmap              | 2    | Full row                                    |
| Section Summaries    | 2    | Full row                                    |
| Source Health         | 2    | Full row                                    |

Page padding: `24px`. Grid gap: `16px`.

### Desktop (1024px – 1439px)

Standard 3-column layout as described in Section 6.
Page padding: `24px`. Grid gap: `16px`. Max-width: `1360px`.

### Wide (1440px+)

Same 3-col layout but with:
- Grid gap: `20px`
- Page padding: `32px`
- Max-width: `1440px`
- Cards get slightly more breathing room but don't expand to 4 columns (3 is optimal for this data density)

---

## Implementation Notes

### CSS Custom Properties to Update in globals.css
- Replace all `--canvas`, `--surface`, `--border`, `--ink` variables with new palette values
- Add new tokens: `--surface-raised`, `--surface-inset`, `--surface-overlay`, `--border-subtle`, `--border-strong`, `--ink-secondary`, `--ink-tertiary`, `--ink-disabled`
- Replace `--accent` (green) with indigo palette
- Add `--heat-*` heatmap tokens
- Add `--shadow-card` and `--shadow-card-hover`
- Update all shadcn mappings (`--background`, `--foreground`, `--primary`, etc.)
- Remove old tokens: `--accent-wash`, `--accent-dim`, `--accent-lo`, `--accent-mid`, `--accent-tint`
- Rename category tint tokens from `--cat-*-tint` to `--cat-*-bg`

### Dashboard.tsx Changes
- Update grid CSS classes to use new breakpoint system
- Update all widget components to use new typography tokens
- Increase heatmap cell sizes and add hover states
- Increase bar heights (distribution, sentiment)
- Adjust ring gauge stroke width and sizing
- Add hover states to cards and list items
- Add skeleton shimmer animation
- Update Stats Strip mobile layout to 2x2
- Add hour labels to heatmap header row

### Fonts to Load
Add JetBrains Mono via `next/font/google` for the mono typeface upgrade:
```tsx
import { JetBrains_Mono } from 'next/font/google'
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })
```

---

*This spec was authored by the UI/UX design reviewer agent for the Intel Briefing dashboard redesign. All values are implementation-ready.*
