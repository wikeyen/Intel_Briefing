# Pipeline Halt Banner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a persistent banner across all pages when the pipeline halts after retry exhaustion, with "Retry Failed" and "Skip & Continue" action buttons.

**Architecture:** Add a `retry_all` PauseAction to the orchestrator so the banner can retry all failed sensors in one call. Create a standalone `PipelineHaltBanner` component that polls pipeline status independently and renders in the UI shell above page content. No shared context needed — the banner and Status page poll independently.

**Tech Stack:** React + inline styles + existing CSS custom properties (`--warn-tint`, `--warn-border`, `--warn`) + existing API client

---

### Task 1: Add i18n keys for halt banner

**Files:**
- Modify: `frontend/src/lib/i18n/locales/en.ts`
- Modify: `frontend/src/lib/i18n/locales/zh.ts`

**Step 1: Add English keys**

Add after the stepper tooltip keys section in `en.ts`:

```typescript
  // ── Pipeline halt banner ───────────────────────────────────────────────────
  'halt.title': 'Pipeline halted',
  'halt.message': '{count} source(s) failed after retries',
  'halt.retry': 'Retry Failed',
  'halt.skip': 'Skip & Continue',
```

**Step 2: Add Chinese keys**

Add matching keys in `zh.ts`:

```typescript
  // ── Pipeline halt banner ───────────────────────────────────────────────────
  'halt.title': '流水线已暂停',
  'halt.message': '{count} 个源重试后仍失败',
  'halt.retry': '重试失败项',
  'halt.skip': '跳过并继续',
```

**Step 3: Commit**

```bash
git add frontend/src/lib/i18n/locales/en.ts frontend/src/lib/i18n/locales/zh.ts
git commit -m "feat(status): add i18n keys for pipeline halt banner"
```

---

### Task 2: Add `retry_all` action to backend

**Files:**
- Modify: `frontend/src/lib/pipeline/orchestrator.ts`
- Modify: `frontend/src/app/api/fetch/resume/route.ts`
- Modify: `frontend/src/api/client.ts`

**Step 1: Add `retry_all` to PauseAction type**

In `orchestrator.ts`, line 37–41, add the new action variant:

```typescript
export type PauseAction =
  | { type: 'retry_sensor'; sensor: string }
  | { type: 'retry_all' }
  | { type: 'skip_sensor'; sensor: string }
  | { type: 'generate_overall' }
  | { type: 'cancel' }
```

**Step 2: Add `retryAllFailed()` export function**

In `orchestrator.ts`, after `generateOverall()` (~line 118), add:

```typescript
/** Retry all failed sensors during pre-overall pause. */
export function retryAllFailed(): boolean {
  if (!g.__pipelinePauseResolve) return false
  g.__pipelinePauseResolve({ type: 'retry_all' })
  g.__pipelinePauseResolve = null
  return true
}
```

**Step 3: Handle `retry_all` in the pause loop**

In `orchestrator.ts`, inside the pause loop (~line 729, after the `retry_sensor` block ending at line 773), add:

```typescript
            if (action.type === 'retry_all') {
              const retryNames = [...failedSensors].filter(name => {
                const sp = tracker.getSensorProgress(name)
                return sp?.fetch_error_kind !== 'config'
              })
              tracker.addEvent('info', 'retry', `Retrying all ${retryNames.length} failed sensor(s)`)

              for (const sensorName of retryNames) {
                if (signal.aborted) break
                tracker.resetFetchState(sensorName)
                tracker.resetSummaryState(sensorName)
                tracker.setFetchState(sensorName, 'running')

                const result = await fetchSensor(sensorName, config, (detail, itemCount) => {
                  tracker.setFetchDetail(sensorName, detail, itemCount)
                })

                if (signal.aborted) break

                if (sensorResultSucceeded(result)) {
                  tracker.setFetchState(sensorName, 'ok', result.items.length)
                  tracker.addEvent('ok', 'retry', `Retry succeeded — ${result.items.length} items`, sensorName)
                  failedSensors.delete(sensorName)
                  mergeRetryResult(sourceReport, result)
                  await writeReport(sourceReport).catch(() => {})
                  if (!sourceReport.sources_ok.includes(sensorName)) {
                    sourceReport.sources_ok.push(sensorName)
                  }
                  sourceReport.sources_failed = sourceReport.sources_failed.filter(n => n !== sensorName)
                  const sensorSummary = await summarizeSingleSensor(sourceReport, sensorName, {
                    ...baseSummarizeOpts,
                    skipCache: true,
                  })
                  if (sensorSummary && summary) {
                    mergeSensorSummary(summary, sensorSummary)
                  }
                } else {
                  tracker.setFetchState(sensorName, 'failed', 0, result.error, result.error_kind ?? 'api')
                  tracker.addEvent('error', 'retry', result.error ?? 'Retry failed', sensorName)
                }
              }
            }
```

**Note:** This reuses the exact same retry logic from `retry_sensor` but loops through all retryable sensors without re-pausing between each. After the loop, the while-loop condition checks `failedSensors.size > 0` — if all retries succeeded, the pipeline proceeds; if any still failed, it re-pauses for another user decision.

**Step 4: Add `retry_all` to resume API route**

In `resume/route.ts`, add `'retry_all'` to `VALID_ACTIONS` (line 14):

```typescript
const VALID_ACTIONS = ['proceed', 'retry_sensor', 'retry_all', 'skip_sensor', 'skip_fetching_sensor', 'generate_overall'] as const
```

Add the import of `retryAllFailed` (line 4–12):

```typescript
import {
  skipPipelineRetries,
  isPipelineRunning,
  isPipelinePaused,
  retrySensor,
  retryAllFailed,
  skipSensor,
  skipFetchingSensor,
  generateOverall,
} from '@/lib/pipeline/orchestrator'
```

Add the handler after the `retry_sensor` block (~line 72):

```typescript
  if (action === 'retry_all') {
    const ok = retryAllFailed()
    if (!ok) return NextResponse.json({ error: 'Failed to retry all' }, { status: 500 })
    return NextResponse.json({ status: 'retrying_all_failed' })
  }
```

**Step 5: Add `retry_all` to frontend API client**

In `client.ts`, update the `resumePipeline` action type to include `'retry_all'`:

```typescript
  resumePipeline: (action: 'proceed' | 'retry_sensor' | 'retry_all' | 'skip_sensor' | 'skip_fetching_sensor' | 'generate_overall', sensors?: string[]) =>
```

**Step 6: Commit**

```bash
git add frontend/src/lib/pipeline/orchestrator.ts frontend/src/app/api/fetch/resume/route.ts frontend/src/api/client.ts
git commit -m "feat(pipeline): add retry_all action to retry all failed sensors at once"
```

---

### Task 3: Create PipelineHaltBanner component

**Files:**
- Create: `frontend/src/components/PipelineHaltBanner.tsx`
- Modify: `frontend/src/app/globals.css`

**Step 1: Create the component**

Create `frontend/src/components/PipelineHaltBanner.tsx`:

```typescript
// ABOUTME: Persistent banner shown across all pages when the pipeline halts after retry exhaustion.
// ABOUTME: Offers "Retry Failed" and "Skip & Continue" actions to resume the pipeline.
'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, PipelineStatus } from '@/api/client'
import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/lib/toast-context'

/** Poll pipeline status and show a halt banner when paused at pre_overall with failed sensors. */
export function PipelineHaltBanner() {
  const { t } = useTranslation()
  const showToast = useToast()
  const [status, setStatus] = useState<PipelineStatus | null>(null)
  const [acting, setActing] = useState(false)

  // Poll pipeline status
  useEffect(() => {
    let cancelled = false
    const poll = () => {
      api.getPipelineStatus()
        .then(s => { if (!cancelled) setStatus(s) })
        .catch(() => {})
    }
    poll()
    const isActive = status?.running || status?.paused
    const iv = setInterval(poll, isActive ? 3_000 : 30_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [status?.running, status?.paused])

  const isHalted = status?.paused && status?.paused_stage === 'pre_overall' && status?.alive
  const failedSensors = status?.sensors.filter(s => s.fetch === 'failed') ?? []
  const failedCount = failedSensors.length

  const handleRetry = useCallback(async () => {
    setActing(true)
    try {
      await api.resumePipeline('retry_all')
      showToast(t('halt.retry') + '…')
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    } finally {
      setActing(false)
    }
  }, [showToast, t])

  const handleSkip = useCallback(async () => {
    setActing(true)
    try {
      await api.resumePipeline('generate_overall')
      showToast(t('halt.skip') + '…')
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    } finally {
      setActing(false)
    }
  }, [showToast, t])

  if (!isHalted || failedCount === 0) return null

  return (
    <div style={{
      background: 'var(--warn-tint)',
      border: '1px solid var(--warn-border)',
      borderRadius: 8,
      padding: '0.75rem 1rem',
      margin: '0.75rem 0.75rem 0',
    }}>
      <div className="halt-banner-layout" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--warn)',
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--warn-text)',
            whiteSpace: 'nowrap',
          }}>
            {t('halt.title')}
          </span>
          <span style={{
            fontSize: '0.75rem',
            color: 'var(--ink-muted)',
          }}>
            {t('halt.message', { count: String(failedCount) })}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <button
            onClick={handleRetry}
            disabled={acting}
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--ink-muted)',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '0.375rem 0.75rem',
              cursor: acting ? 'not-allowed' : 'pointer',
              opacity: acting ? 0.5 : 1,
              transition: 'border-color 100ms',
            }}
          >
            {t('halt.retry')}
          </button>
          <button
            onClick={handleSkip}
            disabled={acting}
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--canvas)',
              background: 'var(--ink)',
              border: 'none',
              borderRadius: 4,
              padding: '0.375rem 0.75rem',
              cursor: acting ? 'not-allowed' : 'pointer',
              opacity: acting ? 0.5 : 1,
              transition: 'background 100ms',
            }}
          >
            {t('halt.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Add mobile responsive CSS**

In `frontend/src/app/globals.css`, add inside the existing `@media (max-width: 768px)` block:

```css
  .halt-banner-layout {
    flex-direction: column;
    align-items: flex-start !important;
  }
```

**Step 3: Commit**

```bash
git add frontend/src/components/PipelineHaltBanner.tsx frontend/src/app/globals.css
git commit -m "feat(status): add PipelineHaltBanner component for pipeline halt notifications"
```

---

### Task 4: Wire banner into UI shell

**Files:**
- Modify: `frontend/src/app/(ui)/UiLayoutClient.tsx`

**Step 1: Import and render PipelineHaltBanner**

Add import at the top of `UiLayoutClient.tsx`:

```typescript
import { PipelineHaltBanner } from '@/components/PipelineHaltBanner'
```

In the `UiShell` function, add the banner inside `<main>` just before `{children}` (~line 162):

Change:
```tsx
      <main ref={mainRef} className="main-content" style={{...}}>
        {children}
      </main>
```

To:
```tsx
      <main ref={mainRef} className="main-content" style={{...}}>
        <PipelineHaltBanner />
        {children}
      </main>
```

**Step 2: Run tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass (the banner is a client component that renders null by default — no API in test env).

**Step 3: Commit**

```bash
git add frontend/src/app/\(ui\)/UiLayoutClient.tsx
git commit -m "feat(status): wire PipelineHaltBanner into UI shell layout"
```

---

### Task 5: Tests

**Files:**
- Create: `frontend/src/components/__tests__/PipelineHaltBanner.test.tsx`

**Step 1: Write tests**

Tests should cover:
- Returns `null` when pipeline status fetch returns non-paused state
- Shows banner with correct failed count when paused at `pre_overall` with failed sensors
- "Retry Failed" button calls `api.resumePipeline('retry_all')`
- "Skip & Continue" button calls `api.resumePipeline('generate_overall')`
- Buttons are disabled while an action is in flight

Mock `api.getPipelineStatus` and `api.resumePipeline` using `vi.mock('@/api/client')`. Use `@testing-library/react` for rendering and user interaction. Use `makePipelineStatus` and `makeSensorJob` from `src/components/status/test-helpers.ts` to build fixture data.

**Step 2: Run tests**

```bash
cd frontend && npx vitest run src/components/__tests__/PipelineHaltBanner.test.tsx
```

Expected: All tests PASS.

**Step 3: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests PASS.

**Step 4: Commit**

```bash
git add frontend/src/components/__tests__/PipelineHaltBanner.test.tsx
git commit -m "test(status): add tests for PipelineHaltBanner component"
```

---

### Task 6: Visual verification

**Step 1: Desktop verification (1280×800)**

Navigate to `http://localhost:8000/status`. If the pipeline is currently paused at `pre_overall`, verify:
- Banner appears at top of page content area
- Shows warn-tinted background with yellow dot
- Text shows "Pipeline halted — N source(s) failed after retries"
- Two buttons: "Retry Failed" (ghost) and "Skip & Continue" (solid)
- Banner appears on other pages too (e.g. `/dashboard`, `/data`)

If pipeline is not paused, test by temporarily simulating the halted state (trigger a pipeline run with a known-bad sensor, or mock the API response).

**Step 2: Mobile verification (390×844)**

Verify:
- Banner stacks vertically (text on top, buttons below)
- No horizontal overflow
- Buttons are tappable

**Step 3: Fix any visual issues found**
