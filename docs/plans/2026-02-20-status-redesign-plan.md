# Status Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the cluttered 5-section Status page with 3 clean zones — Action Bar, Sensor Table, Schedule Footer — with zero information duplication.

**Architecture:** Three new components (`ActionBar`, `SensorTable`, `ScheduleFooter`) replace five old ones (`HeroBanner`, `StatCards`, `SensorGrid`, `Console`, `StageBadge`). `Status.tsx` is simplified to wire data to the three zones. The page has two visual modes (idle and running) handled by the same components adapting their display.

**Tech Stack:** React 18, TypeScript, vitest + @testing-library/react, inline styles with CSS custom properties

**Design doc:** `docs/plans/2026-02-20-status-redesign-design.md`

---

## Context for the implementer

### Project structure
- Components live in `frontend/src/components/status/`
- Parent component: `frontend/src/components/Status.tsx`
- API types: `frontend/src/api/client.ts` — `HealthResponse`, `PipelineStatus`, `SensorJobProgress`, `RunMode`, `StageState`, `IntelReport`, `ConfigSettings`
- Design tokens: CSS custom properties in `frontend/src/app/globals.css` — `--ink`, `--accent`, `--ok`, `--warn`, `--err`, `--border`, `--surface`, `--canvas`, etc.
- Existing helpers: `frontend/src/components/status/time-helpers.ts` (`timeAgo`, `nextFetchIn`) — keep as-is
- Existing constants: `frontend/src/components/status/constants.ts` (`SECTION_SENSORS`, `SENSOR_LABEL_MAP`, `STATUS_META`, `ALL_SENSORS`) — keep as-is
- Test runner: `cd frontend && npx vitest run`
- All component files MUST start with a 2-line `// ABOUTME:` comment

### Key types you'll use

```typescript
// HealthResponse
{ status: 'ok' | 'stale' | 'no_data' | 'error', last_fetch: string | null }

// PipelineStatus
{ running: boolean, mode: RunMode, sensors: SensorJobProgress[], overall_summary: StageState, total_items: number, started_at: string | null, ... }

// SensorJobProgress
{ name: string, fetch: StageState, fetch_error: string | null, fetch_error_kind: 'config' | 'api' | null, summary: StageState, summary_error: string | null, item_count: number, summary_chunks_total: number, summary_chunks_done: number }

// StageState = 'queued' | 'running' | 'ok' | 'failed' | 'skipped'
// RunMode = 'fetch' | 'summarize' | 'fetch_summarize'

// IntelReport
{ sources_ok: string[], sources_failed: string[], items: Record<string, IntelItem[]>, ... }

// ConfigSettings has: sensors_enabled: Record<string, boolean>, fetch_time: string, fetch_timezone: string
```

### Design tokens reference (from globals.css)
- Surfaces: `--canvas` (#F8F7F4), `--surface` (#FFFFFF), `--surface-alt` (#F2F0EC)
- Text: `--ink` (#18181A), `--ink-muted` (#6B6968), `--ink-faint` (#AEABA6)
- Accent: `--accent` (#1D6B4F), `--accent-hover` (#165A41)
- Status: `--ok` (#16A34A), `--ok-bg`, `--warn` (#A16207), `--warn-bg`, `--err` (#B91C1C), `--err-bg`
- Borders: `--border` (#E0DDD7)

---

## Task 1: ActionBar Component (Zone 1)

**Files:**
- Create: `frontend/src/components/status/ActionBar.tsx`
- Create: `frontend/src/components/status/ActionBar.test.tsx`

### Step 1: Write the failing tests

Create `frontend/src/components/status/ActionBar.test.tsx`:

```tsx
// ABOUTME: Tests for the ActionBar component — Zone 1 of the Status page redesign.
// ABOUTME: Covers idle state, running state, mode selection, and run button behavior.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionBar } from './ActionBar'
import type { HealthResponse, PipelineStatus } from '@/api/client'

const healthOk: HealthResponse = { status: 'ok', last_fetch: '2026-02-20T05:44:00Z' }
const healthStale: HealthResponse = { status: 'stale', last_fetch: '2026-02-19T05:44:00Z' }
const healthNoData: HealthResponse = { status: 'no_data', last_fetch: null }

const idlePipeline: PipelineStatus = {
  running: false,
  mode: 'fetch_summarize',
  concurrency: 4,
  started_at: null,
  completed_at: null,
  sensors: [],
  overall_summary: 'skipped',
  total_items: 0,
}

describe('ActionBar', () => {
  const defaultProps = {
    health: healthOk,
    isRunning: false,
    phase: 'idle' as const,
    progress: { done: 0, total: 0 },
    fetching: false,
    onRun: vi.fn(),
  }

  it('shows health label and timestamp when idle', () => {
    render(<ActionBar {...defaultProps} />)
    expect(screen.getByText('Healthy')).toBeTruthy()
    // Timestamp should be present (relative time like "Xh ago")
    expect(screen.getByText(/ago/)).toBeTruthy()
  })

  it('shows "No Data" when health has no_data status', () => {
    render(<ActionBar {...defaultProps} health={healthNoData} />)
    expect(screen.getByText('No Data')).toBeTruthy()
  })

  it('shows "Stale" when health is stale', () => {
    render(<ActionBar {...defaultProps} health={healthStale} />)
    expect(screen.getByText('Stale')).toBeTruthy()
  })

  it('renders mode dropdown with default "Fetch + Summarize"', () => {
    render(<ActionBar {...defaultProps} />)
    expect(screen.getByRole('combobox')).toBeTruthy()
    expect(screen.getByDisplayValue('fetch_summarize')).toBeTruthy()
  })

  it('renders Run button', () => {
    render(<ActionBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /run/i })).toBeTruthy()
  })

  it('calls onRun with selected mode when Run is clicked', () => {
    const onRun = vi.fn()
    render(<ActionBar {...defaultProps} onRun={onRun} />)
    fireEvent.click(screen.getByRole('button', { name: /run/i }))
    expect(onRun).toHaveBeenCalledWith('fetch_summarize')
  })

  it('disables Run button when fetching', () => {
    render(<ActionBar {...defaultProps} fetching={true} />)
    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled()
  })

  it('shows progress info when running (fetching phase)', () => {
    render(<ActionBar {...defaultProps} isRunning={true} phase="fetching" progress={{ done: 7, total: 13 }} />)
    expect(screen.getByText(/Fetching/)).toBeTruthy()
    expect(screen.getByText(/7 of 13/)).toBeTruthy()
  })

  it('shows summarizing phase text', () => {
    render(<ActionBar {...defaultProps} isRunning={true} phase="summarizing" progress={{ done: 3, total: 13 }} />)
    expect(screen.getByText(/Summarizing/)).toBeTruthy()
    expect(screen.getByText(/3 of 13/)).toBeTruthy()
  })

  it('shows briefing phase text', () => {
    render(<ActionBar {...defaultProps} isRunning={true} phase="briefing" progress={{ done: 13, total: 13 }} />)
    expect(screen.getByText(/Generating briefing/)).toBeTruthy()
  })

  it('hides mode dropdown when running', () => {
    render(<ActionBar {...defaultProps} isRunning={true} phase="fetching" progress={{ done: 1, total: 13 }} />)
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('disables Run button and shows "Running…" when running', () => {
    render(<ActionBar {...defaultProps} isRunning={true} phase="fetching" progress={{ done: 1, total: 13 }} />)
    const btn = screen.getByRole('button', { name: /running/i })
    expect(btn).toBeDisabled()
  })
})
```

### Step 2: Run tests to verify they fail

```bash
cd frontend && npx vitest run src/components/status/ActionBar.test.tsx
```
Expected: FAIL — module `./ActionBar` not found.

### Step 3: Implement ActionBar

Create `frontend/src/components/status/ActionBar.tsx`:

```tsx
// ABOUTME: Slim action bar for the Status page — Zone 1 of the redesign.
// ABOUTME: Shows health status + timestamp when idle, progress + phase when running. Includes mode dropdown + Run button.
'use client'
import { useState } from 'react'
import type { HealthResponse, RunMode } from '@/api/client'
import { STATUS_META } from './constants'
import { timeAgo } from './time-helpers'

export type Phase = 'idle' | 'fetching' | 'summarizing' | 'briefing'

export interface ActionBarProps {
  health: HealthResponse | null
  isRunning: boolean
  phase: Phase
  progress: { done: number; total: number }
  fetching: boolean
  onRun: (mode: RunMode) => void
}

const MODE_OPTIONS: { value: RunMode; label: string }[] = [
  { value: 'fetch', label: 'Fetch' },
  { value: 'fetch_summarize', label: 'Fetch + Summarize' },
  { value: 'summarize', label: 'Summarize' },
]

export function ActionBar({ health, isRunning, phase, progress, fetching, onRun }: ActionBarProps) {
  const [selectedMode, setSelectedMode] = useState<RunMode>('fetch_summarize')

  const statusKey = health === null ? 'no_data' : (health.status ?? 'error')
  const meta = STATUS_META[statusKey]

  const disabled = fetching || isRunning

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const phaseLabel = (() => {
    if (!isRunning) return null
    switch (phase) {
      case 'fetching': return `Fetching · ${progress.done} of ${progress.total} sensors`
      case 'summarizing': return `Summarizing · ${progress.done} of ${progress.total} sensors`
      case 'briefing': return 'Generating briefing…'
      default: return 'Running…'
    }
  })()

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '0.75rem 1.25rem',
      marginBottom: '1.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        minHeight: 32,
      }}>
        {/* Left: status info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
          <span style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: isRunning ? 'var(--accent)' : meta.color,
            flexShrink: 0,
            animation: isRunning ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
          }} />
          {isRunning ? (
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)' }}>
              {phaseLabel}
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', minWidth: 0 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)' }}>
                {meta.label}
              </span>
              {health?.last_fetch && (
                <span
                  style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}
                  title={health.last_fetch.slice(0, 19).replace('T', ' ')}
                >
                  · {timeAgo(health.last_fetch)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
          {!isRunning && (
            <select
              value={selectedMode}
              onChange={e => setSelectedMode(e.target.value as RunMode)}
              disabled={disabled}
              style={{
                fontSize: '0.75rem',
                padding: '0.375rem 0.5rem',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--canvas)',
                color: 'var(--ink)',
                cursor: disabled ? 'default' : 'pointer',
                appearance: 'auto',
              }}
            >
              {MODE_OPTIONS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => onRun(selectedMode)}
            disabled={disabled}
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              padding: '0.4375rem 1.125rem',
              borderRadius: 7,
              border: 'none',
              color: disabled ? 'var(--ink-faint)' : '#FFFFFF',
              background: disabled ? 'var(--border)' : 'var(--accent)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'background 120ms',
              whiteSpace: 'nowrap',
            }}
          >
            {isRunning ? 'Running\u2026' : 'Run'}
          </button>
        </div>
      </div>

      {/* Thin progress bar at bottom edge — visible only when running */}
      {isRunning && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: 'var(--border)',
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--accent)',
            borderRadius: '0 2px 2px 0',
            transition: 'width 400ms ease',
          }} />
        </div>
      )}
    </div>
  )
}
```

### Step 4: Run tests to verify they pass

```bash
cd frontend && npx vitest run src/components/status/ActionBar.test.tsx
```
Expected: all tests PASS.

### Step 5: Commit

```bash
git add frontend/src/components/status/ActionBar.tsx frontend/src/components/status/ActionBar.test.tsx
git commit -m "feat(status): add ActionBar component (Zone 1)"
```

---

## Task 2: SensorTable Component (Zone 2)

**Files:**
- Create: `frontend/src/components/status/SensorTable.tsx`
- Create: `frontend/src/components/status/SensorTable.test.tsx`

### Step 1: Write the failing tests

Create `frontend/src/components/status/SensorTable.test.tsx`:

```tsx
// ABOUTME: Tests for the SensorTable component — Zone 2 of the Status page redesign.
// ABOUTME: Covers idle state, running state (collapsed/expanded), errors inline, no-data state.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SensorTable } from './SensorTable'
import type { IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress } from '@/api/client'

// Minimal fixtures
const mkSensor = (name: string, overrides: Partial<SensorJobProgress> = {}): SensorJobProgress => ({
  name,
  fetch: 'queued',
  fetch_error: null,
  fetch_error_kind: null,
  summary: 'queued',
  summary_error: null,
  item_count: 0,
  summary_chunks_total: 0,
  summary_chunks_done: 0,
  ...overrides,
})

const basePipeline: PipelineStatus = {
  running: false,
  mode: 'fetch_summarize',
  concurrency: 4,
  started_at: null,
  completed_at: null,
  sensors: [],
  overall_summary: 'skipped',
  total_items: 0,
}

const baseReport: IntelReport = {
  date: '2026-02-20',
  fetched_at: '2026-02-20T05:44:00Z',
  stale: false,
  sources_ok: ['hacker_news', 'github'],
  sources_failed: [],
  items: {
    tech_trends: Array.from({ length: 24 }, (_, i) => ({
      id: `hn-${i}`, source: 'hacker_news', title: `HN ${i}`, url: '#',
    })).concat(Array.from({ length: 3 }, (_, i) => ({
      id: `gh-${i}`, source: 'github', title: `GH ${i}`, url: '#',
    }))),
  },
}

const baseConfig: ConfigSettings = {
  sensors_enabled: { hacker_news: true, github: true, arxiv: true, social_accounts: false },
  fetch_time: '06:00',
  fetch_timezone: 'Asia/Shanghai',
} as ConfigSettings

describe('SensorTable', () => {
  const defaultProps = {
    isRunning: false,
    liveSensors: {} as Record<string, SensorJobProgress>,
    report: baseReport,
    config: baseConfig,
    pipelineStatus: basePipeline,
  }

  // ── Idle state ──

  it('renders section headers', () => {
    render(<SensorTable {...defaultProps} />)
    expect(screen.getByText('Tech Trends')).toBeTruthy()
    expect(screen.getByText('Research')).toBeTruthy()
    expect(screen.getByText('Social')).toBeTruthy()
  })

  it('renders sensor labels within sections', () => {
    render(<SensorTable {...defaultProps} />)
    expect(screen.getByText('Hacker News')).toBeTruthy()
    expect(screen.getByText('GitHub Trending')).toBeTruthy()
  })

  it('shows item count for successful sensors', () => {
    render(<SensorTable {...defaultProps} />)
    // Hacker News = 24 items in the fixture
    expect(screen.getByText('24')).toBeTruthy()
  })

  it('shows "Off" for disabled sensors', () => {
    render(<SensorTable {...defaultProps} />)
    expect(screen.getByText('Off')).toBeTruthy()
  })

  it('shows inline error text for config errors', () => {
    const pipeline = {
      ...basePipeline,
      sensors: [mkSensor('arxiv', { fetch: 'failed', fetch_error: 'Missing API key', fetch_error_kind: 'config' })],
    }
    const report = { ...baseReport, sources_failed: ['arxiv'] }
    render(<SensorTable {...defaultProps} report={report} pipelineStatus={pipeline} />)
    expect(screen.getByText(/Missing API key/)).toBeTruthy()
  })

  it('shows total items at the bottom', () => {
    render(<SensorTable {...defaultProps} />)
    expect(screen.getByText(/items total/)).toBeTruthy()
    expect(screen.getByText('27')).toBeTruthy()
  })

  // ── No-data state ──

  it('shows dashes when no report exists', () => {
    render(<SensorTable {...defaultProps} report={null} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  // ── Running state (collapsed) ──

  it('shows "Fetching…" for sensors currently fetching', () => {
    const liveSensors = { hacker_news: mkSensor('hacker_news', { fetch: 'running' }) }
    render(<SensorTable {...defaultProps} isRunning={true} liveSensors={liveSensors} />)
    expect(screen.getByText('Fetching…')).toBeTruthy()
  })

  it('shows "Summarizing…" for sensors currently summarizing', () => {
    const liveSensors = { hacker_news: mkSensor('hacker_news', { fetch: 'ok', item_count: 24, summary: 'running' }) }
    render(<SensorTable {...defaultProps} isRunning={true} liveSensors={liveSensors} />)
    expect(screen.getByText('Summarizing…')).toBeTruthy()
  })

  it('shows item count for sensors that finished fetching during a run', () => {
    const liveSensors = { hacker_news: mkSensor('hacker_news', { fetch: 'ok', item_count: 24, summary: 'queued' }) }
    render(<SensorTable {...defaultProps} isRunning={true} liveSensors={liveSensors} />)
    expect(screen.getByText('24')).toBeTruthy()
  })

  // ── Expanded detail ──

  it('shows stage detail when a running sensor row is clicked', () => {
    const liveSensors = { hacker_news: mkSensor('hacker_news', { fetch: 'ok', item_count: 24, summary: 'running' }) }
    render(<SensorTable {...defaultProps} isRunning={true} liveSensors={liveSensors} />)
    // Click Hacker News row to expand
    fireEvent.click(screen.getByText('Hacker News'))
    expect(screen.getByText('Fetch')).toBeTruthy()
    expect(screen.getByText('Summary')).toBeTruthy()
  })
})
```

### Step 2: Run tests to verify they fail

```bash
cd frontend && npx vitest run src/components/status/SensorTable.test.tsx
```
Expected: FAIL — module `./SensorTable` not found.

### Step 3: Implement SensorTable

Create `frontend/src/components/status/SensorTable.tsx`:

The component renders a flat list grouped by `SECTION_SENSORS`. Each section has:
- A section header row (label + section total, right-aligned)
- Sensor rows beneath it (indented)

Each sensor row shows:
- Status dot (color depends on state)
- Sensor label
- Right side: item count (idle), "Fetching…"/"Summarizing…" (running), error text (failed), "Off" (disabled), "—" (no data)

Clicking a sensor row during a run toggles an expanded detail view showing fetch + summary stage states.

Key implementation notes:
- Use `SECTION_SENSORS` from `./constants` to group sensors
- Use `SENSOR_LABEL_MAP` for labels
- Sensor item counts come from `report.items` — count items where `item.source === sensorKey`, except for the `social` section where items are in `report.items['social']`
- The expanded detail row renders inline beneath the sensor row
- Use a `Set<string>` in state to track which sensors are expanded
- Total items shown at the bottom

### Step 4: Run tests to verify they pass

```bash
cd frontend && npx vitest run src/components/status/SensorTable.test.tsx
```
Expected: all tests PASS.

### Step 5: Commit

```bash
git add frontend/src/components/status/SensorTable.tsx frontend/src/components/status/SensorTable.test.tsx
git commit -m "feat(status): add SensorTable component (Zone 2)"
```

---

## Task 3: ScheduleFooter Component (Zone 3)

**Files:**
- Create: `frontend/src/components/status/ScheduleFooter.tsx`
- Create: `frontend/src/components/status/ScheduleFooter.test.tsx`

### Step 1: Write the failing tests

Create `frontend/src/components/status/ScheduleFooter.test.tsx`:

```tsx
// ABOUTME: Tests for the ScheduleFooter component — Zone 3 of the Status page redesign.
// ABOUTME: Covers schedule display and fallback when config is not loaded.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScheduleFooter } from './ScheduleFooter'
import type { ConfigSettings } from '@/api/client'

const baseConfig = {
  fetch_time: '06:00',
  fetch_timezone: 'Asia/Shanghai',
} as ConfigSettings

describe('ScheduleFooter', () => {
  it('shows next run time and timezone', () => {
    render(<ScheduleFooter config={baseConfig} />)
    expect(screen.getByText(/06:00/)).toBeTruthy()
    expect(screen.getByText(/Asia\/Shanghai/)).toBeTruthy()
  })

  it('shows countdown text', () => {
    render(<ScheduleFooter config={baseConfig} />)
    expect(screen.getByText(/in \d+h?\s*\d*m/)).toBeTruthy()
  })

  it('shows fallback when config is null', () => {
    render(<ScheduleFooter config={null} />)
    expect(screen.getByText(/No scheduled run configured/)).toBeTruthy()
  })
})
```

### Step 2: Run tests to verify they fail

```bash
cd frontend && npx vitest run src/components/status/ScheduleFooter.test.tsx
```
Expected: FAIL — module `./ScheduleFooter` not found.

### Step 3: Implement ScheduleFooter

Create `frontend/src/components/status/ScheduleFooter.tsx`:

```tsx
// ABOUTME: Schedule footer for the Status page — Zone 3 of the redesign.
// ABOUTME: Shows the next scheduled pipeline run time with a live countdown.
import type { ConfigSettings } from '@/api/client'
import { nextFetchIn } from './time-helpers'

export interface ScheduleFooterProps {
  config: ConfigSettings | null
}

export function ScheduleFooter({ config }: ScheduleFooterProps) {
  if (!config) {
    return (
      <div style={{
        textAlign: 'center',
        fontSize: '0.75rem',
        color: 'var(--ink-faint)',
        padding: '1.5rem 0 0',
      }}>
        No scheduled run configured
      </div>
    )
  }

  return (
    <div style={{
      textAlign: 'center',
      fontSize: '0.75rem',
      color: 'var(--ink-muted)',
      padding: '1.5rem 0 0',
    }}>
      Next run:{' '}
      <span style={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: 'var(--ink)' }}>
        {config.fetch_time}
      </span>
      <span style={{ color: 'var(--ink-faint)', margin: '0 0.375rem' }}>·</span>
      {nextFetchIn(config.fetch_time, config.fetch_timezone)}
      <span style={{ color: 'var(--ink-faint)', margin: '0 0.375rem' }}>·</span>
      {config.fetch_timezone}
    </div>
  )
}
```

### Step 4: Run tests to verify they pass

```bash
cd frontend && npx vitest run src/components/status/ScheduleFooter.test.tsx
```
Expected: all tests PASS.

### Step 5: Commit

```bash
git add frontend/src/components/status/ScheduleFooter.tsx frontend/src/components/status/ScheduleFooter.test.tsx
git commit -m "feat(status): add ScheduleFooter component (Zone 3)"
```

---

## Task 4: Rewire Status.tsx and Delete Old Components

**Files:**
- Modify: `frontend/src/components/Status.tsx` — replace old component imports with new ones, simplify state
- Delete: `frontend/src/components/status/HeroBanner.tsx`
- Delete: `frontend/src/components/status/StatCards.tsx`
- Delete: `frontend/src/components/status/SensorGrid.tsx`
- Delete: `frontend/src/components/status/Console.tsx`
- Delete: `frontend/src/components/status/StageBadge.tsx`
- Modify: `frontend/src/app/globals.css` — remove dead CSS class rules

### Step 1: Rewrite Status.tsx

Replace the imports and JSX in `Status.tsx`:

**Remove these imports:**
```tsx
import { HeroBanner } from './status/HeroBanner'
import { StatCards } from './status/StatCards'
import { SensorGrid } from './status/SensorGrid'
import { Console } from './status/Console'
```

**Add these imports:**
```tsx
import { ActionBar } from './status/ActionBar'
import type { Phase } from './status/ActionBar'
import { SensorTable } from './status/SensorTable'
import { ScheduleFooter } from './status/ScheduleFooter'
```

**Simplify the computed state.** The parent still computes:
- `isRunning` (same logic as current)
- `liveSensors` (same lookup)
- `phase: Phase` — derived from `pipelineStatus`:
  ```tsx
  const phase: Phase = (() => {
    if (!isRunning) return 'idle'
    if (!pipelineStatus) return 'fetching'
    if (pipelineStatus.overall_summary === 'running') return 'briefing'
    const anySummary = pipelineStatus.sensors.some(s => s.summary === 'running')
    if (anySummary) return 'summarizing'
    return 'fetching'
  })()
  ```
- `progress: { done, total }` — count sensors that are done in the current phase:
  ```tsx
  const progress = (() => {
    if (!pipelineStatus) return { done: 0, total: 0 }
    const total = pipelineStatus.sensors.length
    if (phase === 'summarizing' || phase === 'briefing') {
      const done = pipelineStatus.sensors.filter(s => ['ok', 'failed', 'skipped'].includes(s.summary)).length
      return { done, total }
    }
    const done = pipelineStatus.sensors.filter(s => ['ok', 'failed', 'skipped'].includes(s.fetch)).length
    return { done, total }
  })()
  ```

**Remove:** `totalStages`, `doneStages`, `heroState`, `statusKey`, `meta`, `sensorCounts`, `totalItems`, `okCount`, `failedCount` — these are no longer needed in the parent. SensorTable computes its own counts internally.

**Replace the JSX return with:**
```tsx
return (
  <section id="status" style={{ padding: '4.5rem 0' }}>
    <div className="page-header" style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
        Status
      </h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
        Pipeline health, last run outcomes, and scheduled activity.
      </p>
    </div>

    <ActionBar
      health={health}
      isRunning={isRunning}
      phase={phase}
      progress={progress}
      fetching={fetching}
      onRun={handleRun}
    />

    <SensorTable
      isRunning={isRunning}
      liveSensors={liveSensors}
      report={report}
      config={config}
      pipelineStatus={pipelineStatus}
    />

    <ScheduleFooter config={config} />
  </section>
)
```

### Step 2: Delete old component files

```bash
rm frontend/src/components/status/HeroBanner.tsx
rm frontend/src/components/status/StatCards.tsx
rm frontend/src/components/status/SensorGrid.tsx
rm frontend/src/components/status/Console.tsx
rm frontend/src/components/status/StageBadge.tsx
```

### Step 3: Update globals.css

Remove these dead CSS rules (only if they're not used elsewhere — verify with grep first):
- `.stat-grid` responsive rule (line ~280-283)
- `.source-grid` responsive rule (line ~285-288)
- `.hero-row` responsive rule (line ~291-295)
- `.hero-actions` responsive rule (line ~296-301)
- `.hero-banner` responsive rule (line ~364-369)

Add a new responsive rule for the action bar if needed (test on mobile viewport first).

### Step 4: Run full test suite

```bash
cd frontend && npx vitest run
```
Expected: ALL tests pass. No regressions.

### Step 5: Visual verification

Start dev server and verify:
1. Idle state: Action bar shows health + timestamp + dropdown + Run button. Sensor table shows grouped list with counts. Schedule footer shows next run.
2. Trigger a run: Action bar shows progress. Sensor table shows live status. Clicking a row expands detail.
3. After run completes: everything returns to idle with fresh data.
4. Mobile viewport: everything stacks and looks clean.

### Step 6: Commit

```bash
git add -A
git commit -m "feat(status): rewire Status.tsx with new zones, delete old components"
```

---

## Implementation Order

1. **Task 1** — ActionBar (self-contained, no dependencies)
2. **Task 2** — SensorTable (self-contained, no dependencies)
3. **Task 3** — ScheduleFooter (self-contained, no dependencies)
4. **Task 4** — Rewire Status.tsx + delete old files (depends on Tasks 1-3)

Tasks 1-3 can be implemented in parallel if desired (they have no interdependencies).

## Verification

After all tasks:
```bash
cd frontend && npx vitest run       # all tests pass
```
Then start dev server and visually verify all states (idle, running, errors, mobile).
