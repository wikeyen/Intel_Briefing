// ABOUTME: Pipeline orchestrator — coordinates sensor fetch+summarize through staged execution.
// ABOUTME: Delegates summarization to the unified engine; handles fetch stage and progress tracking.
import type {
  ConfigSettings,
  IntelReport,
  SensorResult,
  RunMode,
  BriefingSummary,
  SummaryProgress,
  SummarySensorProgress,
  ResumeDecision,
} from '../models'
import { sensorResultSucceeded, sensorLimit } from '../models'
import { Semaphore } from './semaphore'
import { PipelineProgressTracker } from './progress'
import { readReport, writePipelineStatus } from './cache'
import { writeSummary, writeSummaryProgress, invalidateAllSensorSummaries } from '../summary/cache'
import { summarizeReport, type SummaryProgressCallback } from '../summary/summarizer'
import type { LlmConfig } from '../summary/llm'
import { SENSOR_REGISTRY } from '../sensors'
import { SENSOR_LABELS } from '../sensors/taxonomy'
import { SensorConfigError } from '../sensors/errors'
import { assembleReport } from './report-builder'
import { createBus } from '../summary/events'

export interface PipelineResult {
  report: IntelReport | null
  summary: BriefingSummary | null
}

// Store on globalThis so it survives Next.js HMR module re-evaluation.
const g = globalThis as unknown as {
  __pipelineAbortController?: AbortController | null
  __pipelineTracker?: PipelineProgressTracker | null
  __pipelineResumeResolver?: ((decision: ResumeDecision) => void) | null
}

/** Cancel the running pipeline, if any. Returns true if a pipeline was cancelled. */
export function cancelPipeline(): boolean {
  if (!g.__pipelineAbortController || !g.__pipelineTracker) return false
  g.__pipelineAbortController.abort()
  g.__pipelineTracker.cancel()
  // Unblock any pending resume so the orchestrator can exit
  if (g.__pipelineResumeResolver) {
    g.__pipelineResumeResolver({ action: 'proceed' })
    g.__pipelineResumeResolver = null
  }
  g.__pipelineAbortController = null
  g.__pipelineTracker = null
  return true
}

/** Check whether a pipeline is currently running. */
export function isPipelineRunning(): boolean {
  return g.__pipelineAbortController != null
}

/** Check whether the pipeline is paused awaiting user decision. */
export function isPipelinePaused(): boolean {
  return g.__pipelineResumeResolver != null
}

/** Resume a paused pipeline with the user's decision. Returns true if a pipeline was resumed. */
export function resumePipeline(decision: ResumeDecision): boolean {
  if (!g.__pipelineResumeResolver) return false
  g.__pipelineResumeResolver(decision)
  g.__pipelineResumeResolver = null
  return true
}

/** Pause the pipeline and wait for a user decision (retry/proceed). */
function waitForUserDecision(
  tracker: PipelineProgressTracker,
  stage: 'fetch' | 'summary',
): Promise<ResumeDecision> {
  tracker.pause(stage)
  return new Promise<ResumeDecision>(resolve => {
    g.__pipelineResumeResolver = resolve
  })
}

/**
 * Run a single sensor's fetch function and return a SensorResult.
 * Catches all errors so one failing sensor never blocks the pipeline.
 */
async function fetchSensor(
  name: string,
  config: ConfigSettings,
  onProgress?: (detail: string) => void,
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
  const abortController = new AbortController()
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
      writePipelineStatus(tracker.snapshot()).catch(() => {})
      tracker.complete()
      return { report: null, summary: null }
    }
  }

  // Determine sensor names for the tracker: use registry names for fetch modes,
  // and derive from the cached report for summarize-only mode.
  // In both cases, only include sensors that are enabled and have data.
  const trackerSensorNames = mode === 'summarize'
    ? extractSensorNames(cachedReport!).filter(name => config.sensors_enabled[name] !== false)
    : registrySensorNames

  // Create progress tracker with persistence callback
  const tracker = new PipelineProgressTracker(trackerSensorNames, mode, defaultConcurrency, localSummaryConcurrency, (status) => {
    writePipelineStatus(status).catch(() => {})
  })

  // Store singletons for abort support
  g.__pipelineAbortController = abortController
  g.__pipelineTracker = tracker

  // Write initial status
  writePipelineStatus(tracker.snapshot()).catch(() => {})

  let report: IntelReport | null = null
  let summary: BriefingSummary | null = null

  // Build enabled sensor set for the unified engine
  const enabledSensors = new Set(registrySensorNames)

  // SummaryProgress for cross-page awareness — Feed page polls intel:summary_status.
  // Initialized lazily when summarize stage begins.
  let summaryStatus: SummaryProgress | null = null

  // Event bus for streaming tokens — created lazily when summarize stage begins
  let summaryBus: ReturnType<typeof createBus> | null = null

  try {
    // Track sensors that failed fetch — for progress tracker skip marking
    const failedSensors = new Set<string>()

    if (shouldFetch) {
      // Stage 1: Run all sensor fetches with retry loop on failures
      const resultMap = new Map<string, SensorResult>()

      // Inner function to fetch a batch of sensors concurrently
      const fetchBatch = async (sensorNames: string[]) => {
        const promises = sensorNames.map(name =>
          fetchSemaphore.run(async () => {
            if (signal.aborted) return
            tracker.setFetchState(name, 'running')
            const result = await fetchSensor(name, config, (detail) => {
              tracker.setFetchDetail(name, detail)
            })
            if (signal.aborted) return
            resultMap.set(name, result)
            if (sensorResultSucceeded(result)) {
              tracker.setFetchState(name, 'ok', result.items.length)
              failedSensors.delete(name)
            } else {
              tracker.setFetchState(name, 'failed', 0, result.error, result.error_kind ?? 'api')
              failedSensors.add(name)
            }
          }),
        )
        await Promise.all(promises)
      }

      // Initial fetch of all sensors
      await fetchBatch(registrySensorNames)

      // Pause on failures only when there's a next stage (summary) — no point
      // pausing fetch-only mode since there's nothing to "proceed to".
      while (shouldSummarize && failedSensors.size > 0 && !signal.aborted) {
        const decision = await waitForUserDecision(tracker, 'fetch')
        tracker.resume()
        if (signal.aborted || decision.action === 'proceed') break
        const toRetry = (decision.sensors ?? [...failedSensors]).filter(s => failedSensors.has(s))
        if (toRetry.length === 0) break
        // Reset tracker state for retried sensors
        for (const name of toRetry) {
          tracker.setFetchState(name, 'queued')
        }
        await fetchBatch(toRetry)
      }

      if (signal.aborted) {
        const completed = [...resultMap.values()]
        if (completed.length > 0) {
          report = await assembleReport(completed, config, { llmConfig, signal })
        }
        return { report, summary: null }
      }

      report = await assembleReport([...resultMap.values()], config, { llmConfig, signal })

      // Mark failed sensors' summaries as skipped — they don't pass to the next stage
      if (shouldSummarize) {
        for (const name of failedSensors) {
          tracker.skipSummaryForSensor(name)
        }
      }

      // Invalidate all per-sensor summary caches — fresh fetch means fresh analysis
      if (shouldSummarize) {
        await invalidateAllSensorSummaries().catch(() => {})
      }
    }

    if (shouldSummarize) {
      // Use the freshly-fetched report, or the pre-loaded cached report
      const sourceReport = report ?? cachedReport
      if (!sourceReport) {
        tracker.complete()
        return { report: null, summary: null }
      }

      // Build SummaryProgress for cross-page awareness (Feed page polls intel:summary_status)
      const eligibleSensors = trackerSensorNames.filter(n => !failedSensors.has(n))
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
        // Bridge between tracker and the unified engine's progress callback
        const onProgress: SummaryProgressCallback = (sensorName, _label, state, error, chunks, verify) => {
          summaryBus!.emitState(sensorName, state, _label, error)
          if (sensorName === '__overall__') {
            if (state === 'running') tracker.setOverallSummary('running')
            else if (state === 'ok') tracker.setOverallSummary('ok')
            else if (state === 'failed') tracker.setOverallSummary('failed')
          } else {
            if (state === 'running') {
              tracker.setSummaryState(sensorName, 'running')
              if (chunks) tracker.setSummaryChunks(sensorName, chunks.total, chunks.done)
            } else if (state === 'ok' || state === 'cached') {
              tracker.setSummaryState(sensorName, 'ok')
            } else if (state === 'failed') {
              tracker.setSummaryState(sensorName, 'failed', error ?? undefined)
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

        // Delegate to the unified summarization engine
        // fetch_summarize uses skipCache:true since we just invalidated caches above
        // summarize-only uses skipCache:false to reuse cached per-sensor summaries
        let skipCacheForSummary = shouldFetch
        // eslint-disable-next-line no-constant-condition
        while (true) {
          summary = await summarizeReport(sourceReport, {
            llmConfig,
            concurrency: effectiveSummaryConcurrency,
            promptOverrides: config.summary_sensor_prompts,
            overallPromptOverride: config.summary_overall_prompt,
            signal,
            onProgress,
            skipCache: skipCacheForSummary,
            enabledSensors,
            language: config.summary_language,
            onToken: (sensorName, token) => summaryBus!.emitToken(sensorName, token),
            attributionLlmConfig: buildAttributionLlmConfig(config) ?? undefined,
          })

          if (signal.aborted) break

          // Check for per-sensor summary failures
          const snap = tracker.snapshot()
          const summaryFailures = snap.sensors
            .filter(s => s.summary === 'failed')
            .map(s => s.name)

          if (summaryFailures.length === 0) break

          // Pause and let user decide retry or proceed
          const decision = await waitForUserDecision(tracker, 'summary')
          tracker.resume()
          if (signal.aborted || decision.action === 'proceed') break

          const toRetry = (decision.sensors ?? summaryFailures).filter(s => summaryFailures.includes(s))
          if (toRetry.length === 0) break

          // Reset state for retried sensors and overall
          for (const name of toRetry) {
            tracker.setSummaryState(name, 'queued')
          }
          tracker.setOverallSummary('queued')

          // Re-run with skipCache:false — succeeded sensors hit cache, failed retry
          skipCacheForSummary = false
        }

        if (summary && !signal.aborted) {
          try {
            await writeSummary(summary)
          } catch (err) {
            console.error('Failed to write summary cache:', err)
          }
        }
      }
    }

    if (!signal.aborted) {
      tracker.complete()
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
    // running=false before isPipelineRunning() starts returning false.
    // This prevents a race where a status poll sees running=true + alive=false.
    if (g.__pipelineTracker && g.__pipelineAbortController === abortController) {
      await writePipelineStatus(g.__pipelineTracker.snapshot()).catch(() => {})
    }
    // Clear singletons so a new run can start
    if (g.__pipelineAbortController === abortController) {
      g.__pipelineAbortController = null
      g.__pipelineTracker = null
      g.__pipelineResumeResolver = null
    }
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
