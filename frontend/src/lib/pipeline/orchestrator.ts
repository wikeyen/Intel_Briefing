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
import { readReport, writeReport, writePipelineStatus } from './cache'
import { writeSummary, writeSummaryProgress, invalidateAllSensorSummaries, invalidateAllSummaries } from '../summary/cache'
import { summarizeReport, summarizeSingleSensor, generateOverallBriefing, type SummaryProgressCallback } from '../summary/summarizer'
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
}

/** Cancel the running pipeline, if any. Returns true if a pipeline was cancelled. */
export function cancelPipeline(): boolean {
  if (!g.__pipelineAbortController || !g.__pipelineTracker) return false
  g.__pipelineAbortController.abort()
  g.__pipelineTracker.cancel()
  g.__pipelineAbortController = null
  g.__pipelineTracker = null
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

      // Invalidate all cached summaries (all languages) — fresh fetch means fresh analysis
      if (shouldSummarize) {
        await Promise.all([
          invalidateAllSensorSummaries(),
          invalidateAllSummaries(),
        ]).catch(() => {})
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

        // Delegate to the unified summarization engine
        // fetch_summarize uses skipCache:true since we just invalidated caches above
        // summarize-only uses skipCache:false to reuse cached per-sensor summaries
        let skipCacheForSummary = shouldFetch
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

          // Auto-retry: reset failed sensors and re-run
          tracker.setRetryProgress(summaryAttempt + 1, MAX_AUTO_RETRIES)
          for (const name of summaryFailures) {
            tracker.setSummaryState(name, 'queued')
          }
          if (!hasFetchFailures) tracker.setOverallSummary('queued')

          // Re-run with skipCache:false — succeeded sensors hit cache, failed retry
          skipCacheForSummary = false
        }

        tracker.clearRetryProgress()
        g.__pipelineSkipRetries = false

        // ── Pause-before-overall: if fetch failures exist, wait for user actions ──
        if (hasFetchFailures && !signal.aborted && summary) {
          tracker.pause('pre_overall')

          // Pause loop: wait for user to resolve each failed sensor or trigger overall
          let generateNow = false
          while (failedSensors.size > 0 && !signal.aborted && !generateNow) {
            const action = await new Promise<PauseAction>(resolve => {
              g.__pipelinePauseResolve = resolve
            })

            if (action.type === 'cancel') break

            if (action.type === 'generate_overall') {
              generateNow = true
              break
            }

            if (action.type === 'skip_sensor') {
              failedSensors.delete(action.sensor)
              tracker.skipSummaryForSensor(action.sensor)
              // Already skipped in report — nothing more to do
            }

            if (action.type === 'retry_sensor') {
              const sensorName = action.sensor
              // Reset tracker state for re-fetch
              tracker.resetFetchState(sensorName)
              tracker.resetSummaryState(sensorName)
              tracker.setFetchState(sensorName, 'running')

              // Re-fetch the single sensor
              const result = await fetchSensor(sensorName, config, (detail) => {
                tracker.setFetchDetail(sensorName, detail)
              })

              if (signal.aborted) break

              if (sensorResultSucceeded(result)) {
                tracker.setFetchState(sensorName, 'ok', result.items.length)
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
                // Stays in failedSensors — user can retry again or skip
              }
            }
          }

          g.__pipelinePauseResolve = null
          tracker.unpause()
        }

        // ── Generate overall briefing ──
        // When hasFetchFailures was true, summarizeReport ran with skipOverall so we generate it now.
        // When no failures, summarizeReport already produced the overall — skip this block.
        if (hasFetchFailures && summary && !signal.aborted) {
          tracker.setOverallSummary('running')
          const overall = await generateOverallBriefing(sourceReport, summary.sections, baseSummarizeOpts)
          summary = { ...summary, overall }
        }

        if (summary && !signal.aborted) {
          try {
            await writeSummary(summary, config.summary_language)
          } catch (err) {
            console.error('Failed to write summary cache:', err)
          }
        }
      }
    }

    // Clean up global pause state
    g.__pipelineReport = null
    g.__pipelineFailedSensors = null
    g.__pipelineConfig = null

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
    }
  }
}

/**
 * Merge a retry result into the existing report: remove old items by source, insert new ones.
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
  // Insert new items into appropriate sections (the assembleReport already categorized them,
  // but for simplicity we add to the first non-empty match or the first section)
  for (const item of result.items) {
    // Find the section that already has items from this source, or use first section
    let placed = false
    for (const [, section] of Object.entries(report.items)) {
      if (section.some(existing => existing.source === result.sensor_name)) {
        section.push(item)
        placed = true
        break
      }
    }
    if (!placed) {
      // Place in the first section as fallback
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
