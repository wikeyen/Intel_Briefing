// ABOUTME: Setup state handler — initialises tracker, checks caches, decides first transition.
// ABOUTME: Handles summarize-only cached report, incremental run skips, and resume-window logic.

import type { IntelItem, SensorResult } from '../../models'
import { PipelineProgressTracker } from '../progress'
import { readReport, writePipelineStatus } from '../cache'
import { readSummary } from '../../summary/cache'
import { readIntelligence } from '../intelligence-cache'
import { assembleReport } from '../report-builder'
import { readFreshPipelineItems, clearRunItems } from '../../db'
import { extractSensorNames } from '../helpers'
import type { PipelineContext, PipelineState } from '../types'

/**
 * Setup state: initialise the progress tracker, check caches, and decide
 * which pipeline stage to run first.
 *
 * Populates ctx: tracker, cachedReport, cachedSensorItems, sensorsToFetch,
 * trackerSensorNames, enabledSensors, report (on early exit).
 *
 * Returns:
 *  - 'complete'     if early exit (all cached with valid analysis) or nothing to do
 *  - 'fetching'     if mode includes fetch
 *  - 'summarizing'  if summarize-only mode
 */
export async function handleSetup(ctx: PipelineContext): Promise<PipelineState> {
  const { config, mode, signal, allEnabledSensors, sensorFilter } = ctx

  const defaultConcurrency = config.default_concurrency ?? 4
  const localSummaryConcurrency = config.local_summary_concurrency ?? 1

  const shouldFetch = mode === 'fetch' || mode === 'fetch_summarize' || mode === 'fetch_intelligence'
  const shouldSkipBriefingAndIntel = mode === 'fetch_intelligence'
  const shouldSummarize = mode === 'summarize' || mode === 'fetch_summarize'
  const shouldIntel = mode === 'intelligence'

  // Identify sensors to run (optionally filtered to a subset)
  const registrySensorNames = sensorFilter?.length
    ? allEnabledSensors.filter(name => sensorFilter.includes(name))
    : allEnabledSensors

  // For summarize-only mode, load the cached report up front so we can derive
  // sensor names for the tracker from the report's actual contents.
  if (mode === 'summarize' || mode === 'intelligence') {
    ctx.cachedReport = await readReport()
    if (!ctx.cachedReport) {
      // No cached report — create a minimal tracker, mark complete, return empty
      const tracker = new PipelineProgressTracker(
        [], mode, defaultConcurrency, localSummaryConcurrency,
        (status) => { writePipelineStatus(status).catch(() => {}) },
      )
      ctx.tracker = tracker
      await writePipelineStatus(tracker.snapshot()).catch(() => {})
      tracker.complete()
      return 'complete'
    }
  }

  // Determine sensor names for the tracker:
  // - summarize-only: derive from cached report
  // - incremental: track ALL enabled sensors (fetch skips non-filtered, summary covers all)
  // - normal: track only the sensors being run
  const trackerSensorNames = mode === 'summarize'
    ? extractSensorNames(ctx.cachedReport!).filter(name => config.sensors_enabled[name] !== false)
    : ctx.isIncrementalRun
      ? allEnabledSensors
      : registrySensorNames
  ctx.trackerSensorNames = trackerSensorNames

  // Create progress tracker with persistence callback
  const tracker = new PipelineProgressTracker(
    trackerSensorNames, mode, defaultConcurrency, localSummaryConcurrency,
    (status) => { writePipelineStatus(status).catch(() => {}) },
  )
  ctx.tracker = tracker

  // For incremental runs, mark non-filtered sensors' fetch as already cached (skipped).
  if (ctx.isIncrementalRun) {
    const filterSet = new Set(sensorFilter!)
    for (const name of allEnabledSensors) {
      if (!filterSet.has(name)) {
        tracker.setFetchState(name, 'skipped', 0)
        tracker.addEvent('info', 'fetch', 'Skipped — data from previous run', name)
      }
    }
  }

  // Write initial status
  await writePipelineStatus(tracker.snapshot()).catch(() => {})
  tracker.addEvent('info', 'system', `Pipeline started — mode: ${mode}, ${trackerSensorNames.length} sensors`)

  // --- Incremental: check pipeline_items for fresh sensors ---
  const resumeWindowHours = config.resume_window_hours ?? 0

  if (shouldFetch && resumeWindowHours > 0) {
    try {
      const freshItems = await readFreshPipelineItems(resumeWindowHours)
      for (const [sensorName, data] of freshItems) {
        if (registrySensorNames.includes(sensorName)) {
          ctx.cachedSensorItems.set(sensorName, data)
          tracker.setCachedSensor(sensorName, data.items.length)
          tracker.addEvent('info', 'fetch', `Cached (${data.items.length} items, within ${resumeWindowHours}h window)`, sensorName)
        }
      }
      if (ctx.cachedSensorItems.size > 0) {
        tracker.addEvent('info', 'system', `Incremental: ${ctx.cachedSensorItems.size} sensors cached, ${registrySensorNames.length - ctx.cachedSensorItems.size} to fetch`)
      }
    } catch (err) {
      console.warn('[pipeline] Failed to read fresh pipeline items:', err)
      tracker.addEvent('warn', 'system', 'Incremental resume failed — fetching all sensors')
    }
  }

  // Filter out cached sensors from the fetch list
  ctx.sensorsToFetch = registrySensorNames.filter(name => !ctx.cachedSensorItems.has(name))

  // Early exit: all sensors cached AND existing analysis available — reuse everything
  if (ctx.sensorsToFetch.length === 0 && shouldSummarize && ctx.cachedSensorItems.size > 0) {
    const existingSummary = await readSummary(config.summary_language)
    const existingIntelligence = await readIntelligence()

    if (existingSummary && existingIntelligence) {
      tracker.addEvent('info', 'system', 'All sensors cached — no new data, reusing existing analysis')

      // Mark all sensors as fetched-from-cache and summarized-from-cache
      for (const name of registrySensorNames) {
        const cached = ctx.cachedSensorItems.get(name)
        tracker.setCachedSensor(name, cached?.items.length ?? 0)
        tracker.setSummaryState(name, 'ok')
        tracker.setSummaryCached(name)
      }
      tracker.setOverallSummary('ok')
      tracker.addEvent('ok', 'intelligence', 'Reused cached intelligence')

      const cachedResults: SensorResult[] = [...ctx.cachedSensorItems].map(([sensorName, cached]) => ({
        sensor_name: sensorName,
        items: cached.items as IntelItem[],
        error: null,
        error_kind: null,
      }))

      const sensorTimestamps: Record<string, string> = {}
      for (const [name, cached] of ctx.cachedSensorItems) {
        sensorTimestamps[name] = cached.fetchedAt
      }
      ctx.report = await assembleReport(cachedResults, config, {
        llmConfig: ctx.llmConfig,
        signal,
        sensorFilter,
        sensorTimestamps,
      })
      ctx.summary = existingSummary

      const itemCount = ctx.report
        ? Object.values(ctx.report.items).reduce((sum, arr) => sum + arr.length, 0)
        : 0
      tracker.addEvent('ok', 'system', `Pipeline complete — ${itemCount} items collected (all cached)`)
      tracker.complete()
      clearRunItems(tracker.snapshot().run_id!).catch(err =>
        console.warn('[pipeline] Failed to clear run items:', err),
      )
      await writePipelineStatus(tracker.snapshot()).catch(() => {})
      return 'complete'
    }
    // Summary or intelligence cache expired — fall through to regenerate LLM phases
    tracker.addEvent('info', 'system', `All sensors cached but ${!existingSummary ? 'summary' : 'intelligence'} cache expired — regenerating`)
  }

  // Build enabled sensor set for the unified engine.
  // Incremental runs summarize ALL enabled sensors (cache hits for unchanged).
  ctx.enabledSensors = ctx.isIncrementalRun
    ? new Set(allEnabledSensors)
    : new Set(registrySensorNames)

  // Decide next state
  if (shouldFetch) return 'fetching'
  if (shouldSummarize) return 'summarizing'
  if (shouldIntel) return 'intelligence'
  return 'complete'
}
