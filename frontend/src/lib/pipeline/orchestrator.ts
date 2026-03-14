// ABOUTME: Pipeline orchestrator — state machine dispatch loop replacing the former god function.
// ABOUTME: Coordinates sensor fetch+summarize through staged state handlers; manages singleton lifecycle.

import type { ConfigSettings, RunMode } from '../models'
import type { PipelineProgressTracker } from './progress'
import { SENSOR_REGISTRY } from '../sensors'
import { writePipelineStatus } from './cache'
import { writeSummaryProgress } from '../summary/cache'
import { clearRunItems } from '../db'
import { buildLlmConfig } from './helpers'

import type { PipelineContext, PipelineState, StateHandler } from './types'
import { handleSetup } from './states/setup'
import { handleFetching } from './states/fetching'
import { handleSummarizing } from './states/summarizing'
import { handleSummaryRetry } from './states/summary-retry'
import { handlePaused } from './states/paused'
import { handleBriefing } from './states/briefing'
import { handleIntelligence } from './states/intelligence'

// Re-export for backward compatibility — consumers import from this module.
export type { PauseAction } from './types'

export interface PipelineResult {
  report: IntelReport | null
  summary: BriefingSummary | null
}

// ── Lazy type imports used only in the PipelineResult interface ──
import type { IntelReport, BriefingSummary } from '../models'

// ── Module-level pipeline reference — survives Next.js HMR ──
// Use globalThis to persist across module re-evaluations.
const g = globalThis as unknown as { __activePipeline?: PipelineContext | null }

// ── Exported control functions ──
// These MUST keep the exact same signatures and names as the old exports.
// The resume API route and stop routes import them directly.

/**
 * Cancel the running pipeline, if any. Returns true if a pipeline was cancelled.
 *
 * Only aborts the signal and cancels the tracker state. Does NOT clear the
 * singleton — the pipeline's own finally block handles cleanup to guarantee
 * the final status is written to the DB before isPipelineRunning() returns false.
 */
export function cancelPipeline(): boolean {
  const ctx = g.__activePipeline
  if (!ctx) return false
  if (ctx.pauseResolve) {
    ctx.pauseResolve({ type: 'cancel' })
    ctx.pauseResolve = null
  }
  ctx.abortController.abort()
  ctx.tracker.cancel()
  return true
}

/** Check whether a pipeline is currently running. */
export function isPipelineRunning(): boolean {
  return g.__activePipeline != null
}

/** Skip remaining auto-retries and proceed. Returns true if a running pipeline was signalled. */
export function skipPipelineRetries(): boolean {
  if (!g.__activePipeline) return false
  g.__activePipeline.skipRetries = true
  return true
}

/** Check whether the pipeline is currently paused at pre-overall. */
export function isPipelinePaused(): boolean {
  return g.__activePipeline?.pauseResolve != null
}

/** Retry a failed sensor during pre-overall pause. */
export function retrySensor(sensorName: string): boolean {
  const ctx = g.__activePipeline
  if (!ctx?.pauseResolve) return false
  ctx.pauseResolve({ type: 'retry_sensor', sensor: sensorName })
  ctx.pauseResolve = null
  return true
}

/** Skip a failed sensor during pre-overall pause. */
export function skipSensor(sensorName: string): boolean {
  const ctx = g.__activePipeline
  if (!ctx?.pauseResolve) return false
  ctx.pauseResolve({ type: 'skip_sensor', sensor: sensorName })
  ctx.pauseResolve = null
  return true
}

/** Retry all failed sensors during pre-overall pause. */
export function retryAllFailed(): boolean {
  const ctx = g.__activePipeline
  if (!ctx?.pauseResolve) return false
  ctx.pauseResolve({ type: 'retry_all' })
  ctx.pauseResolve = null
  return true
}

/** Trigger overall briefing generation with current data during pre-overall pause. */
export function generateOverall(): boolean {
  const ctx = g.__activePipeline
  if (!ctx?.pauseResolve) return false
  ctx.pauseResolve({ type: 'generate_overall' })
  ctx.pauseResolve = null
  return true
}

/** Skip a sensor that is currently fetching. The orchestrator stops waiting and marks it skipped. */
export function skipFetchingSensor(sensorName: string): boolean {
  const resolve = g.__activePipeline?.sensorSkips?.get(sensorName)
  if (!resolve) return false
  resolve()
  return true
}

// ── State handler dispatch table ──

const STATE_HANDLERS: Record<PipelineState, StateHandler> = {
  setup: handleSetup,
  fetching: handleFetching,
  summarizing: handleSummarizing,
  summary_retry: handleSummaryRetry,
  paused: handlePaused,
  briefing: handleBriefing,
  intelligence: handleIntelligence,
  complete: async () => 'complete',
  cancelled: async () => 'cancelled',
}

// ── Pipeline entry point ──

/**
 * Run the full pipeline: fetch sensors, optionally summarize, and persist results.
 *
 * Supports four run modes:
 *   - `fetch`: Fetch from all enabled sensors, build report, skip summaries.
 *   - `summarize`: Skip fetching, load cached report, generate summaries only.
 *   - `fetch_summarize`: Fetch first, then summarize the fresh report.
 *   - `intelligence`: Skip fetching and summarizing, load cached report, run intelligence analysis only.
 *
 * The dispatch loop drives execution through discrete state handlers until
 * a terminal state (`complete` or `cancelled`) is reached.
 */
export async function runPipeline(
  config: ConfigSettings,
  mode: RunMode,
  sensorFilter?: string[],
): Promise<PipelineResult> {
  // Claim the pipeline singleton IMMEDIATELY (synchronously) before any async work.
  // This prevents the race where two requests both pass isPipelineRunning() === false.
  if (g.__activePipeline) {
    throw new Error('Pipeline is already running')
  }

  const abortController = new AbortController()
  const { signal } = abortController

  const shouldFetch = mode === 'fetch' || mode === 'fetch_summarize' || mode === 'fetch_intelligence'
  const shouldSummarize = mode === 'summarize' || mode === 'fetch_summarize' || mode === 'fetch_intelligence'
  const defaultConcurrency = config.default_concurrency ?? 4
  const localSummaryConcurrency = config.local_summary_concurrency ?? 1
  const isLocalModel = config.summary_provider === 'local'
  const effectiveSummaryConcurrency = isLocalModel ? localSummaryConcurrency : defaultConcurrency

  // Identify enabled sensors from the registry, optionally filtered to a subset
  const allEnabledSensors = Object.keys(SENSOR_REGISTRY).filter(
    name => config.sensors_enabled[name] !== false,
  )
  const registrySensorNames = sensorFilter?.length
    ? allEnabledSensors.filter(name => sensorFilter.includes(name))
    : allEnabledSensors

  // Incremental run: sensorFilter limits the fetch phase, but the summary phase
  // processes ALL sensors (using per-sensor cache for unchanged data).
  const isIncrementalRun = shouldFetch && shouldSummarize && !!sensorFilter?.length

  // Build the shared context object that all state handlers operate on
  const ctx: PipelineContext = {
    config,
    signal,
    abortController,
    mode,
    allEnabledSensors,
    sensorsToFetch: registrySensorNames,
    trackerSensorNames: registrySensorNames,
    llmConfig: buildLlmConfig(config),
    concurrency: defaultConcurrency,
    summaryConcurrency: effectiveSummaryConcurrency,
    isIncrementalRun,
    sensorFilter,
    tracker: null as unknown as PipelineProgressTracker,  // created by setup handler
    report: null,
    summary: null,
    cachedReport: null,
    cachedSensorItems: new Map(),
    failures: new Set(),
    failureKinds: new Map(),
    skippedSensors: new Set(),
    sensorSkips: new Map(),
    skipRetries: false,
    enabledSensors: isIncrementalRun ? new Set(allEnabledSensors) : new Set(registrySensorNames),
    summaryStatus: null,
    summaryBus: null,
    onProgress: null,
    baseSummarizeOpts: null,
    pauseResolve: null,
  }

  g.__activePipeline = ctx

  try {
    // State machine dispatch loop
    let state: PipelineState = 'setup'
    while (state !== 'complete' && state !== 'cancelled') {
      if (signal.aborted && state !== 'paused') {
        state = 'cancelled'
        break
      }
      state = await STATE_HANDLERS[state](ctx)
    }

    // Completion bookkeeping
    if (!signal.aborted && ctx.tracker) {
      const fetchedItems = ctx.tracker.snapshot().total_items
      const reportItems = ctx.report
        ? Object.values(ctx.report.items).reduce((sum, arr) => sum + arr.length, 0)
        : 0
      const message = fetchedItems > 0
        ? `Pipeline complete — ${fetchedItems} items fetched, ${reportItems} in report`
        : `Pipeline complete — ${reportItems} items in report (cached)`
      ctx.tracker.addEvent('ok', 'system', message)
      ctx.tracker.complete()
      // Clear temp pipeline_items now that results are promoted to permanent cache
      clearRunItems(ctx.tracker.snapshot().run_id!).catch(err =>
        console.warn('[pipeline] Failed to clear run items:', err),
      )
    } else if (ctx.tracker) {
      ctx.tracker.addEvent('warn', 'system', 'Pipeline cancelled')
    }

    return { report: ctx.report, summary: ctx.summary }
  } finally {
    // Mark SummaryProgress complete for cross-page awareness — await to prevent
    // a race where status polls see running=true + alive=false (stale false positive)
    if (ctx.summaryStatus) {
      ctx.summaryStatus.running = false
      ctx.summaryStatus.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      await writeSummaryProgress(ctx.summaryStatus).catch(() => {})
    }
    ctx.summaryBus?.emitDone()
    // Persist final status BEFORE clearing singleton so the DB always reflects
    // the terminal state before isPipelineRunning() starts returning false.
    if (ctx.tracker) {
      await writePipelineStatus(ctx.tracker.snapshot()).catch(() => {})
    }
    // Clear singleton so a new run can start
    if (g.__activePipeline === ctx) {
      g.__activePipeline = null
    }
  }
}
