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

// Module-level singletons for abort support
let activeAbortController: AbortController | null = null
let activeTracker: PipelineProgressTracker | null = null

/** Cancel the running pipeline, if any. Returns true if a pipeline was cancelled. */
export function cancelPipeline(): boolean {
  if (!activeAbortController || !activeTracker) return false
  activeAbortController.abort()
  activeTracker.cancel()
  activeAbortController = null
  activeTracker = null
  return true
}

/** Check whether a pipeline is currently running. */
export function isPipelineRunning(): boolean {
  return activeAbortController !== null
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
): Promise<PipelineResult> {
  const abortController = new AbortController()
  const { signal } = abortController

  const defaultConcurrency = config.default_concurrency ?? 4
  const localSummaryConcurrency = config.local_summary_concurrency ?? 1
  const isLocalModel = config.summary_provider === 'local'
  const effectiveSummaryConcurrency = isLocalModel ? localSummaryConcurrency : defaultConcurrency
  const fetchSemaphore = new Semaphore(defaultConcurrency)

  // Identify enabled sensors from the registry
  const registrySensorNames = Object.keys(SENSOR_REGISTRY).filter(
    name => config.sensors_enabled[name] !== false,
  )

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
  activeAbortController = abortController
  activeTracker = tracker

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
      // Stage 1: Run all sensor fetches concurrently through the fetch semaphore
      const fetchPromises = registrySensorNames.map(name =>
        fetchSemaphore.run(async () => {
          if (signal.aborted) return null
          tracker.setFetchState(name, 'running')
          const result = await fetchSensor(name, config, (detail) => {
            tracker.setFetchDetail(name, detail)
          })
          if (signal.aborted) return null
          if (sensorResultSucceeded(result)) {
            tracker.setFetchState(name, 'ok', result.items.length)
          } else {
            tracker.setFetchState(name, 'failed', 0, result.error, result.error_kind ?? 'api')
            failedSensors.add(name)
          }
          return result
        }),
      )

      // Wait for ALL fetches to complete before moving to summary stage
      const results = await Promise.all(fetchPromises)

      if (signal.aborted) {
        // Assemble partial report from completed (non-null) results
        const completed = results.filter((r): r is SensorResult => r !== null)
        if (completed.length > 0) {
          report = await assembleReport(completed, config)
        }
        return { report, summary: null }
      }

      report = await assembleReport(results as SensorResult[], config)

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
        summary = await summarizeReport(sourceReport, {
          llmConfig,
          concurrency: effectiveSummaryConcurrency,
          promptOverrides: config.summary_sensor_prompts,
          overallPromptOverride: config.summary_overall_prompt,
          signal,
          onProgress,
          skipCache: shouldFetch,
          enabledSensors,
          onToken: (sensorName, token) => summaryBus!.emitToken(sensorName, token),
        })

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
    // Mark SummaryProgress complete for cross-page awareness
    if (summaryStatus) {
      summaryStatus.running = false
      summaryStatus.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      writeSummaryProgress(summaryStatus).catch(() => {})
    }
    summaryBus?.emitDone()
    // Persist final status BEFORE clearing singletons so the DB always reflects
    // running=false before isPipelineRunning() starts returning false.
    // This prevents a race where a status poll sees running=true + alive=false.
    if (activeTracker && activeAbortController === abortController) {
      await writePipelineStatus(activeTracker.snapshot()).catch(() => {})
    }
    // Clear singletons so a new run can start
    if (activeAbortController === abortController) {
      activeAbortController = null
      activeTracker = null
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
