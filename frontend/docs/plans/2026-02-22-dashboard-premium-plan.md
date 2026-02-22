# Dashboard Premium Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the dashboard into a Bloomberg Terminal-inspired experience with SVG infographics, Framer Motion animations, and responsive mobile/desktop layout.

**Architecture:** Hand-rolled SVG charts + Framer Motion (already installed) + CSS custom properties. Zero new dependencies. All changes in globals.css and Dashboard.tsx.

**Tech Stack:** Next.js 15, React 18, TypeScript, Framer Motion v12.34.3, inline styles with CSS vars.

---

### Task 1: Add CSS Design Tokens

**Files:**
- Modify: `.worktrees/dashboard-premium/frontend/src/app/globals.css`

**Step 1: Add category colors and utility tokens to `:root`**

Add after `--warn-border` line (line ~51) in the existing `:root` block:

```css
  /* Category spectrum */
  --cat-research:      #1D6B4F;
  --cat-news:          #2563EB;
  --cat-trend:         #D97706;
  --cat-opinion:       #7C3AED;
  --cat-research-tint: rgba(29, 107, 79, 0.08);
  --cat-news-tint:     rgba(37, 99, 235, 0.08);
  --cat-trend-tint:    rgba(217, 119, 6, 0.08);
  --cat-opinion-tint:  rgba(124, 58, 237, 0.08);

  /* Elevation */
  --surface-raised:    #FFFFFF;
  --shadow-xs:         0 1px 2px rgba(0, 0, 0, 0.03);
```

**Step 2: Add dark mode overrides for new tokens**

Add after `--warn-border` line (~116) inside the dark mode `:root` block:

```css
    /* Category spectrum — brighter for dark bg */
    --cat-research:      #4D9478;
    --cat-news:          #60A5FA;
    --cat-trend:         #FBBF24;
    --cat-opinion:       #A78BFA;
    --cat-research-tint: rgba(77, 148, 120, 0.12);
    --cat-news-tint:     rgba(96, 165, 250, 0.12);
    --cat-trend-tint:    rgba(251, 191, 36, 0.12);
    --cat-opinion-tint:  rgba(167, 139, 250, 0.12);

    /* Elevation */
    --surface-raised:    #2E2D29;
    --shadow-xs:         0 1px 2px rgba(0, 0, 0, 0.15);
```

**Step 3: Add mobile dashboard overrides**

Add inside the existing `@media (max-width: 768px)` block:

```css
  /* ── Dashboard stats strip — tighter on mobile ── */
  .dashboard-stats-strip {
    grid-template-columns: repeat(4, 1fr) !important;
  }
  .dashboard-stats-strip .stat-value {
    font-size: 1.25rem !important;
  }
  .dashboard-stats-strip .stat-cell {
    padding: 0.875rem 0.25rem !important;
  }

  /* ── Dashboard page padding ── */
  .dashboard-root {
    padding: 1.25rem !important;
    padding-top: 1rem !important;
  }
```

**Step 4: Verify**

Run: `npx tsc --noEmit` from frontend dir
Expected: No errors

**Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(dashboard): add category color tokens and mobile dashboard overrides"
```

---

### Task 2: Rewrite Dashboard — Core Layout + Framer Motion Setup

**Files:**
- Modify: `.worktrees/dashboard-premium/frontend/src/components/Dashboard.tsx`

**Overview:** This is the largest task. Rewrite Dashboard.tsx to add:
- Framer Motion imports and staggered widget wrapper
- Updated border-radius (12px), shadow-xs, monospace numbers
- Responsive 2-column grid for infographics row
- AnimatePresence skeleton crossfade
- Updated StatsStrip with className hooks for mobile CSS

**Step 1: Add Framer Motion imports**

Add after existing imports (line ~10):

```typescript
import { motion, AnimatePresence } from 'framer-motion'
```

**Step 2: Add stagger wrapper component**

Add after PULSE_CSS definition (after line ~82):

```typescript
/** Stagger-fade each dashboard widget on mount. */
function StaggerChild({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        delay: index * 0.08,
      }}
    >
      {children}
    </motion.div>
  )
}
```

**Step 3: Update StatsStrip — monospace numbers + className hooks**

Replace the StatsStrip component with updated version:
- Add `fontFamily: 'ui-monospace, monospace'` to stat values
- Change `borderRadius: 10` to `borderRadius: 12`
- Add `className="dashboard-stats-strip"` to outer div
- Add `className="stat-cell"` and `className="stat-value"` divs
- Change desktop font-size to `2rem` with `-0.03em` letterSpacing

**Step 4: Update ExecSummaryWidget — border-radius 12**

Change `borderRadius: '0 10px 10px 0'` to `borderRadius: '0 12px 12px 0'`.

**Step 5: Update card border-radius across all widgets**

Change all `borderRadius: 10` to `borderRadius: 12` in:
- SentimentWidget outer div
- TrendingWidget outer div
- SectionSummariesWidget section divs
- DashboardSkeleton all skeleton containers
- No-data empty state div

**Step 6: Add shadow-xs to all card widgets**

Add `boxShadow: 'var(--shadow-xs)'` to:
- StatsStrip, SentimentWidget, TrendingWidget containers

**Step 7: Wrap dashboard content with AnimatePresence**

Replace the loading ternary with AnimatePresence crossfade:

```tsx
<AnimatePresence mode="wait">
  {loading ? (
    <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <DashboardSkeleton />
    </motion.div>
  ) : !hasSummary && !hasReport ? (
    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* no-data content */}
    </motion.div>
  ) : (
    <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* dashboard widgets */}
    </motion.div>
  )}
</AnimatePresence>
```

**Step 8: Wrap each widget with StaggerChild**

```tsx
<StaggerChild index={0}><StatsStrip ... /></StaggerChild>
<StaggerChild index={1}><ExecSummaryWidget ... /></StaggerChild>
<StaggerChild index={2}>{/* Risk Alert */}</StaggerChild>
<StaggerChild index={3}>{/* Trending */}</StaggerChild>
<StaggerChild index={4}>{/* Infographics row */}</StaggerChild>
...
```

**Step 9: Add className="dashboard-root" to main container**

Change the outer `<div style={{ padding: '2rem 2.5rem', ... }}>` to add `className="dashboard-root"`.

**Step 10: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

Run: `npx vitest run`
Expected: All tests pass

**Step 11: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): framer motion stagger, AnimatePresence, 12px radius, shadow-xs"
```

---

### Task 3: Add Risk Alert Card Widget

**Files:**
- Modify: `.worktrees/dashboard-premium/frontend/src/components/Dashboard.tsx`

**Step 1: Add RiskAlertWidget component**

Add after ExecSummaryWidget:

```typescript
function RiskAlertWidget({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall)) return null
  const flags = overall.sentiment?.risk_flags
  if (!flags || flags.length === 0) return null

  const topFlag = flags[0]

  return (
    <div style={{
      background: 'var(--err-bg)',
      border: '1px solid var(--err)',
      borderLeft: '3px solid var(--err)',
      borderRadius: '0 12px 12px 0',
      padding: '1rem 1.25rem',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
    }}>
      <span style={{
        fontSize: '0.625rem',
        fontWeight: 700,
        color: 'var(--err)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        flexShrink: 0,
        marginTop: '0.125rem',
      }}>
        RISK
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--ink)',
          marginBottom: '0.25rem',
        }}>
          {topFlag.topic}
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--ink-muted)',
          lineHeight: 1.6,
        }}>
          <InlineRefs text={topFlag.analysis} globalSources={overall.sources} />
        </div>
      </div>
      {flags.length > 1 && (
        <span style={{
          fontSize: '0.5625rem',
          fontWeight: 600,
          color: 'var(--err)',
          background: 'rgba(185, 28, 28, 0.08)',
          padding: '0.125rem 0.375rem',
          borderRadius: 3,
          fontFamily: 'ui-monospace, monospace',
          flexShrink: 0,
        }}>
          +{flags.length - 1}
        </span>
      )}
    </div>
  )
}
```

**Step 2: Add to dashboard layout**

Insert after ExecSummaryWidget in the widget list:

```tsx
<StaggerChild index={2}>
  {summary && <RiskAlertWidget summary={summary} />}
</StaggerChild>
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
npx vitest run
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): add conditional risk alert card"
```

---

### Task 4: Add Sentiment Ring Gauge

**Files:**
- Modify: `.worktrees/dashboard-premium/frontend/src/components/Dashboard.tsx`

**Step 1: Add SentimentRing SVG component**

```typescript
function SentimentRing({ positive, neutral, negative, size = 140 }: {
  positive: number; neutral: number; negative: number; size?: number
}) {
  const total = positive + neutral + negative
  if (total === 0) return null

  const posPct = positive / total
  const neuPct = neutral / total

  const circumference = 2 * Math.PI * 45 // r=45

  const posArc = posPct * circumference
  const neuArc = neuPct * circumference
  const negArc = circumference - posArc - neuArc

  const posOffset = -circumference * 0.25 // start at top
  const neuOffset = posOffset - posArc
  const negOffset = neuOffset - neuArc

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="8" />
      {/* Positive */}
      <circle cx="50" cy="50" r="45" fill="none"
        stroke="var(--ok)" strokeWidth="8"
        strokeDasharray={`${posArc} ${circumference - posArc}`}
        strokeDashoffset={posOffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
      />
      {/* Neutral */}
      {neuArc > 0 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--ink-faint)" strokeWidth="8"
          strokeDasharray={`${neuArc} ${circumference - neuArc}`}
          strokeDashoffset={neuOffset}
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      {/* Negative */}
      {negArc > 0 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--err)" strokeWidth="8"
          strokeDasharray={`${negArc} ${circumference - negArc}`}
          strokeDashoffset={negOffset}
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      {/* Center text */}
      <text x="50" y="46" textAnchor="middle" fill="var(--ink)"
        style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
        {Math.round(posPct * 100)}%
      </text>
      <text x="50" y="60" textAnchor="middle" fill="var(--ink-faint)"
        style={{ fontSize: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        POSITIVE
      </text>
    </svg>
  )
}
```

**Step 2: Integrate into SentimentWidget**

Add the ring gauge above the mood indicator. Position the ring left-aligned with platform bars to the right on desktop (flex row), stacked on mobile (flex column via media query or inline responsive check).

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
npx vitest run
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): add SVG sentiment ring gauge"
```

---

### Task 5: Add Category Distribution Bar

**Files:**
- Modify: `.worktrees/dashboard-premium/frontend/src/components/Dashboard.tsx`

**Step 1: Add CategoryDistributionWidget**

```typescript
function CategoryDistributionWidget({ report }: { report: IntelReport }) {
  const counts: Record<DisplayCategoryKey, number> = { 'high-trust': 0, news: 0, trend: 0, opinions: 0 }
  for (const [cat, items] of Object.entries(report.items)) {
    for (const item of items) {
      const dc = displayCategoryOf(item, cat)
      counts[dc] = (counts[dc] || 0) + 1
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const segments: { key: DisplayCategoryKey; label: string; count: number; color: string }[] = [
    { key: 'high-trust', label: 'Research', count: counts['high-trust'], color: 'var(--cat-research)' },
    { key: 'news', label: 'News', count: counts.news, color: 'var(--cat-news)' },
    { key: 'trend', label: 'Trend', count: counts.trend, color: 'var(--cat-trend)' },
    { key: 'opinions', label: 'Opinion', count: counts.opinions, color: 'var(--cat-opinion)' },
  ]

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '1.25rem 1.5rem',
      boxShadow: 'var(--shadow-xs)',
    }}>
      <SectionLabel style={{ marginBottom: '0.875rem' }}>Distribution</SectionLabel>
      {/* Bar */}
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
        {segments.map(seg => seg.count > 0 && (
          <div key={seg.key} style={{
            width: `${(seg.count / total) * 100}%`,
            background: seg.color,
            transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        ))}
      </div>
      {/* Legend */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.375rem 1rem',
        marginTop: '0.75rem',
      }}>
        {segments.map(seg => (
          <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: seg.color, flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)',
            }}>
              {seg.label}
            </span>
            <span style={{
              fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink)',
              fontFamily: 'ui-monospace, monospace', marginLeft: 'auto',
            }}>
              {seg.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Add infographics row to dashboard layout**

Create a 2-column grid row for Sentiment + Distribution:

```tsx
<StaggerChild index={5}>
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '0.75rem',
  }}>
    {summary && <SentimentWidget summary={summary} report={report} />}
    {report && <CategoryDistributionWidget report={report} />}
  </div>
</StaggerChild>
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
npx vitest run
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): add category distribution bar with legend"
```

---

### Task 6: Add Source Activity Heatmap

**Files:**
- Modify: `.worktrees/dashboard-premium/frontend/src/components/Dashboard.tsx`

**Step 1: Add SourceActivityWidget**

Groups items by source and published_at hour into a dot matrix grid. Shows top 6 sources with most items. Each cell colored by item count intensity.

Key implementation details:
- Parse `published_at` into hour buckets (0-23)
- Items without `published_at` get bucketed into hour from `report.fetched_at`
- Use CSS Grid with 24 columns + source label column
- Color intensity: border-soft (0), accent 25% (1-5), accent 55% (6-15), accent 100% (16+)
- On mobile: `overflowX: 'auto'` with scrollbar

**Step 2: Add to dashboard layout**

```tsx
<StaggerChild index={6}>
  {report && <SourceActivityWidget report={report} />}
</StaggerChild>
```

**Step 3: Verify + Commit**

```bash
npx tsc --noEmit
npx vitest run
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): add source activity heatmap"
```

---

### Task 7: Add Source Health Dots + AnimatePresence Sections

**Files:**
- Modify: `.worktrees/dashboard-premium/frontend/src/components/Dashboard.tsx`

**Step 1: Add SourceHealthWidget**

Simple dot grid showing 16 sources as colored dots (green ok, red failed):

```typescript
function SourceHealthWidget({ report }: { report: IntelReport }) {
  const okSet = new Set(report.sources_ok)
  const failSet = new Set(report.sources_failed)
  const all = [...report.sources_ok, ...report.sources_failed].sort()

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '1rem 1.25rem',
      boxShadow: 'var(--shadow-xs)',
    }}>
      <SectionLabel style={{ marginBottom: '0.625rem' }}>Source Health</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {all.map(source => (
          <div key={source} title={`${SENSOR_LABELS[source] ?? source}: ${okSet.has(source) ? 'OK' : 'Failed'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: okSet.has(source) ? 'var(--ok)' : 'var(--err)',
            }} />
            <span style={{
              fontSize: '0.5625rem', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace',
            }}>
              {(SENSOR_LABELS[source] ?? source).slice(0, 8)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Add AnimatePresence to SectionSummariesWidget expand/collapse**

Replace the instant `{isOpen && (...)}` with:

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ height: { duration: 0.25 }, opacity: { duration: 0.15 } }}
      style={{ overflow: 'hidden' }}
    >
      {/* section content */}
    </motion.div>
  )}
</AnimatePresence>
```

**Step 3: Add to dashboard layout**

```tsx
<StaggerChild index={8}>
  {report && <SourceHealthWidget report={report} />}
</StaggerChild>
```

**Step 4: Verify + Commit**

```bash
npx tsc --noEmit
npx vitest run
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): add source health dots, animate section expand/collapse"
```

---

### Task 8: Update DashboardSkeleton + Final Polish

**Files:**
- Modify: `.worktrees/dashboard-premium/frontend/src/components/Dashboard.tsx`

**Step 1: Update DashboardSkeleton**

- Add borderRadius 12px to all skeleton containers
- Add skeleton rows for the new widgets (ring gauge placeholder, distribution bar, heatmap, source health)
- Match the visual structure of the real layout

**Step 2: Update Trending widget rank numbers**

- Top 3 rank numbers: `color: 'var(--accent-dim)'` instead of `var(--border)`
- Add `hoursOnTrend` badge styling with "emerging" vs "sustained" label

**Step 3: Add responsive dashboard grid**

For the Sentiment + Distribution 2-column row, use:
```css
gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'
```
This naturally collapses to 1-column on mobile.

**Step 4: Final type-check and test run**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: All 533+ tests pass, no type errors.

**Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): skeleton updates, trending polish, responsive grid"
```

---

## Verification Checklist

After all tasks complete:

1. `npx tsc --noEmit` — zero errors
2. `npx vitest run` — all tests pass
3. Manual checks:
   - Dark mode: System Settings → Dark → dashboard auto-switches
   - Mobile (320px): stats strip doesn't overflow, heatmap scrolls
   - Desktop (1440px): sentiment + distribution side by side
   - Animations: stagger fade-in on load, section accordion smooth
   - Risk alert: only shows when risk_flags exist
   - Category bar: proportions match actual item counts
   - Sentiment ring: segments match positive/neutral/negative split
