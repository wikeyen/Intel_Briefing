# Stepper Phase Tooltips Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show soft-UI tooltips on hover over completed stepper nodes with phase-specific outcome metrics.

**Architecture:** Add a `derivePhaseTooltipData()` pure function that aggregates per-phase stats from `PipelineStatus`. Add hover state to `StepNode` and render a positioned tooltip below the node. Only show for terminal statuses (done/error/skipped).

**Tech Stack:** React state + inline styles + existing CSS custom properties (`--shadow-md`, `--surface-overlay`, `--border-subtle`)

---

### Task 1: Add i18n keys for tooltip labels

**Files:**
- Modify: `frontend/src/lib/i18n/locales/en.ts`
- Modify: `frontend/src/lib/i18n/locales/zh.ts`

**Step 1: Add English tooltip keys**

Add after the `log.phase_system` line (~line 562) in `en.ts`:

```typescript
  // ── Phase stepper tooltips ────────────────────────────────────────────────
  'stepper.fetched': 'fetched',
  'stepper.cached': 'cached',
  'stepper.failed': 'failed',
  'stepper.items': 'items',
  'stepper.summarized': 'summarized',
  'stepper.chunks': 'chunks',
  'stepper.skipped': 'Skipped',
  'stepper.status_ok': 'Completed',
  'stepper.status_failed': 'Failed',
```

**Step 2: Add Chinese tooltip keys**

Add matching keys in `zh.ts`:

```typescript
  // ── Phase stepper tooltips ────────────────────────────────────────────────
  'stepper.fetched': '已获取',
  'stepper.cached': '缓存',
  'stepper.failed': '失败',
  'stepper.items': '条目',
  'stepper.summarized': '已摘要',
  'stepper.chunks': '分块',
  'stepper.skipped': '已跳过',
  'stepper.status_ok': '已完成',
  'stepper.status_failed': '失败',
```

**Step 3: Commit**

```bash
git add frontend/src/lib/i18n/locales/en.ts frontend/src/lib/i18n/locales/zh.ts
git commit -m "feat(status): add i18n keys for stepper phase tooltips"
```

---

### Task 2: Add `derivePhaseTooltipData()` function

**Files:**
- Modify: `frontend/src/components/status/PhaseStepper.tsx` (add after `derivePhaseProgress`, ~line 180)

**Step 1: Define tooltip data interface and implement derivation**

Add this interface and function after `derivePhaseProgress()`:

```typescript
/** Per-phase tooltip data — only meaningful for terminal phases. */
export interface PhaseTooltipData {
  /** Lines to display in the tooltip, e.g. ["8 fetched", "2 cached", "1 failed", "42 items"] */
  lines: string[]
}

/**
 * Aggregate per-phase outcome stats from pipeline status.
 * Returns null for phases that haven't completed yet.
 */
export function derivePhaseTooltipData(
  ps: PipelineStatus | null,
  statuses: Record<PipelinePhaseStep, StepStatus>,
  t: (key: string) => string,
): Record<PipelinePhaseStep, PhaseTooltipData | null> {
  const result: Record<PipelinePhaseStep, PhaseTooltipData | null> = {
    fetch: null, retry: null, summary: null, briefing: null, intelligence: null,
  }
  if (!ps) return result

  const TERMINAL: StepStatus[] = ['done', 'error', 'skipped']

  // ── Fetch ──
  if (TERMINAL.includes(statuses.fetch)) {
    if (statuses.fetch === 'skipped') {
      result.fetch = { lines: [t('stepper.skipped')] }
    } else {
      const fetched = ps.sensors.filter(s => !s.fetch_cached && s.fetch === 'ok').length
      const cached = ps.sensors.filter(s => s.fetch_cached).length
      const failed = ps.sensors.filter(s => s.fetch === 'failed').length
      const items = ps.sensors.reduce((sum, s) => sum + s.item_count, 0)
      const lines: string[] = []
      if (fetched > 0) lines.push(`${fetched} ${t('stepper.fetched')}`)
      if (cached > 0) lines.push(`${cached} ${t('stepper.cached')}`)
      if (failed > 0) lines.push(`${failed} ${t('stepper.failed')}`)
      lines.push(`${items} ${t('stepper.items')}`)
      result.fetch = { lines }
    }
  }

  // ── Summary ──
  if (TERMINAL.includes(statuses.summary)) {
    if (statuses.summary === 'skipped') {
      result.summary = { lines: [t('stepper.skipped')] }
    } else {
      const summarized = ps.sensors.filter(s => s.summary === 'ok').length
      const failed = ps.sensors.filter(s => s.summary === 'failed').length
      const chunks = ps.sensors.reduce((sum, s) => sum + s.summary_chunks_done, 0)
      const lines: string[] = []
      if (summarized > 0) lines.push(`${summarized} ${t('stepper.summarized')}`)
      if (failed > 0) lines.push(`${failed} ${t('stepper.failed')}`)
      if (chunks > 0) lines.push(`${chunks} ${t('stepper.chunks')}`)
      result.summary = { lines }
    }
  }

  // ── Briefing ──
  if (TERMINAL.includes(statuses.briefing)) {
    if (statuses.briefing === 'skipped') {
      result.briefing = { lines: [t('stepper.skipped')] }
    } else {
      const statusLabel = statuses.briefing === 'done' ? t('stepper.status_ok') : t('stepper.status_failed')
      const lines = [statusLabel]
      if (ps.started_at && ps.completed_at) {
        const durMs = new Date(ps.completed_at).getTime() - new Date(ps.started_at).getTime()
        const durSec = Math.round(durMs / 1000)
        lines.push(durSec >= 60 ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : `${durSec}s`)
      }
      result.briefing = { lines }
    }
  }

  // ── Intelligence ──
  if (TERMINAL.includes(statuses.intelligence)) {
    if (statuses.intelligence === 'skipped') {
      result.intelligence = { lines: [t('stepper.skipped')] }
    } else {
      const statusLabel = statuses.intelligence === 'done' ? t('stepper.status_ok') : t('stepper.status_failed')
      const lines = [statusLabel]
      if (ps.started_at && ps.completed_at) {
        const durMs = new Date(ps.completed_at).getTime() - new Date(ps.started_at).getTime()
        const durSec = Math.round(durMs / 1000)
        lines.push(durSec >= 60 ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : `${durSec}s`)
      }
      result.intelligence = { lines }
    }
  }

  return result
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/status/PhaseStepper.tsx
git commit -m "feat(status): add derivePhaseTooltipData() for stepper tooltips"
```

---

### Task 3: Write tests for `derivePhaseTooltipData()`

**Files:**
- Create: `frontend/src/components/status/__tests__/PhaseStepper.test.ts`

**Step 1: Write the test file**

Tests should cover:
- Returns all nulls when `pipelineStatus` is null
- Returns all nulls when all phases are pending/active
- Fetch tooltip: counts fetched/cached/failed sensors + total items
- Summary tooltip: counts summarized/failed + chunks
- Briefing tooltip: shows status label + duration
- Intelligence tooltip: shows status label + duration
- Skipped phases show "Skipped"

Use a `makePipelineStatus()` helper that returns a minimal valid `PipelineStatus` object with sensible defaults, allowing overrides.

Mock `t()` as a passthrough `(key: string) => key`.

**Step 2: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/status/__tests__/PhaseStepper.test.ts
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add frontend/src/components/status/__tests__/PhaseStepper.test.ts
git commit -m "test(status): add tests for derivePhaseTooltipData"
```

---

### Task 4: Add tooltip component and hover state to StepNode

**Files:**
- Modify: `frontend/src/components/status/PhaseStepper.tsx`

**Step 1: Add tooltip fade keyframe to STEPPER_CSS**

Append to the existing `STEPPER_CSS` string:

```css
@keyframes tooltipFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**Step 2: Create `PhaseTooltip` component**

Add before the `PhaseStepper` export:

```typescript
function PhaseTooltip({ data }: { data: PhaseTooltipData }) {
  return (
    <div style={{
      position: 'absolute',
      top: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginTop: 8,
      padding: '6px 10px',
      background: 'var(--surface-overlay)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6,
      boxShadow: 'var(--shadow-md)',
      zIndex: 20,
      whiteSpace: 'nowrap',
      animation: 'tooltipFadeIn 200ms ease',
      pointerEvents: 'none',
    }}>
      {/* Upward caret */}
      <div style={{
        position: 'absolute',
        top: -4,
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: 8,
        height: 8,
        background: 'var(--surface-overlay)',
        borderTop: '1px solid var(--border-subtle)',
        borderLeft: '1px solid var(--border-subtle)',
      }} />
      {data.lines.map((line, i) => (
        <div key={i} style={{
          fontSize: '0.625rem',
          fontWeight: 500,
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-muted)',
          lineHeight: 1.5,
          letterSpacing: '0.02em',
        }}>
          {line}
        </div>
      ))}
    </div>
  )
}
```

**Step 3: Add `tooltipData` prop and hover state to `StepNode`**

Update the `StepNode` function signature to accept `tooltipData: PhaseTooltipData | null`:

Add `useState` import and hover state inside `StepNode`:
```typescript
const [hovered, setHovered] = useState(false)
```

Add `onMouseEnter` / `onMouseLeave` to the outer `<div>`:
```typescript
onMouseEnter={() => tooltipData && setHovered(true)}
onMouseLeave={() => setHovered(false)}
```

Render tooltip after the label `<span>`:
```typescript
{hovered && tooltipData && <PhaseTooltip data={tooltipData} />}
```

**Step 4: Wire tooltip data into PhaseStepper**

In the `PhaseStepper` component, compute tooltip data:
```typescript
const tooltipData = derivePhaseTooltipData(pipelineStatus, statuses, t)
```

Pass `tooltipData={tooltipData[step.key]}` to each `StepNode`.

**Step 5: Run tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests PASS (684 + new tooltip tests)

**Step 6: Commit**

```bash
git add frontend/src/components/status/PhaseStepper.tsx
git commit -m "feat(status): add soft-UI hover tooltips to stepper phase nodes"
```

---

### Task 5: Visual verification

**Step 1: Desktop verification (1280×800)**

Navigate to `http://localhost:8000/status`. Hover over each completed stepper node and verify:
- Tooltip appears below node with upward caret
- Content shows correct phase-specific metrics
- Soft UI styling: subtle shadow, rounded corners, smooth fade-in
- Tooltip disappears on mouse leave
- Pending/active nodes do NOT show tooltip

**Step 2: Mobile verification (390×844)**

Verify tooltips don't interfere with layout (pointer-events: none, no overflow).

**Step 3: Fix any visual issues found**
