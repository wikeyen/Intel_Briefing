// ABOUTME: Fetching state handler — runs concurrent sensor fetches with inline retry.
// ABOUTME: Assembles the report from results, marks failed summaries, invalidates caches.

import type { IntelItem, SensorResult, StageState } from '../../models'
import { sensorResultSucceeded } from '../../models'
import { Semaphore } from '../semaphore'
import { assembleReport } from '../report-builder'
import { invalidateAllSensorSummaries, invalidateAllSummaries } from '../../summary/cache'
import { writePipelineItem } from '../../db'
import { fetchSensor, MAX_AUTO_RETRIES, retryDelayMs } from '../helpers'
import type { PipelineContext, PipelineState, FailureKind } from '../types'

/** Sleep that resolves early if the abort signal fires. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => { clearTimeout(timer); resolve() }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Fetching state: run all sensor fetches concurrently (with Semaphore), assemble report,
 * and mark failed/skipped sensor summaries. Invalidates summary caches before summarization.
 *
 * Each sensor retries inline (up to MAX_AUTO_RETRIES) on retryable failures before moving on.
 *
 * Populates ctx: report, failures, failureKinds
 *
 * Returns:
 *  - 'cancelled'    if signal aborted during fetch
 *  - 'complete'     if fetch-only mode
 *  - 'summarizing'  if we should summarize (even with failures — summarizing defers to paused)
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

        // Initialize sub-items for topic sensors with topic keywords
        if ((name === 'bluesky_topics' || name === 'mastodon_topics') && config.social_topics_keywords.length > 0) {
          tracker.initSubItems(name, config.social_topics_keywords.map(kw => ({ key: kw, label: kw })))
        }

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
          }, (key, state, itemCount, error) => {
            tracker.setSubItemState(name, key, state as StageState, itemCount, error)
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

        // Inline retry for retryable failures — retry immediately within the semaphore slot.
        // Only retry when the pipeline will summarize (fetch-only mode skips retries).
        let finalResult = outcome
        if (shouldSummarize && !sensorResultSucceeded(finalResult) && finalResult.error_kind !== 'config') {
          tracker.addEvent('error', 'fetch', finalResult.error ?? 'Unknown error', name)
          for (let attempt = 1; attempt <= MAX_AUTO_RETRIES && !signal.aborted && !ctx.skipRetries; attempt++) {
            const delayMs = retryDelayMs(attempt)
            tracker.setFetchState(name, 'queued')
            tracker.addEvent('info', 'retry', `Retry ${attempt}/${MAX_AUTO_RETRIES} in ${Math.round(delayMs / 1000)}s`, name)

            await abortableSleep(delayMs, signal)
            if (signal.aborted) break

            tracker.setFetchState(name, 'running')
            const retryResult = await fetchSensor(name, config, (detail, itemCount) => {
              tracker.setFetchDetail(name, detail, itemCount)
            }, (key, state, itemCount, error) => {
              tracker.setSubItemState(name, key, state as StageState, itemCount, error)
            })

            if (signal.aborted) break

            finalResult = retryResult
            if (sensorResultSucceeded(finalResult)) {
              tracker.addEvent('ok', 'retry', `Retry ${attempt} succeeded — ${finalResult.items.length} items`, name)
              break
            }
            tracker.addEvent('warn', 'retry', `Retry ${attempt} failed: ${finalResult.error}`, name)
          }
        }

        if (signal.aborted) return

        if (sensorResultSucceeded(finalResult)) {
          resultMap.set(name, finalResult)
          tracker.setFetchState(name, 'ok', finalResult.items.length)
          if (finalResult.items.length === 0) {
            tracker.addEvent('warn', 'fetch', 'Fetched 0 items', name)
          } else if (finalResult === outcome) {
            // Only log if this is the original success (retry success already logged)
            tracker.addEvent('ok', 'fetch', `Fetched ${finalResult.items.length} items`, name)
          }
          ctx.failures.delete(name)
          // Write to temp DB for crash-safe incremental recovery
          const runId = tracker.snapshot().run_id!
          const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
          writePipelineItem(name, runId, finalResult.items, nowIso).catch(err =>
            console.warn(`[pipeline] Failed to write pipeline_item for ${name}:`, err),
          )
        } else if (finalResult.error_kind === 'config') {
          // Config errors are intentional — sensor is not configured, not broken
          tracker.setFetchState(name, 'skipped', 0, finalResult.error, 'config')
          tracker.addEvent('info', 'fetch', finalResult.error ?? 'Not configured', name)
          ctx.skippedSensors.add(name)
        } else {
          resultMap.set(name, finalResult)
          tracker.setFetchState(name, 'failed', 0, finalResult.error, finalResult.error_kind ?? 'api')
          if (finalResult === outcome) {
            // Log failure only if no retries were attempted (retry failures already logged)
            tracker.addEvent('error', 'fetch', finalResult.error ?? 'Unknown error', name)
          }
          ctx.failures.add(name)
          ctx.failureKinds.set(name, (finalResult.error_kind ?? 'api') as FailureKind)
        }
      }),
    )
    await Promise.all(promises)
  }

  // Initial fetch — skip sensors already cached from a previous run
  await fetchBatch(sensorsToFetch)
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

  // Decide next state — retries are done inline, go straight to summarizing
  if (!shouldSummarize) return 'complete'
  return 'summarizing'
}
