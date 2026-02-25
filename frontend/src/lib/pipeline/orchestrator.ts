// ABOUTME: Pipeline orchestrator — coordinates sensor fetch+summarize through staged execution.
// ABOUTME: Delegates summarization to the unified engine; handles fetch stage and progress tracking.
import type {
  ConfigSettings,
  IntelItem,
  IntelReport,
  SensorResult,
  RunMode,
  BriefingSummary,
  SummaryProgress,
  SummarySensorProgress,
} from '../models'
import { sensorResultSucceeded, sensorLimit } from '../models'
import { Semaphore } from './semaphore'
import { PipelineProgressTracker } from './progress'
import { readReport, writeReport, writePipelineStatus } from './cache'
import { writeSummary, writeSummaryProgress, invalidateAllSensorSummaries, invalidateAllSummaries } from '../summary/cache'
import { summarizeReport, summarizeSingleSensor, generateOverallBriefing, type SummaryProgressCallback } from '../summary/summarizer'
import type { LlmConfig } from '../summary/llm'
import { SENSOR_REGISTRY } from '../sensors'
import { SENSOR_LABELS, SENSOR_CATEGORY_MAP } from '../sensors/taxonomy'
import type { CategoryKey } from '../sensors/taxonomy'
import { SensorConfigError } from '../sensors/errors'
import { assembleReport } from './report-builder'
import { createBus } from '../summary/events'
import { runIntelligenceAnalysis } from './intelligence'
import { writeIntelligence } from './intelligence-cache'
import { writePipelineItem, readFreshPipelineItems, clearRunItems } from '../db'

export interface PipelineResult {
  report: IntelReport | null
  summary: BriefingSummary | null
}

const MAX_AUTO_RETRIES = 3

export type PauseAction =
  | { type: 'retry_sensor'; sensor: string }
  | { type: 'skip_sensor'; sensor: string }
  | { type: 'generate_overall' }
  | { type: 'cancel' }

// Store on globalThis so it survives Next.js HMR module re-evaluation.
const g = globalThis as unknown as {
  __pipelineAbortController?: AbortController | null
  __pipelineTracker?: PipelineProgressTracker | null
  __pipelineSkipRetries?: boolean
  // Pause-before-overall state
  __pipelinePauseResolve?: ((action: PauseAction) => void) | null
  __pipelineReport?: IntelReport | null
  __pipelineFailedSensors?: Set<string> | null
  __pipelineConfig?: ConfigSettings | null
  // Per-sensor skip promises — resolve to abort a single sensor's fetch mid-flight
  __pipelineSensorSkips?: Map<string, () => void>
}

/**
 * Cancel the running pipeline, if any. Returns true if a pipeline was cancelled.
 *
 * Only aborts the signal and cancels the tracker state. Does NOT clear singletons —
 * the pipeline's own finally block handles cleanup to guarantee the final status
 * is written to the DB before isPipelineRunning() starts returning false.
 */
export function cancelPipeline(): boolean {
  if (!g.__pipelineAbortController || !g.__pipelineTracker) return false
  // Resolve the pause promise if the pipeline is paused — unblocks the while loop
  if (g.__pipelinePauseResolve) {
    g.__pipelinePauseResolve({ type: 'cancel' })
    g.__pipelinePauseResolve = null
  }
  g.__pipelineAbortController.abort()
  g.__pipelineTracker.cancel()
  // Singletons are intentionally NOT cleared here. The pipeline's finally block
  // will write the terminal status and then clear them, preventing the race where
  // a status poll sees running=true + alive=false.
  return true
}

/** Check whether a pipeline is currently running. */
export function isPipelineRunning(): boolean {
  return g.__pipelineAbortController != null
}

/** Skip remaining auto-retries and proceed. Returns true if a running pipeline was signalled. */
export function skipPipelineRetries(): boolean {
  if (!isPipelineRunning()) return false
  g.__pipelineSkipRetries = true
  return true
}

/** Check whether the pipeline is currently paused at pre-overall. */
export function isPipelinePaused(): boolean {
  return g.__pipelinePauseResolve != null
}

/** Retry a failed sensor during pre-overall pause. */
export function retrySensor(sensorName: string): boolean {
  if (!g.__pipelinePauseResolve) return false
  g.__pipelinePauseResolve({ type: 'retry_sensor', sensor: sensorName })
  g.__pipelinePauseResolve = null
  return true
}

/** Skip a failed sensor during pre-overall pause. */
export function skipSensor(sensorName: string): boolean {
  if (!g.__pipelinePauseResolve) return false
  g.__pipelinePauseResolve({ type: 'skip_sensor', sensor: sensorName })
  g.__pipelinePauseResolve = null
  return true
}

/** Trigger overall briefing generation with current data during pre-overall pause. */
export function generateOverall(): boolean {
  if (!g.__pipelinePauseResolve) return false
  g.__pipelinePauseResolve({ type: 'generate_overall' })
  g.__pipelinePauseResolve = null
  return true
}

/** Skip a sensor that is currently fetching. The orchestrator stops waiting and marks it skipped. */
export function skipFetchingSensor(sensorName: string): boolean {
  const resolve = g.__pipelineSensorSkips?.get(sensorName)
  if (!resolve) return false
  resolve()
  return true
}

/**
 * Run a single sensor's fetch function and return a SensorResult.
 * Catches all errors so one failing sensor never blocks the pipeline.
 */
async function fetchSensor(
  name: string,
  config: ConfigSettings,
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
 * Build an LlmConfig from ConfigSettings, or return null if summary provider is not configured.
 */
function buildLlmConfig(config: ConfigSettings): LlmConfig | null {
  if (!config.summary_provider) return null
  return {
    base_url: config.summary_base_url,
    api_key: config.summary_api_key,
    model: config.summary_model,
  }
}

/**
 * Build an LlmConfig for attribution calls from ConfigSettings, or return null if not configured.
 * When set, the summarizer can use a cheaper/faster model for source-attribution passes.
 */
function buildAttributionLlmConfig(config: ConfigSettings): LlmConfig | null {
  if (!config.summary_provider) return null
  if (!config.summary_attribution_model) return null
  return {
    base_url: config.summary_base_url,
    api_key: config.summary_api_key,
    model: config.summary_attribution_model,
  }
}

/**
 * Run the full pipeline: fetch sensors, optionally summarize, and persist results.
 *
 * Supports three run modes:
 *   - `fetch`: Fetch from all enabled sensors, build report, skip summaries.
 *   - `summarize`: Skip fetching, load cached report, generate summaries only.
 *   - `fetch_summarize`: Fetch first, then summarize the fresh report.
 *
 * The fetch stage uses a Semaphore for concurrency control.
 * The summarize stage delegates to the unified summarization engine.
 * Failed sensors in the fetch stage are excluded from the summary stage.
 * Progress is tracked via PipelineProgressTracker and persisted to the database.
 * Summary progress is also written to intel:summary_status for cross-page awareness.
 */
export async function runPipeline(
  config: ConfigSettings,
  mode: RunMode,
  sensorFilter?: string[],
): Promise<PipelineResult> {
  // Claim the pipeline singleton IMMEDIATELY (synchronously) before any async work.
  // This prevents the race where two requests both pass isPipelineRunning() === false.
  if (g.__pipelineAbortController) {
    throw new Error('Pipeline is already running')
  }
  const abortController = new AbortController()
  g.__pipelineAbortController = abortController
  const { signal } = abortController

  const defaultConcurrency = config.default_concurrency ?? 4
  const localSummaryConcurrency = config.local_summary_concurrency ?? 1
  const isLocalModel = config.summary_provider === 'local'
  const effectiveSummaryConcurrency = isLocalModel ? localSummaryConcurrency : defaultConcurrency
  const fetchSemaphore = new Semaphore(defaultConcurrency)

  // Identify enabled sensors from the registry, optionally filtered to a subset
  const allEnabledSensors = Object.keys(SENSOR_REGISTRY).filter(
    name => config.sensors_enabled[name] !== false,
  )
  const registrySensorNames = sensorFilter?.length
    ? allEnabledSensors.filter(name => sensorFilter.includes(name))
    : allEnabledSensors

  const llmConfig = buildLlmConfig(config)
  const shouldFetch = mode === 'fetch' || mode === 'fetch_summarize'
  const shouldSummarize = mode === 'summarize' || mode === 'fetch_summarize'

  // Incremental run: sensorFilter limits the fetch phase, but the summary phase
  // processes ALL sensors (using per-sensor cache for unchanged data).
  // This ensures retry/resume pipelines complete the full workflow including overall.
  const isIncrementalRun = shouldFetch && shouldSummarize && !!sensorFilter?.length

  // For summarize-only mode, load the cached report up front so we can derive
  // sensor names for the tracker from the report's actual contents.
  let cachedReport: IntelReport | null = null
  if (mode === 'summarize') {
    cachedReport = await readReport()
    if (!cachedReport) {
      // No cached report — create a minimal tracker, mark complete, return empty
      const tracker = new PipelineProgressTracker([], mode, defaultConcurrency, localSummaryConcurrency, (status) => {
        writePipelineStatus(status).catch(() => {})
      })
      await writePipelineStatus(tracker.snapshot()).catch(() => {})
      tracker.complete()
      // Clean up singleton before returning
      if (g.__pipelineAbortController === abortController) {
        g.__pipelineAbortController = null
      }
      return { report: null, summary: null }
    }
  }

  // Determine sensor names for the tracker:
  // - summarize-only: derive from cached report
  // - incremental: track ALL enabled sensors (fetch skips non-filtered, summary covers all)
  // - normal: track only the sensors being run
  const trackerSensorNames = mode === 'summarize'
    ? extractSensorNames(cachedReport!).filter(name => config.sensors_enabled[name] !== false)
    : isIncrementalRun
      ? allEnabledSensors
      : registrySensorNames

  // Create progress tracker with persistence callback
  const tracker = new PipelineProgressTracker(trackerSensorNames, mode, defaultConcurrency, localSummaryConcurrency, (status) => {
    writePipelineStatus(status).catch(() => {})
  })

  // For incremental runs, mark non-filtered sensors' fetch as already cached (skipped).
  // These sensors keep their data from the previous report and don't need re-fetching.
  if (isIncrementalRun) {
    const filterSet = new Set(sensorFilter!)
    for (const name of allEnabledSensors) {
      if (!filterSet.has(name)) {
        tracker.setFetchState(name, 'skipped', 0)
      }
    }
  }

  // Store tracker singleton for abort support
  g.__pipelineTracker = tracker

  // Write initial status
  await writePipelineStatus(tracker.snapshot()).catch(() => {})

  tracker.addEvent('info', 'system', `Pipeline started — mode: ${mode}, ${trackerSensorNames.length} sensors`)

  // --- Incremental: check pipeline_items for fresh sensors ---
  const resumeWindowHours = config.resume_window_hours ?? 0
  let cachedSensorItems = new Map<string, unknown[]>()

  if (shouldFetch && resumeWindowHours > 0) {
    try {
      const freshItems = await readFreshPipelineItems(resumeWindowHours)
      for (const [sensorName, data] of freshItems) {
        if (registrySensorNames.includes(sensorName)) {
          cachedSensorItems.set(sensorName, data.items)
          tracker.setCachedSensor(sensorName, data.items.length)
          tracker.addEvent('info', 'fetch', `Cached (${data.items.length} items, within ${resumeWindowHours}h window)`, sensorName)
        }
      }
      if (cachedSensorItems.size > 0) {
        tracker.addEvent('info', 'system', `Incremental: ${cachedSensorItems.size} sensors cached, ${registrySensorNames.length - cachedSensorItems.size} to fetch`)
      }
    } catch (err) {
      console.warn('[pipeline] Failed to read fresh pipeline items:', err)
    }
  }

  // Filter out cached sensors from the fetch list
  const sensorsToFetch = registrySensorNames.filter(name => !cachedSensorItems.has(name))

  let report: IntelReport | null = null
  let summary: BriefingSummary | null = null

  // Build enabled sensor set for the unified engine.
  // Incremental runs summarize ALL enabled sensors (cache hits for unchanged).
  const enabledSensors = isIncrementalRun
    ? new Set(allEnabledSensors)
    : new Set(registrySensorNames)

  // SummaryProgress for cross-page awareness — Feed page polls intel:summary_status.
  // Initialized lazily when summarize stage begins.
  let summaryStatus: SummaryProgress | null = null

  // Event bus for streaming tokens — created lazily when summarize stage begins
  let summaryBus: ReturnType<typeof createBus> | null = null

  try {
    // Track sensors that failed fetch — for progress tracker skip marking
    const failedSensors = new Set<string>()
    // Track sensors skipped mid-fetch — their summaries should also be skipped
    const skippedSensors = new Set<string>()

    if (shouldFetch) {
      // Stage 1: Run all sensor fetches with retry loop on failures
      const resultMap = new Map<string, SensorResult>()

      // Per-sensor skip map — resolve to abandon a single sensor's fetch
      if (!g.__pipelineSensorSkips) g.__pipelineSensorSkips = new Map()
      const sensorSkips = g.__pipelineSensorSkips

      // Inner function to fetch a batch of sensors concurrently
      const fetchBatch = async (sensorNames: string[]) => {
        const promises = sensorNames.map(name =>
          fetchSemaphore.run(async () => {
            if (signal.aborted) return
            tracker.setFetchState(name, 'running')

            // Race the actual fetch against a per-sensor skip promise
            let skipResolve: () => void
            const skipPromise = new Promise<'SKIPPED'>(resolve => {
              skipResolve = () => resolve('SKIPPED')
            })
            sensorSkips.set(name, skipResolve!)

            const outcome = await Promise.race([
              fetchSensor(name, config, (detail, itemCount) => {
                tracker.setFetchDetail(name, detail, itemCount)
              }),
              skipPromise,
            ])

            sensorSkips.delete(name)

            if (signal.aborted) return

            if (outcome === 'SKIPPED') {
              tracker.setFetchState(name, 'skipped', 0)
              tracker.addEvent('info', 'fetch', `Skipped by user`, name)
              failedSensors.delete(name)
              skippedSensors.add(name)
              return
            }

            const result = outcome
            resultMap.set(name, result)
            if (sensorResultSucceeded(result)) {
              tracker.setFetchState(name, 'ok', result.items.length)
              tracker.addEvent('ok', 'fetch', `Fetched ${result.items.length} items`, name)
              failedSensors.delete(name)
              // Write to temp DB for crash-safe incremental recovery
              const runId = tracker.snapshot().run_id!
              const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
              writePipelineItem(name, runId, result.items, nowIso).catch(err =>
                console.warn(`[pipeline] Failed to write pipeline_item for ${name}:`, err),
              )
            } else {
              tracker.setFetchState(name, 'failed', 0, result.error, result.error_kind ?? 'api')
              tracker.addEvent('error', 'fetch', result.error ?? 'Unknown error', name)
              failedSensors.add(name)
            }
          }),
        )
        await Promise.all(promises)
      }

      // Initial fetch — skip sensors already cached from a previous run
      await fetchBatch(sensorsToFetch)

      // Auto-retry failed sensors up to MAX_AUTO_RETRIES times.
      // Config errors are not retryable — they need user action (e.g. missing API key).
      if (shouldSummarize && failedSensors.size > 0 && !signal.aborted) {
        const retryableSensors = () => [...failedSensors].filter(name => {
          const result = resultMap.get(name)
          return result?.error_kind !== 'config'
        })

        g.__pipelineSkipRetries = false

        for (let attempt = 1; attempt <= MAX_AUTO_RETRIES && !signal.aborted; attempt++) {
          if (g.__pipelineSkipRetries) break
          const toRetry = retryableSensors()
          if (toRetry.length === 0) break

          tracker.addEvent('info', 'retry', `Auto-retry ${attempt}/${MAX_AUTO_RETRIES} — ${toRetry.length} sensors`)
          tracker.setRetryProgress(attempt, MAX_AUTO_RETRIES)
          for (const name of toRetry) {
            tracker.setFetchState(name, 'queued')
          }
          await fetchBatch(toRetry)
        }

        tracker.clearRetryProgress()
        g.__pipelineSkipRetries = false
      }

      if (signal.aborted) {
        // Pipeline was cancelled mid-fetch. Do NOT write partial results to cache —
        // this would replace a complete report with incomplete data.
        tracker.addEvent('warn', 'system', 'Pipeline cancelled during fetch')
        return { report: null, summary: null }
      }

      // Add cached sensor items as successful results for report assembly
      for (const [sensorName, items] of cachedSensorItems) {
        if (!resultMap.has(sensorName)) {
          resultMap.set(sensorName, {
            sensor_name: sensorName,
            items: items as IntelItem[],
            error: null,
            error_kind: null,
          })
        }
      }

      const okCount = [...resultMap.values()].filter(r => sensorResultSucceeded(r)).length
      tracker.addEvent('info', 'fetch', `Fetch complete — ${okCount}/${registrySensorNames.length} succeeded`)

      report = await assembleReport([...resultMap.values()], config, { llmConfig, signal, sensorFilter })

      // Mark failed/skipped sensors' summaries as skipped — they don't pass to the next stage
      if (shouldSummarize) {
        for (const name of failedSensors) {
          tracker.skipSummaryForSensor(name)
        }
        for (const name of skippedSensors) {
          tracker.skipSummaryForSensor(name)
        }
        // For incremental runs, also skip summaries for sensors that failed in a
        // previous run and weren't retried in this one (they're in the merged report's
        // sources_failed but not in this run's failedSensors set).
        if (isIncrementalRun && report) {
          const filterSet = new Set(sensorFilter!)
          for (const name of report.sources_failed) {
            if (!filterSet.has(name) && !failedSensors.has(name)) {
              tracker.skipSummaryForSensor(name)
            }
          }
        }
      }

      // Invalidate cached summaries before re-summarization.
      // For incremental runs, only invalidate the overall briefing — per-sensor caches
      // use content hashing so unchanged sensors automatically hit cache.
      // For full runs, invalidate everything since all data is fresh.
      if (shouldSummarize) {
        if (isIncrementalRun) {
          await invalidateAllSummaries().catch(() => {})
        } else {
          await Promise.all([
            invalidateAllSensorSummaries(),
            invalidateAllSummaries(),
          ]).catch(() => {})
        }
      }
    }

    if (shouldSummarize) {
      // Use the freshly-fetched report, or the pre-loaded cached report
      const sourceReport = report ?? cachedReport
      if (!sourceReport) {
        tracker.complete()
        return { report: null, summary: null }
      }

      // Store report in global state for pause-loop access
      g.__pipelineReport = sourceReport
      g.__pipelineFailedSensors = failedSensors
      g.__pipelineConfig = config

      // Build SummaryProgress for cross-page awareness (Feed page polls intel:summary_status).
      // Exclude sensors that failed in this run AND previously-failed sensors from merged report.
      const reportFailed = new Set(sourceReport.sources_failed)
      const eligibleSensors = trackerSensorNames.filter(n =>
        !failedSensors.has(n) && !reportFailed.has(n),
      )
      summaryStatus = {
        running: true,
        started_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        completed_at: null,
        sensors: [...eligibleSensors, '__overall__'].map((name): SummarySensorProgress => ({
          sensor_name: name,
          label: name === '__overall__' ? 'Overall' : (SENSOR_LABELS[name] ?? name),
          state: 'pending',
          error: null,
        })),
      }
      await writeSummaryProgress(summaryStatus).catch(() => {})

      summaryBus = createBus()

      if (llmConfig) {
        tracker.addEvent('info', 'summary', 'Summarization started')

        // Bridge between tracker and the unified engine's progress callback
        const onProgress: SummaryProgressCallback = (sensorName, _label, state, error, chunks, verify) => {
          summaryBus!.emitState(sensorName, state, _label, error)
          if (sensorName === '__overall__') {
            if (state === 'running') {
              tracker.setOverallSummary('running')
              tracker.addEvent('info', 'summary', 'Generating executive briefing')
            } else if (state === 'ok') {
              tracker.setOverallSummary('ok')
              tracker.addEvent('ok', 'summary', 'Executive briefing complete')
            } else if (state === 'failed') {
              tracker.setOverallSummary('failed')
              tracker.addEvent('error', 'summary', error ?? 'Executive briefing failed')
            }
          } else {
            if (state === 'running') {
              tracker.setSummaryState(sensorName, 'running')
              if (chunks) tracker.setSummaryChunks(sensorName, chunks.total, chunks.done)
            } else if (state === 'ok' || state === 'cached') {
              tracker.setSummaryState(sensorName, 'ok')
              tracker.addEvent('ok', 'summary', state === 'cached' ? 'Summary loaded from cache' : 'Summary generated', sensorName)
            } else if (state === 'failed') {
              tracker.setSummaryState(sensorName, 'failed', error ?? undefined)
              tracker.addEvent('error', 'summary', error ?? 'Summary failed', sensorName)
            }
          }
          if (verify && sensorName !== '__overall__') {
            tracker.setVerifyProgress(sensorName, verify.attempt, verify.maxRetries, verify.failures)
          }

          // Also update SummaryProgress for cross-page awareness
          if (summaryStatus) {
            const displayState = state === 'cached' ? 'ok' as const : state
            for (const sp of summaryStatus.sensors) {
              if (sp.sensor_name === sensorName) {
                sp.state = displayState
                sp.label = _label
                sp.error = error
                break
              }
            }
            writeSummaryProgress(summaryStatus).catch(() => {})
          }
        }

        // Build shared summarize options for reuse in pause loop
        const baseSummarizeOpts = {
          llmConfig,
          concurrency: effectiveSummaryConcurrency,
          promptOverrides: config.summary_sensor_prompts,
          overallPromptOverride: config.summary_overall_prompt,
          signal,
          onProgress,
          enabledSensors,
          language: config.summary_language,
          onToken: (sensorName: string, token: string) => summaryBus!.emitToken(sensorName, token),
          attributionLlmConfig: buildAttributionLlmConfig(config) ?? undefined,
        }

        // Determine whether to skip overall: if there are fetch failures, defer it
        const hasFetchFailures = failedSensors.size > 0

        // Delegate to the unified summarization engine.
        // Full fetch_summarize: skipCache=true since we just invalidated all caches.
        // Incremental: skipCache=false — unchanged sensors hit cache (content-hash match),
        //   re-fetched sensors have new data so their hash won't match → re-summarized.
        // Summarize-only: skipCache=false to reuse cached per-sensor summaries.
        let skipCacheForSummary = shouldFetch && !isIncrementalRun
        g.__pipelineSkipRetries = false

        for (let summaryAttempt = 0; summaryAttempt <= MAX_AUTO_RETRIES && !signal.aborted; summaryAttempt++) {
          if (summaryAttempt > 0 && g.__pipelineSkipRetries) break

          summary = await summarizeReport(sourceReport, {
            ...baseSummarizeOpts,
            skipCache: skipCacheForSummary,
            skipOverall: hasFetchFailures,
          })

          if (signal.aborted) break

          // Check for per-sensor summary failures
          const snap = tracker.snapshot()
          const summaryFailures = snap.sensors
            .filter(s => s.summary === 'failed')
            .map(s => s.name)

          if (summaryFailures.length === 0) break

          // No more retries left — proceed with partial results
          if (summaryAttempt >= MAX_AUTO_RETRIES) break

          // Auto-retry: reset failed sensors in both tracker AND summaryStatus
          tracker.setRetryProgress(summaryAttempt + 1, MAX_AUTO_RETRIES)
          for (const name of summaryFailures) {
            tracker.setSummaryState(name, 'queued')
            // Also reset in SummaryProgress so the Feed page doesn't show stale 'failed'
            if (summaryStatus) {
              for (const sp of summaryStatus.sensors) {
                if (sp.sensor_name === name) {
                  sp.state = 'pending'
                  sp.error = null
                  break
                }
              }
            }
          }
          if (!hasFetchFailures) tracker.setOverallSummary('queued')
          // Flush updated summaryStatus to DB
          if (summaryStatus) {
            writeSummaryProgress(summaryStatus).catch(() => {})
          }

          // Re-run with skipCache:false — succeeded sensors hit cache, failed retry
          skipCacheForSummary = false
        }

        tracker.clearRetryProgress()
        g.__pipelineSkipRetries = false

        // ── Pause-before-overall: if fetch failures exist, wait for user actions ──
        if (hasFetchFailures && !signal.aborted && summary) {
          tracker.addEvent('warn', 'system', `Paused — ${failedSensors.size} sensor(s) failed, awaiting action`)
          tracker.pause('pre_overall')

          // Pause loop: wait for user to resolve each failed sensor or trigger overall.
          // The pause Promise is raced against an abort listener so cancellation
          // always unblocks the loop — prevents the pipeline from hanging forever.
          let generateNow = false
          while (failedSensors.size > 0 && !signal.aborted && !generateNow) {
            const action = await new Promise<PauseAction>(resolve => {
              g.__pipelinePauseResolve = resolve
              // Wire abort signal into the pause promise so cancel always unblocks
              const onAbort = () => resolve({ type: 'cancel' })
              if (signal.aborted) { onAbort(); return }
              signal.addEventListener('abort', onAbort, { once: true })
            })

            if (action.type === 'cancel') break

            if (action.type === 'generate_overall') {
              generateNow = true
              break
            }

            if (action.type === 'skip_sensor') {
              tracker.addEvent('info', 'system', `Skipped sensor`, action.sensor)
              failedSensors.delete(action.sensor)
              tracker.skipSummaryForSensor(action.sensor)
              // Already skipped in report — nothing more to do
            }

            if (action.type === 'retry_sensor') {
              tracker.addEvent('info', 'retry', `Manual retry requested`, action.sensor)
              const sensorName = action.sensor
              // Reset tracker state for re-fetch
              tracker.resetFetchState(sensorName)
              tracker.resetSummaryState(sensorName)
              tracker.setFetchState(sensorName, 'running')

              // Re-fetch the single sensor
              const result = await fetchSensor(sensorName, config, (detail, itemCount) => {
                tracker.setFetchDetail(sensorName, detail, itemCount)
              })

              if (signal.aborted) break

              if (sensorResultSucceeded(result)) {
                tracker.setFetchState(sensorName, 'ok', result.items.length)
                tracker.addEvent('ok', 'retry', `Retry succeeded — ${result.items.length} items`, sensorName)
                failedSensors.delete(sensorName)

                // Merge retry result into report: remove old items by source, add new
                mergeRetryResult(sourceReport, result)
                await writeReport(sourceReport).catch(() => {})

                // Update sources_ok / sources_failed
                if (!sourceReport.sources_ok.includes(sensorName)) {
                  sourceReport.sources_ok.push(sensorName)
                }
                sourceReport.sources_failed = sourceReport.sources_failed.filter(n => n !== sensorName)

                // Summarize just this sensor
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
                // Stays in failedSensors — user can retry again or skip
              }
            }
          }

          g.__pipelinePauseResolve = null

          // Finalize summary state for any sensors still failed after pause loop.
          // When a sensor was retried and failed again, resetSummaryState set it back
          // to 'queued' but nothing re-skipped it — do so now before overall briefing.
          for (const name of failedSensors) {
            tracker.skipSummaryForSensor(name)
          }

          tracker.unpause()
        }

        // ── Generate overall briefing + intelligence analysis in parallel ──
        // Overall briefing: only needed when hasFetchFailures (deferred from summarizeReport).
        // Intelligence: uses raw report, independent of summary — safe to run in parallel.
        const overallPromise = (hasFetchFailures && summary && !signal.aborted)
          ? (async () => {
              tracker.setOverallSummary('running')
              const overall = await generateOverallBriefing(sourceReport, summary!.sections, baseSummarizeOpts)
              summary = { ...summary!, overall }
            })()
          : Promise.resolve()

        const intelligenceReport = report ?? cachedReport
        const intelligencePromise = (llmConfig && intelligenceReport && !signal.aborted)
          ? (async () => {
              tracker.addEvent('info', 'intelligence', 'Intelligence analysis started')
              try {
                const intelligence = await runIntelligenceAnalysis(intelligenceReport, llmConfig, signal, config.summary_language)

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
            })()
          : Promise.resolve()

        await Promise.all([overallPromise, intelligencePromise])

        // Write summary after overall briefing is done
        if (summary && !signal.aborted) {
          try {
            await writeSummary(summary, config.summary_language)
          } catch (err) {
            console.error('Failed to write summary cache:', err)
          }
        }
      } else {
        // No summary stage — still run intelligence if configured
        const intelligenceReport = report ?? cachedReport
        if (llmConfig && intelligenceReport && !signal.aborted) {
          tracker.addEvent('info', 'intelligence', 'Intelligence analysis started')
          try {
            const intelligence = await runIntelligenceAnalysis(intelligenceReport, llmConfig, signal, config.summary_language)

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
      }
    }

    // Clean up global pause state
    g.__pipelineReport = null
    g.__pipelineFailedSensors = null
    g.__pipelineConfig = null

    if (!signal.aborted) {
      const totalItems = tracker.snapshot().total_items
      tracker.addEvent('ok', 'system', `Pipeline complete — ${totalItems} items collected`)
      tracker.complete()
      // Clear temp pipeline_items now that results are promoted to permanent cache
      clearRunItems(tracker.snapshot().run_id!).catch(err =>
        console.warn('[pipeline] Failed to clear run items:', err),
      )
    } else {
      tracker.addEvent('warn', 'system', 'Pipeline cancelled')
    }
    return { report, summary }
  } finally {
    // Mark SummaryProgress complete for cross-page awareness — await to prevent
    // a race where status polls see running=true + alive=false (stale false positive)
    if (summaryStatus) {
      summaryStatus.running = false
      summaryStatus.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      await writeSummaryProgress(summaryStatus).catch(() => {})
    }
    summaryBus?.emitDone()
    // Persist final status BEFORE clearing singletons so the DB always reflects
    // the terminal state before isPipelineRunning() starts returning false.
    if (g.__pipelineTracker) {
      await writePipelineStatus(g.__pipelineTracker.snapshot()).catch(() => {})
    }
    // Clear singletons so a new run can start
    if (g.__pipelineAbortController === abortController) {
      g.__pipelineAbortController = null
      g.__pipelineTracker = null
      g.__pipelineSensorSkips = undefined
    }
  }
}

/**
 * Merge a retry result into the existing report: remove old items by source, insert new ones.
 * Uses the sensor taxonomy to place items in the correct category section.
 * Mutates the report in place.
 */
function mergeRetryResult(report: IntelReport, result: SensorResult): void {
  for (const section of Object.values(report.items)) {
    // Remove old items from this sensor
    for (let i = section.length - 1; i >= 0; i--) {
      if (section[i].source === result.sensor_name) {
        section.splice(i, 1)
      }
    }
  }
  // Insert new items into the correct category section using the taxonomy map
  const category = SENSOR_CATEGORY_MAP[result.sensor_name] as CategoryKey | undefined
  for (const item of result.items) {
    // Use the sensor's taxonomy category, falling back to the first non-empty section
    const targetSection = category ? report.items[category] : undefined
    if (targetSection) {
      targetSection.push(item)
    } else {
      // Fallback: place in the first section that exists
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
function mergeSensorSummary(summary: BriefingSummary, sensorSummary: import('../models').SensorSummary): void {
  const idx = summary.sections.findIndex(s => s.sensor_name === sensorSummary.sensor_name)
  if (idx >= 0) {
    summary.sections[idx] = sensorSummary
  } else {
    summary.sections.push(sensorSummary)
  }
}

/** Extract unique sensor names from a report's items. */
function extractSensorNames(report: IntelReport): string[] {
  const names = new Set<string>()
  for (const section of Object.values(report.items)) {
    for (const item of section) {
      names.add(item.source)
    }
  }
  return Array.from(names)
}
