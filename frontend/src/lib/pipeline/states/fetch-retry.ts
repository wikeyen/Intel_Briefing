// ABOUTME: Fetch-retry state handler — auto-retries failed sensors up to MAX_AUTO_RETRIES.
// ABOUTME: Transitions to paused if failures remain after retries (was: silently proceed).

import { sensorResultSucceeded } from '../../models'
import { fetchSensor, mergeRetryResult, MAX_AUTO_RETRIES } from '../helpers'
import { writeReport } from '../cache'
import { writePipelineItem } from '../../db'
import type { PipelineContext, PipelineState, FailureKind } from '../types'

/**
 * Fetch-retry state: auto-retry failed sensors up to MAX_AUTO_RETRIES times.
 * Config errors (e.g. missing API key) are not retryable — they need user action.
 * Successful retries merge items back into ctx.report so downstream handlers see them.
 *
 * Returns:
 *  - 'summarizing'  always (summarizing handler decides whether to pause)
 *  - 'cancelled'    if aborted
 */
export async function handleFetchRetry(ctx: PipelineContext): Promise<PipelineState> {
  const { config, signal, tracker, failureKinds } = ctx

  // Identify retryable sensors — config errors are not retryable
  const retryableSensors = () => [...ctx.failures].filter(name => {
    const kind = failureKinds.get(name)
    return kind !== 'config'
  })

  for (let attempt = 1; attempt <= MAX_AUTO_RETRIES && !signal.aborted; attempt++) {
    if (ctx.skipRetries) break
    const toRetry = retryableSensors()
    if (toRetry.length === 0) break

    tracker.addEvent('info', 'retry', `Auto-retry ${attempt}/${MAX_AUTO_RETRIES} — ${toRetry.join(', ')}`)
    tracker.setRetryProgress(attempt, MAX_AUTO_RETRIES)

    for (const name of toRetry) {
      tracker.setFetchState(name, 'queued')
    }

    // Retry sensors serially (small batches don't need Semaphore)
    for (const name of toRetry) {
      if (signal.aborted) break
      if (ctx.skipRetries) break

      tracker.setFetchState(name, 'running')
      const result = await fetchSensor(name, config, (detail, itemCount) => {
        tracker.setFetchDetail(name, detail, itemCount)
      })

      if (signal.aborted) break

      if (sensorResultSucceeded(result)) {
        tracker.setFetchState(name, 'ok', result.items.length)
        if (result.items.length === 0) {
          tracker.addEvent('warn', 'fetch', 'Fetched 0 items', name)
        } else {
          tracker.addEvent('ok', 'fetch', `Fetched ${result.items.length} items`, name)
        }
        ctx.failures.delete(name)
        ctx.failureKinds.delete(name)

        // Merge the recovered items into the existing report
        if (ctx.report) {
          mergeRetryResult(ctx.report, result)
          await writeReport(ctx.report).catch(() => {})
          if (!ctx.report.sources_ok.includes(name)) {
            ctx.report.sources_ok.push(name)
          }
          ctx.report.sources_failed = ctx.report.sources_failed.filter(n => n !== name)
        }

        // Write to temp DB for crash-safe incremental recovery
        const runId = tracker.snapshot().run_id!
        const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
        writePipelineItem(name, runId, result.items, nowIso).catch(err =>
          console.warn(`[pipeline] Failed to write pipeline_item for ${name}:`, err),
        )
      } else {
        tracker.setFetchState(name, 'failed', 0, result.error, result.error_kind ?? 'api')
        tracker.addEvent('error', 'retry', result.error ?? 'Retry failed', name)
        ctx.failureKinds.set(name, (result.error_kind ?? 'api') as FailureKind)
      }
    }
  }

  tracker.clearRetryProgress()
  ctx.skipRetries = false

  if (signal.aborted) return 'cancelled'

  // Always proceed to summarizing — even with failures remaining.
  // The summarizing handler runs per-sensor summaries (skipping failed sensors),
  // then transitions to 'paused' if fetch failures exist, or 'briefing' if all ok.
  return 'summarizing'
}
