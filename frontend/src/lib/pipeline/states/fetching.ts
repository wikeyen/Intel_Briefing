// ABOUTME: Fetching state handler — runs concurrent sensor fetches with skip-race support.
// ABOUTME: Assembles the report from results, marks failed summaries, invalidates caches.

import type { IntelItem, SensorResult } from '../../models'
import { sensorResultSucceeded } from '../../models'
import { Semaphore } from '../semaphore'
import { assembleReport } from '../report-builder'
import { invalidateAllSensorSummaries, invalidateAllSummaries } from '../../summary/cache'
import { writePipelineItem } from '../../db'
import { fetchSensor } from '../helpers'
import type { PipelineContext, PipelineState, FailureKind } from '../types'

/**
 * Fetching state: run all sensor fetches concurrently (with Semaphore), assemble report,
 * and mark failed/skipped sensor summaries. Invalidates summary caches before summarization.
 *
 * Populates ctx: report, failures, failureKinds
 *
 * Returns:
 *  - 'cancelled'    if signal aborted during fetch
 *  - 'complete'     if fetch-only mode
 *  - 'fetch_retry'  if there are failures and we should summarize
 *  - 'summarizing'  if no failures (or no summarize stage)
 */
export async function handleFetching(ctx: PipelineContext): Promise<PipelineState> {
  const { config, signal, tracker, sensorsToFetch, cachedSensorItems, sensorFilter } = ctx

  const shouldSummarize = ctx.mode === 'summarize' || ctx.mode === 'fetch_summarize'
  const defaultConcurrency = config.default_concurrency ?? 4
  const fetchSemaphore = new Semaphore(defaultConcurrency)

  const resultMap = new Map<string, SensorResult>()

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
        ctx.sensorSkips.set(name, skipResolve!)

        const outcome = await Promise.race([
          fetchSensor(name, config, (detail, itemCount) => {
            tracker.setFetchDetail(name, detail, itemCount)
          }),
          skipPromise,
        ])

        ctx.sensorSkips.delete(name)

        if (signal.aborted) return

        if (outcome === 'SKIPPED') {
          tracker.setFetchState(name, 'skipped', 0)
          tracker.addEvent('info', 'fetch', `Skipped by user`, name)
          ctx.failures.delete(name)
          ctx.skippedSensors.add(name)
          return
        }

        const result = outcome
        resultMap.set(name, result)
        if (sensorResultSucceeded(result)) {
          tracker.setFetchState(name, 'ok', result.items.length)
          if (result.items.length === 0) {
            tracker.addEvent('warn', 'fetch', 'Fetched 0 items', name)
          } else {
            tracker.addEvent('ok', 'fetch', `Fetched ${result.items.length} items`, name)
          }
          ctx.failures.delete(name)
          // Write to temp DB for crash-safe incremental recovery
          const runId = tracker.snapshot().run_id!
          const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
          writePipelineItem(name, runId, result.items, nowIso).catch(err =>
            console.warn(`[pipeline] Failed to write pipeline_item for ${name}:`, err),
          )
        } else {
          tracker.setFetchState(name, 'failed', 0, result.error, result.error_kind ?? 'api')
          tracker.addEvent('error', 'fetch', result.error ?? 'Unknown error', name)
          ctx.failures.add(name)
          ctx.failureKinds.set(name, (result.error_kind ?? 'api') as FailureKind)
        }
      }),
    )
    await Promise.all(promises)
  }

  // Initial fetch — skip sensors already cached from a previous run
  await fetchBatch(sensorsToFetch)

  // Auto-retry: delegate to fetch_retry state if there are failures and we're summarizing
  // First check for cancellation
  if (signal.aborted) {
    tracker.addEvent('warn', 'system', 'Pipeline cancelled during fetch')
    return 'cancelled'
  }

  // Add cached sensor items as successful results for report assembly
  for (const [sensorName, cached] of cachedSensorItems) {
    if (!resultMap.has(sensorName)) {
      resultMap.set(sensorName, {
        sensor_name: sensorName,
        items: cached.items as IntelItem[],
        error: null,
        error_kind: null,
      })
    }
  }

  const freshOk = [...resultMap.values()].filter(r => sensorResultSucceeded(r) && !cachedSensorItems.has(r.sensor_name)).length
  const failedCount = [...resultMap.values()].filter(r => !sensorResultSucceeded(r)).length
  tracker.addEvent('info', 'fetch', `Fetch complete — ${freshOk} fetched, ${cachedSensorItems.size} cached, ${failedCount} failed`)

  const cachedTimestamps: Record<string, string> = {}
  for (const [name, cached] of cachedSensorItems) {
    cachedTimestamps[name] = cached.fetchedAt
  }
  ctx.report = await assembleReport([...resultMap.values()], config, {
    llmConfig: ctx.llmConfig,
    signal,
    sensorFilter,
    sensorTimestamps: cachedTimestamps,
  })

  // Mark failed/skipped sensors' summaries as skipped — they don't pass to the next stage
  if (shouldSummarize) {
    for (const name of ctx.failures) {
      tracker.skipSummaryForSensor(name)
    }
    for (const name of ctx.skippedSensors) {
      tracker.skipSummaryForSensor(name)
    }
    // For incremental runs, also skip summaries for sensors that failed in a
    // previous run and weren't retried in this one
    if (ctx.isIncrementalRun && ctx.report) {
      const filterSet = new Set(sensorFilter!)
      for (const name of ctx.report.sources_failed) {
        if (!filterSet.has(name) && !ctx.failures.has(name)) {
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
    if (ctx.isIncrementalRun) {
      await invalidateAllSummaries().catch(() => {})
    } else {
      await Promise.all([
        invalidateAllSensorSummaries(),
        invalidateAllSummaries(),
      ]).catch(() => {})
    }
  }

  // Decide next state
  if (!shouldSummarize) return 'complete'
  if (ctx.failures.size > 0 && shouldSummarize) return 'fetch_retry'
  return 'summarizing'
}
