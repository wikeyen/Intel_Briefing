# Orchestrator State Machine Refactoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 751-line `runPipeline` god function with an explicit state machine, fix summary failures silently skipping, and eliminate duplicated code.

**Architecture:** State machine dispatch loop with typed `PipelineContext`. Each state maps to one focused async handler. Unified `failures` set routes both fetch and summary failures to a single `paused` state. Module-level `activePipeline` replaces 8 `globalThis` singletons.

**Tech Stack:** TypeScript, Vitest

**Working directory:** `frontend/` (all paths relative to this)

**Reference files:**
- Current orchestrator: `src/lib/pipeline/orchestrator.ts` (1007 lines — the file being replaced)
- Tracker: `src/lib/pipeline/progress.ts`
- Resume route: `src/app/api/fetch/resume/route.ts`
- Existing tests: `src/lib/pipeline/orchestrator.test.ts` (719 lines)
- Models: `src/lib/models.ts` (PipelineStatus, SensorResult, IntelReport, etc.)

---

### Task 1: Create types.ts — State machine types and PipelineContext

**Files:**
- Create: `src/lib/pipeline/types.ts`
- Test: existing tests pass (no behavior change)

**Context:** This defines the shared types that all state handlers and the orchestrator will use. `PipelineContext` replaces the 8 `globalThis` singletons. `PipelineState` is the state machine's state enum. `StateHandler` is the function signature for each handler.

**Step 1: Create the types file**

```typescript
// ABOUTME: Pipeline state machine types — defines states, context, and handler signatures.
// ABOUTME: PipelineContext replaces globalThis singletons; flows through all state handlers.
import type { ConfigSettings, IntelReport, RunMode, BriefingSummary, SummaryProgress } from '../models'
import type { PipelineProgressTracker } from './progress'
import type { LlmConfig } from '../summary/llm'
import type { SummaryProgressCallback } from '../summary/summarizer'
import type { createBus } from '../summary/events'

export type PipelineState =
  | 'setup'
  | 'fetching'
  | 'fetch_retry'
  | 'summarizing'
  | 'summary_retry'
  | 'paused'
  | 'briefing'
  | 'intelligence'
  | 'complete'
  | 'cancelled'

export type PauseAction =
  | { type: 'retry_sensor'; sensor: string }
  | { type: 'retry_all' }
  | { type: 'skip_sensor'; sensor: string }
  | { type: 'generate_overall' }
  | { type: 'cancel' }

export type FailureKind = 'api' | 'config' | 'summary'

export type StateHandler = (ctx: PipelineContext) => Promise<PipelineState>

export interface PipelineContext {
  // Immutable after setup
  config: ConfigSettings
  signal: AbortSignal
  abortController: AbortController
  mode: RunMode
  allEnabledSensors: string[]
  sensorsToFetch: string[]
  trackerSensorNames: string[]
  llmConfig: LlmConfig | null
  concurrency: number
  summaryConcurrency: number
  isIncrementalRun: boolean
  sensorFilter?: string[]

  // Mutable shared state
  tracker: PipelineProgressTracker
  report: IntelReport | null
  summary: BriefingSummary | null
  cachedReport: IntelReport | null
  cachedSensorItems: Map<string, { items: unknown[]; fetchedAt: string }>
  failures: Set<string>
  failureKinds: Map<string, FailureKind>
  skippedSensors: Set<string>
  sensorSkips: Map<string, () => void>
  skipRetries: boolean
  enabledSensors: Set<string>

  // Summary cross-page state
  summaryStatus: SummaryProgress | null
  summaryBus: ReturnType<typeof createBus> | null
  onProgress: SummaryProgressCallback | null
  baseSummarizeOpts: Record<string, unknown> | null

  // Pause/resume channel
  pauseResolve: ((action: PauseAction) => void) | null
}
```

**Step 2: Verify existing tests still pass (no imports changed yet)**

Run: `npx vitest run src/lib/pipeline/orchestrator.test.ts`
Expected: all tests pass (we only created a new file, no changes to existing code)

**Step 3: Commit**

```bash
git add src/lib/pipeline/types.ts
git commit -m "refactor(pipeline): add state machine types and PipelineContext"
```

---

### Task 2: Create helpers.ts — Extracted shared functions

**Files:**
- Create: `src/lib/pipeline/helpers.ts`
- Reference: `src/lib/pipeline/orchestrator.ts:141-159` (fetchSensor), `959-1007` (mergeRetryResult, mergeSensorSummary, extractSensorNames), `853-875` (intelligence block)

**Context:** These are pure/utility functions extracted from the orchestrator. `fetchSensor`, `mergeRetryResult`, `mergeSensorSummary`, and `extractSensorNames` are moved as-is. `retryOneSensor` is new — it deduplicates the retry_sensor/retry_all logic. `runIntelligence` deduplicates the intelligence block.

**Step 1: Create helpers.ts**

```typescript
// ABOUTME: Pipeline helper functions — shared utilities used by state handlers.
// ABOUTME: Extracted from orchestrator to eliminate duplication and enable independent testing.
import type { SensorResult, IntelReport, BriefingSummary } from '../models'
import type { PipelineContext, FailureKind } from './types'
import { sensorResultSucceeded, sensorLimit } from '../models'
import { SENSOR_REGISTRY } from '../sensors'
import { SensorConfigError } from '../sensors/errors'
import { SENSOR_CATEGORY_MAP } from '../sensors/taxonomy'
import type { CategoryKey } from '../sensors/taxonomy'
import { writeReport } from './cache'
import { summarizeSingleSensor } from '../summary/summarizer'
import { runIntelligenceAnalysis } from './intelligence'
import { writeIntelligence } from './intelligence-cache'
import type { LlmConfig } from '../summary/llm'

export const MAX_AUTO_RETRIES = 3

/**
 * Run a single sensor's fetch function and return a SensorResult.
 * Catches all errors so one failing sensor never blocks the pipeline.
 */
export async function fetchSensor(
  name: string,
  config: import('../models').ConfigSettings,
  onProgress?: (detail: string, itemCount?: number) => void,
): Promise<SensorResult> {
  const fetchFn = SENSOR_REGISTRY[name]
  if (!fetchFn) {
    return { sensor_name: name, items: [], error: `Unknown sensor: ${name}`, error_kind: 'config' }
  }
  const limit = sensorLimit(config, name)
  try {
    const items = await fetchFn(config, limit, onProgress)
    return { sensor_name: name, items, error: null, error_kind: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isConfig = err instanceof SensorConfigError
    return { sensor_name: name, items: [], error: message, error_kind: isConfig ? 'config' : 'api' }
  }
}

/**
 * Retry a single failed sensor: re-fetch, merge into report, re-summarize.
 * Used by both retry_sensor and retry_all pause actions.
 * Returns true if the retry succeeded.
 */
export async function retryOneSensor(ctx: PipelineContext, sensorName: string): Promise<boolean> {
  const failureKind = ctx.failureKinds.get(sensorName)

  ctx.tracker.resetFetchState(sensorName)
  ctx.tracker.resetSummaryState(sensorName)

  // Summary-only failures don't need re-fetching
  if (failureKind === 'summary' && ctx.report) {
    ctx.tracker.setFetchState(sensorName, 'skipped', 0)
  } else {
    ctx.tracker.setFetchState(sensorName, 'running')

    const result = await fetchSensor(sensorName, ctx.config, (detail, itemCount) => {
      ctx.tracker.setFetchDetail(sensorName, detail, itemCount)
    })

    if (ctx.signal.aborted) return false

    if (!sensorResultSucceeded(result)) {
      ctx.tracker.setFetchState(sensorName, 'failed', 0, result.error, result.error_kind ?? 'api')
      ctx.tracker.addEvent('error', 'retry', result.error ?? 'Retry failed', sensorName)
      return false
    }

    ctx.tracker.setFetchState(sensorName, 'ok', result.items.length)
    ctx.tracker.addEvent('ok', 'retry', `Retry succeeded — ${result.items.length} items`, sensorName)

    // Merge into report
    mergeRetryResult(ctx.report!, result)
    await writeReport(ctx.report!).catch(() => {})

    if (!ctx.report!.sources_ok.includes(sensorName)) {
      ctx.report!.sources_ok.push(sensorName)
    }
    ctx.report!.sources_failed = ctx.report!.sources_failed.filter(n => n !== sensorName)
  }

  // Re-summarize this sensor
  if (ctx.baseSummarizeOpts) {
    const sensorSummary = await summarizeSingleSensor(ctx.report!, sensorName, {
      ...(ctx.baseSummarizeOpts as Parameters<typeof summarizeSingleSensor>[2]),
      skipCache: true,
    })
    if (sensorSummary && ctx.summary) {
      mergeSensorSummary(ctx.summary, sensorSummary)
    }
  }

  ctx.failures.delete(sensorName)
  ctx.failureKinds.delete(sensorName)
  return true
}

/**
 * Run intelligence analysis. Deduplicated from two identical blocks.
 */
export async function runIntelligence(
  report: IntelReport,
  llmConfig: LlmConfig,
  signal: AbortSignal,
  language: string,
  tracker: import('./progress').PipelineProgressTracker,
): Promise<void> {
  tracker.addEvent('info', 'intelligence', 'Intelligence analysis started')
  try {
    const intelligence = await runIntelligenceAnalysis(report, llmConfig, signal, language)

    if (intelligence.trend === null) tracker.addEvent('warn', 'intelligence', 'Trend analysis returned no results')
    if (intelligence.topics === null) tracker.addEvent('warn', 'intelligence', 'Topic analysis returned no results')
    if (intelligence.accounts === null) tracker.addEvent('warn', 'intelligence', 'Account analysis returned no results')

    const hasData = intelligence.trend !== null || intelligence.topics !== null || intelligence.accounts !== null
    if (hasData) {
      await writeIntelligence(intelligence)
      tracker.addEvent('ok', 'intelligence', 'Intelligence analysis complete')
    } else {
      tracker.addEvent('warn', 'intelligence', 'Intelligence analysis produced no results (LLM may have failed)')
    }
  } catch (err) {
    console.error('Intelligence analysis failed:', err)
    tracker.addEvent('warn', 'intelligence', `Intelligence analysis failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Merge a retry result into the existing report: remove old items by source, insert new ones.
 * Uses the sensor taxonomy to place items in the correct category section.
 * Mutates the report in place.
 */
export function mergeRetryResult(report: IntelReport, result: SensorResult): void {
  for (const section of Object.values(report.items)) {
    for (let i = section.length - 1; i >= 0; i--) {
      if (section[i].source === result.sensor_name) {
        section.splice(i, 1)
      }
    }
  }
  const category = SENSOR_CATEGORY_MAP[result.sensor_name] as CategoryKey | undefined
  for (const item of result.items) {
    const targetSection = category ? report.items[category] : undefined
    if (targetSection) {
      targetSection.push(item)
    } else {
      const sections = Object.values(report.items)
      if (sections.length > 0) {
        sections[0].push(item)
      }
    }
  }
}

/**
 * Merge a single sensor's summary into the existing BriefingSummary.
 * Replaces the matching section by sensor_name, or appends if new.
 */
export function mergeSensorSummary(summary: BriefingSummary, sensorSummary: import('../models').SensorSummary): void {
  const idx = summary.sections.findIndex(s => s.sensor_name === sensorSummary.sensor_name)
  if (idx >= 0) {
    summary.sections[idx] = sensorSummary
  } else {
    summary.sections.push(sensorSummary)
  }
}

/** Extract unique sensor names from a report's items. */
export function extractSensorNames(report: IntelReport): string[] {
  const names = new Set<string>()
  for (const section of Object.values(report.items)) {
    for (const item of section) {
      names.add(item.source)
    }
  }
  return Array.from(names)
}

/** Build an LlmConfig from ConfigSettings, or return null if not configured. */
export function buildLlmConfig(config: import('../models').ConfigSettings): LlmConfig | null {
  if (!config.summary_provider) return null
  return {
    base_url: config.summary_base_url,
    api_key: config.summary_api_key,
    model: config.summary_model,
  }
}

/** Build an LlmConfig for attribution calls, or return null if not configured. */
export function buildAttributionLlmConfig(config: import('../models').ConfigSettings): LlmConfig | null {
  if (!config.summary_provider) return null
  if (!config.summary_attribution_model) return null
  return {
    base_url: config.summary_base_url,
    api_key: config.summary_api_key,
    model: config.summary_attribution_model,
  }
}
```

**Step 2: Verify existing tests still pass**

Run: `npx vitest run src/lib/pipeline/orchestrator.test.ts`
Expected: all tests pass

**Step 3: Commit**

```bash
git add src/lib/pipeline/helpers.ts
git commit -m "refactor(pipeline): extract shared helpers from orchestrator"
```

---

### Task 3: Create state handlers — setup, fetching, fetch-retry

**Files:**
- Create: `src/lib/pipeline/states/setup.ts`
- Create: `src/lib/pipeline/states/fetching.ts`
- Create: `src/lib/pipeline/states/fetch-retry.ts`

**Context:** These handle the fetch phase. `handleSetup` does mode routing, cache checks, incremental run detection, and early exit. `handleFetching` runs concurrent sensor fetches via Semaphore with per-sensor skip race. `handleFetchRetry` auto-retries failed sensors up to MAX_AUTO_RETRIES, then transitions to `paused` if failures remain.

**Step 1: Create setup.ts**

Extract from orchestrator.ts lines 215-361. This handler resolves mode, computes sensor lists, checks for incremental cache hits, and handles the early-exit path (all cached + existing analysis).

The handler returns:
- `'complete'` if all sensors cached AND existing summary+intelligence valid
- `'fetching'` if fetch is needed
- `'summarizing'` if summarize-only mode (fetch skipped)

Key: this handler populates `ctx.cachedSensorItems`, `ctx.sensorsToFetch`, `ctx.cachedReport`, etc.

```typescript
// ABOUTME: Setup state handler — mode routing, cache checks, sensor list computation.
// ABOUTME: Returns 'fetching', 'summarizing', or 'complete' based on mode and cache state.
```

**Step 2: Create fetching.ts**

Extract from orchestrator.ts lines 385-546. This handler:
1. Creates per-sensor skip promises (`ctx.sensorSkips`)
2. Runs `fetchBatch` — concurrent fetch via Semaphore with skip race
3. Merges cached sensor items into result map
4. Calls `assembleReport()` to build the report
5. Marks failed/skipped sensor summaries as skipped
6. Invalidates summary caches for re-summarization

Returns:
- `'cancelled'` if signal aborted during fetch
- `'fetch_retry'` if there are failures and should summarize
- `'summarizing'` if no failures (or fetch-only mode)
- `'complete'` if fetch-only mode

```typescript
// ABOUTME: Fetching state handler — concurrent sensor fetch with semaphore and per-sensor skip.
// ABOUTME: Populates ctx.report and ctx.failures, then transitions to retry or summarize.
```

**Step 3: Create fetch-retry.ts**

Extract from orchestrator.ts lines 457-480. Auto-retry loop. **Key behavioral change: transitions to `'paused'` when retries exhausted with remaining failures.**

```typescript
// ABOUTME: Fetch retry state handler — auto-retries failed sensors up to MAX_AUTO_RETRIES.
// ABOUTME: Transitions to 'paused' if failures remain after retries (user decides).
```

Returns:
- `'fetching'` (loops back for another retry pass — NOT needed, retry loop is internal)
- `'paused'` if failures remain after MAX_AUTO_RETRIES
- `'summarizing'` if all failures recovered or fetch-only

**Step 4: Verify tests pass, commit**

Run: `npx vitest run src/lib/pipeline/orchestrator.test.ts`

```bash
git add src/lib/pipeline/states/
git commit -m "refactor(pipeline): add setup, fetching, and fetch-retry state handlers"
```

---

### Task 4: Create state handlers — summarizing, summary-retry

**Files:**
- Create: `src/lib/pipeline/states/summarizing.ts`
- Create: `src/lib/pipeline/states/summary-retry.ts`

**Context:** `handleSummarizing` delegates to the unified summarization engine and tracks per-sensor failures. It sets up the `onProgress` bridge, `summaryBus`, and `baseSummarizeOpts` on the context. `handleSummaryRetry` auto-retries failed summaries. **Key behavioral fix: transitions to `'paused'` when summary retries are exhausted with remaining failures.**

**Step 1: Create summarizing.ts**

Extract from orchestrator.ts lines 548-663. This handler:
1. Resolves `sourceReport` (fresh or cached)
2. Builds `SummaryProgress` for cross-page awareness
3. Creates `summaryBus` for SSE streaming
4. Sets up `onProgress` callback bridge (extracted from lines 586-629)
5. Builds `baseSummarizeOpts`
6. Calls `summarizeReport()` — first attempt
7. Checks for per-sensor summary failures

Returns:
- `'summary_retry'` if there are summary failures
- `'paused'` if there are fetch failures (defer overall)
- `'briefing'` if all summaries succeeded and no deferred overall
- `'complete'` if no sourceReport

The `onProgress` callback bridge should be simplified: update tracker state + emit to SSE bus + update summaryStatus. Same logic as current lines 586-629 but as a named function on ctx.

```typescript
// ABOUTME: Summarizing state handler — delegates to unified summarization engine.
// ABOUTME: Sets up progress bridge, tracks failures, transitions to retry or briefing.
```

**Step 2: Create summary-retry.ts**

Extract from orchestrator.ts lines 656-704. Auto-retry loop for summary failures. **Key: transitions to `'paused'` instead of silently proceeding.**

```typescript
// ABOUTME: Summary retry state handler — auto-retries failed per-sensor summaries.
// ABOUTME: Transitions to 'paused' if failures remain after MAX_AUTO_RETRIES.
```

Returns:
- `'paused'` if failures remain after MAX_AUTO_RETRIES (NEW behavior — was silent skip)
- `'briefing'` if all recovered (and no deferred overall)
- `'paused'` if fetch failures exist (deferred overall, existing behavior)

**Step 3: Verify tests pass, commit**

```bash
git add src/lib/pipeline/states/summarizing.ts src/lib/pipeline/states/summary-retry.ts
git commit -m "refactor(pipeline): add summarizing and summary-retry state handlers"
```

---

### Task 5: Create state handlers — paused, briefing, intelligence

**Files:**
- Create: `src/lib/pipeline/states/paused.ts`
- Create: `src/lib/pipeline/states/briefing.ts`
- Create: `src/lib/pipeline/states/intelligence.ts`

**Context:** `handlePaused` is the unified decision point for any persistent failure. `handleBriefing` generates the overall summary. `handleIntelligence` runs intelligence analysis.

**Step 1: Create paused.ts**

Extract from orchestrator.ts lines 706-839. The pause loop awaits user actions via the `PauseAction` promise pattern.

Key change: this handler now fires for both fetch failures AND summary failures (via the unified `ctx.failures` set). `retryOneSensor` (from helpers.ts) handles both cases based on `ctx.failureKinds`.

```typescript
// ABOUTME: Paused state handler — awaits user action for persistent failures.
// ABOUTME: Handles retry_sensor, retry_all, skip_sensor, generate_overall, and cancel.
import type { PipelineContext, PipelineState, PauseAction } from '../types'
import { retryOneSensor } from '../helpers'

export async function handlePaused(ctx: PipelineContext): Promise<PipelineState> {
  ctx.tracker.addEvent('warn', 'system', `Paused — ${ctx.failures.size} sensor(s) failed, awaiting action`)
  ctx.tracker.pause('pre_overall')

  while (ctx.failures.size > 0 && !ctx.signal.aborted) {
    const action = await new Promise<PauseAction>(resolve => {
      ctx.pauseResolve = resolve
      const onAbort = () => resolve({ type: 'cancel' })
      if (ctx.signal.aborted) { onAbort(); return }
      ctx.signal.addEventListener('abort', onAbort, { once: true })
    })

    if (action.type === 'cancel') {
      ctx.pauseResolve = null
      ctx.tracker.unpause()
      return 'cancelled'
    }

    if (action.type === 'generate_overall') break

    if (action.type === 'skip_sensor') {
      ctx.tracker.addEvent('info', 'system', 'Skipped sensor', action.sensor)
      ctx.failures.delete(action.sensor)
      ctx.failureKinds.delete(action.sensor)
      ctx.tracker.skipSummaryForSensor(action.sensor)
    }

    if (action.type === 'retry_sensor') {
      ctx.tracker.addEvent('info', 'retry', 'Manual retry requested', action.sensor)
      await retryOneSensor(ctx, action.sensor)
    }

    if (action.type === 'retry_all') {
      const snap = ctx.tracker.snapshot()
      const retryNames = [...ctx.failures].filter(name => {
        const sp = snap.sensors.find(s => s.name === name)
        return sp?.fetch_error_kind !== 'config'
      })
      ctx.tracker.addEvent('info', 'retry', `Retrying all ${retryNames.length} failed sensor(s)`)

      for (const sensorName of retryNames) {
        if (ctx.signal.aborted) break
        await retryOneSensor(ctx, sensorName)
      }
    }
  }

  ctx.pauseResolve = null

  // Skip summaries for any sensors still failed after pause loop
  for (const name of ctx.failures) {
    ctx.tracker.skipSummaryForSensor(name)
  }

  ctx.tracker.unpause()
  return 'briefing'
}
```

**Step 2: Create briefing.ts**

Extract from orchestrator.ts lines 844-886.

```typescript
// ABOUTME: Briefing state handler — generates overall executive briefing.
// ABOUTME: Only runs when summaries completed; writes result to cache.
import type { PipelineContext, PipelineState } from '../types'
import { generateOverallBriefing } from '../../summary/summarizer'
import { writeSummary } from '../../summary/cache'

export async function handleBriefing(ctx: PipelineContext): Promise<PipelineState> {
  if (!ctx.summary || ctx.signal.aborted) return 'intelligence'

  // Generate overall briefing if it wasn't done during summarization
  // (deferred when there were fetch failures that went through pause loop)
  const hasOverall = ctx.summary.overall && ctx.summary.overall.length > 0
  if (!hasOverall && ctx.baseSummarizeOpts) {
    ctx.tracker.setOverallSummary('running')
    const sourceReport = ctx.report ?? ctx.cachedReport
    if (sourceReport) {
      const overall = await generateOverallBriefing(
        sourceReport,
        ctx.summary.sections,
        ctx.baseSummarizeOpts as Parameters<typeof generateOverallBriefing>[2],
      )
      ctx.summary = { ...ctx.summary, overall }
    }
  }

  // Write summary to cache
  if (ctx.summary && !ctx.signal.aborted) {
    try {
      await writeSummary(ctx.summary, ctx.config.summary_language)
    } catch (err) {
      console.error('Failed to write summary cache:', err)
    }
  }

  return 'intelligence'
}
```

**Step 3: Create intelligence.ts**

```typescript
// ABOUTME: Intelligence state handler — runs intelligence analysis on the report.
// ABOUTME: Uses the deduplicated runIntelligence helper.
import type { PipelineContext, PipelineState } from '../types'
import { runIntelligence } from '../helpers'

export async function handleIntelligence(ctx: PipelineContext): Promise<PipelineState> {
  const intelligenceReport = ctx.report ?? ctx.cachedReport
  if (ctx.llmConfig && intelligenceReport && !ctx.signal.aborted) {
    await runIntelligence(
      intelligenceReport,
      ctx.llmConfig,
      ctx.signal,
      ctx.config.summary_language,
      ctx.tracker,
    )
  }
  return 'complete'
}
```

**Step 4: Verify tests pass, commit**

```bash
git add src/lib/pipeline/states/paused.ts src/lib/pipeline/states/briefing.ts src/lib/pipeline/states/intelligence.ts
git commit -m "refactor(pipeline): add paused, briefing, and intelligence state handlers"
```

---

### Task 6: Rewrite orchestrator.ts — dispatch loop + exports

**Files:**
- Modify: `src/lib/pipeline/orchestrator.ts` (complete rewrite — keep exports, change internals)
- Modify: `src/app/api/fetch/resume/route.ts` (update imports if needed)

**Context:** This is the big moment — replace the 751-line god function with the ~80-line dispatch loop. The public API (`cancelPipeline`, `isPipelineRunning`, `retrySensor`, etc.) stays identical but reads from `activePipeline` instead of `globalThis`.

**Step 1: Rewrite orchestrator.ts**

The new file structure:
1. Re-export `PauseAction` from types (backward compat for resume route)
2. Re-export `PipelineResult` (unchanged)
3. Module-level `activePipeline: PipelineContext | null`
4. All exported control functions (cancel, isPipelineRunning, etc.) — read from `activePipeline`
5. `STATE_HANDLERS` map
6. `createContext()` factory
7. `runPipeline()` — the slim dispatch loop with try/finally teardown

Key details:
- `PauseAction` is re-exported from `types.ts` so the resume route's import doesn't break
- Control functions (`cancelPipeline`, `retrySensor`, etc.) now read `activePipeline.pauseResolve` instead of `g.__pipelinePauseResolve`
- The dispatch loop: `while (state !== 'complete' && state !== 'cancelled') { state = await STATE_HANDLERS[state](ctx) }`
- The `finally` block handles teardown: mark summaryStatus complete, emit done on bus, write final pipeline status, clear `activePipeline`
- `createContext()` populates all immutable fields; mutable fields start empty

**Step 2: Verify ALL existing tests pass**

Run: `npx vitest run`
Expected: ALL tests pass. This is the critical verification — the state machine must produce identical behavior to the god function.

If tests fail, debug by comparing the old and new control flow for the failing scenario. Common issues:
- Missing state transition (a code path that was implicit in the god function but not modeled)
- Context field not populated (a value that was a local variable in the god function but needs to be on ctx)
- Import path issues

**Step 3: Verify resume route still works**

The resume route imports from `'@/lib/pipeline/orchestrator'`. The exports (`cancelPipeline`, `isPipelineRunning`, `retrySensor`, `retryAllFailed`, `skipSensor`, `generateOverall`, `skipFetchingSensor`, `skipPipelineRetries`, `isPipelinePaused`) must all still be exported with the same signatures.

**Step 4: Commit**

```bash
git add src/lib/pipeline/orchestrator.ts
git commit -m "refactor(pipeline): replace god function with state machine dispatch loop"
```

---

### Task 7: Add unit tests for state handlers

**Files:**
- Create: `src/lib/pipeline/states/__tests__/paused.test.ts`
- Create: `src/lib/pipeline/states/__tests__/fetch-retry.test.ts`
- Create: `src/lib/pipeline/states/__tests__/summary-retry.test.ts`
- Create: `src/lib/pipeline/__tests__/helpers.test.ts`

**Context:** The existing orchestrator.test.ts covers integration (end-to-end pipeline runs). These new tests cover individual handlers with mock PipelineContext.

**Step 1: Create a mock context factory**

In a shared test helper or inline:

```typescript
function createMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const abortController = new AbortController()
  return {
    config: makeConfig(),
    signal: abortController.signal,
    abortController,
    mode: 'fetch_summarize',
    allEnabledSensors: ['s1', 's2'],
    sensorsToFetch: ['s1', 's2'],
    trackerSensorNames: ['s1', 's2'],
    llmConfig: null,
    concurrency: 4,
    summaryConcurrency: 4,
    isIncrementalRun: false,
    tracker: new PipelineProgressTracker(['s1', 's2'], 'fetch_summarize', 4, 4),
    report: null,
    summary: null,
    cachedReport: null,
    cachedSensorItems: new Map(),
    failures: new Set(),
    failureKinds: new Map(),
    skippedSensors: new Set(),
    sensorSkips: new Map(),
    skipRetries: false,
    enabledSensors: new Set(['s1', 's2']),
    summaryStatus: null,
    summaryBus: null,
    onProgress: null,
    baseSummarizeOpts: null,
    pauseResolve: null,
    ...overrides,
  }
}
```

**Step 2: Write paused handler tests**

```typescript
describe('handlePaused', () => {
  it('returns cancelled when cancel action received', async () => {
    const ctx = createMockContext({ failures: new Set(['s1']) })
    // Simulate cancel action being sent immediately
    setTimeout(() => { ctx.pauseResolve!({ type: 'cancel' }) }, 10)
    const next = await handlePaused(ctx)
    expect(next).toBe('cancelled')
  })

  it('returns briefing when generate_overall action received', async () => {
    const ctx = createMockContext({ failures: new Set(['s1']) })
    setTimeout(() => { ctx.pauseResolve!({ type: 'generate_overall' }) }, 10)
    const next = await handlePaused(ctx)
    expect(next).toBe('briefing')
  })

  it('removes sensor from failures on skip_sensor', async () => {
    const ctx = createMockContext({
      failures: new Set(['s1']),
      failureKinds: new Map([['s1', 'api']]),
    })
    setTimeout(() => { ctx.pauseResolve!({ type: 'skip_sensor', sensor: 's1' }) }, 10)
    const next = await handlePaused(ctx)
    expect(ctx.failures.size).toBe(0)
    expect(next).toBe('briefing')
  })
})
```

**Step 3: Write fetch-retry handler tests**

```typescript
describe('handleFetchRetry', () => {
  it('transitions to paused when retries exhausted with failures', async () => {
    // Mock context with persistent failure
    const ctx = createMockContext({
      failures: new Set(['s1']),
      failureKinds: new Map([['s1', 'api']]),
    })
    const next = await handleFetchRetry(ctx)
    expect(next).toBe('paused')
  })

  it('transitions to summarizing when all failures recovered', async () => {
    // Mock context where retry succeeds
    const ctx = createMockContext({ failures: new Set() })
    const next = await handleFetchRetry(ctx)
    expect(next).toBe('summarizing')
  })
})
```

**Step 4: Write summary-retry handler tests**

```typescript
describe('handleSummaryRetry', () => {
  it('transitions to paused when summary retries exhausted with failures', async () => {
    const ctx = createMockContext({
      failures: new Set(['s1']),
      failureKinds: new Map([['s1', 'summary']]),
    })
    const next = await handleSummaryRetry(ctx)
    expect(next).toBe('paused')
  })
})
```

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests pass (existing + new)

**Step 6: Commit**

```bash
git add src/lib/pipeline/states/__tests__/ src/lib/pipeline/__tests__/
git commit -m "test(pipeline): add unit tests for state handlers and helpers"
```

---

### Task 8: Final verification and cleanup

**Files:**
- Possibly modify: any files with issues found during verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests pass

**Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Manual smoke test — trigger a pipeline run**

Start dev server and trigger a pipeline via the UI or API:
```bash
curl -X POST http://localhost:8000/api/fetch -H 'Content-Type: application/json' -d '{"mode":"summarize"}'
```

Poll status:
```bash
curl http://localhost:8000/api/fetch/status | python3 -m json.tool
```

Verify:
- Pipeline progresses through states
- Status page shows correct stepper progress
- If any sensors fail, the halt banner appears (NEW behavior)
- Retry/skip from the banner works

**Step 4: Clean up old code**

Verify that `orchestrator.ts` no longer has:
- The `globalThis` cast block (replaced by `activePipeline`)
- The `mergeRetryResult`, `mergeSensorSummary`, `extractSensorNames` private functions (moved to helpers.ts)
- The `fetchSensor`, `buildLlmConfig`, `buildAttributionLlmConfig` private functions (moved to helpers.ts)

**Step 5: Final commit**

```bash
git add -A
git commit -m "refactor(pipeline): final cleanup after state machine migration"
```
