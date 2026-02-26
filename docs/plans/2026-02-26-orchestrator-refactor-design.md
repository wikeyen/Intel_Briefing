# Orchestrator State Machine Refactoring — Design

## Goal

Replace the 751-line god function `runPipeline` with an explicit state machine, fix summary failures silently skipping instead of pausing for user intervention, and eliminate duplicated code.

## Architecture

### State Machine

A dispatch loop drives the pipeline through discrete states. Each state maps to one focused async handler function. Handlers take a `PipelineContext`, perform their phase's work, and return the next state.

```
SETUP → FETCHING → FETCH_RETRY ──→ PAUSED ←── SUMMARY_RETRY
                                     │
                       ┌─────────────┼─────────────┐
                       ▼             ▼             ▼
                   FETCHING    SUMMARIZING     BRIEFING
                  (retry)      (skip & go)    (generate)

SUMMARIZING → SUMMARY_RETRY ──→ PAUSED (if retries exhausted)

BRIEFING → INTELLIGENCE → COMPLETE

Any state → CANCELLED (abort signal)
```

**States:**
- `setup` — mode routing, cache checks, early exit for all-cached scenarios
- `fetching` — concurrent sensor fetch via semaphore
- `fetch_retry` — auto-retry failed sensors up to MAX_AUTO_RETRIES; if still failing → `paused`
- `summarizing` — run per-sensor summaries concurrently, track failures
- `summary_retry` — auto-retry failed summaries; if still failing → `paused`
- `paused` — await user action: retry one, retry all, skip, generate overall, or cancel
- `briefing` — generate overall summary
- `intelligence` — run intelligence analysis
- `complete` / `cancelled` — terminal states

### PipelineContext

Replaces the 8 `globalThis` singletons with a single typed object:

```typescript
interface PipelineContext {
  // Immutable after setup
  config: ConfigSettings
  signal: AbortSignal
  mode: PipelineMode
  sensorsToFetch: string[]
  llmConfig: LlmConfig | null
  concurrency: number

  // Mutable shared state
  tracker: PipelineProgressTracker
  report: IntelReport | null
  failures: Set<string>              // unified — fetch OR summary failures
  failureKinds: Map<string, string>  // sensor → error kind ('api-error', 'summary', 'config')
  sensorSkips: Map<string, () => void>

  // Pause/resume channel
  pauseResolve: ((action: PauseAction) => void) | null
}
```

One module-level `activePipeline` reference replaces all `globalThis` casts. The resume API reads from it.

### Unified Failure Handling

Fetch failures and summary failures both populate `ctx.failures`. The `failureKinds` map distinguishes them so the pause loop can retry intelligently:
- `'api-error'` — re-fetch + re-summarize
- `'summary'` — skip re-fetch, only re-summarize
- `'config'` — not retryable, user must skip

### Extracted Helpers

1. `retryOneSensor(ctx, name)` — shared by `retry_sensor` and `retry_all` actions
2. `runIntelligence(ctx)` — deduplicated from two branches
3. `createProgressBridge(ctx, bus)` — replaces the 44-line mixed-concern callback

### File Organization

```
frontend/src/lib/pipeline/
  orchestrator.ts          ~80 lines  — runPipeline loop, createContext, teardown
  states/
    setup.ts               ~80 lines  — handleSetup
    fetching.ts            ~120 lines — handleFetching
    fetch-retry.ts         ~50 lines  — handleFetchRetry
    summarizing.ts         ~100 lines — handleSummarizing
    summary-retry.ts       ~50 lines  — handleSummaryRetry
    paused.ts              ~80 lines  — handlePaused
    briefing.ts            ~30 lines  — handleBriefing
    intelligence.ts        ~30 lines  — handleIntelligence
  helpers.ts               ~60 lines  — retryOneSensor, createProgressBridge, mergeRetryResult
  types.ts                 ~40 lines  — PipelineState, PipelineContext, StateHandler
  progress.ts              (unchanged)
  cache.ts                 (unchanged)
```

### Behavioral Fix

Summary failures now trigger the pause state after auto-retries are exhausted. The halt banner (already implemented) shows when the pipeline pauses, regardless of whether the failure was fetch or summary. The state machine prevents phase overlap — `handleSummarizing` must return before `handleBriefing` can start.

### Testing

- Unit tests per state handler (mock PipelineContext, verify next state + side effects)
- `retryOneSensor` tests (fetch-only vs summary-only retry based on failureKinds)
- Pause loop action tests
- Full integration tests (existing orchestrator.test.ts adapted)
- Cancellation tests (abort signal interrupts any state)

## Tech Stack

- TypeScript (same as existing)
- No new dependencies
- Vitest for tests

## What Stays Unchanged

- `progress.ts` (tracker)
- `cache.ts` (pipeline status persistence)
- `report-builder.ts`
- `intelligence.ts` (analysis engine)
- Resume API route (same exported functions, different internals)
- Frontend components (halt banner already works)
