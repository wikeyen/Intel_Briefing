// ABOUTME: Summary-retry state handler — auto-retries per-sensor summary failures.
// ABOUTME: Transitions to paused if retries exhausted (was: silently proceed).

import { summarizeReport } from '../../summary/summarizer'
import { writeSummaryProgress } from '../../summary/cache'
import { MAX_AUTO_RETRIES } from '../helpers'
import type { PipelineContext, PipelineState } from '../types'

/**
 * Summary-retry state: auto-retry per-sensor summary failures up to MAX_AUTO_RETRIES.
 * Resets failed sensors in both tracker AND summaryStatus before each re-run.
 *
 * Returns:
 *  - 'paused'    if failures remain after retries, or if fetch failures exist
 *  - 'briefing'  if all recovered
 *  - 'cancelled' if aborted
 */
export async function handleSummaryRetry(ctx: PipelineContext): Promise<PipelineState> {
  const { signal, tracker, summaryStatus, baseSummarizeOpts } = ctx
  if (!baseSummarizeOpts) return 'briefing'

  const hasFetchFailures = ctx.failures.size > 0
  const sourceReport = ctx.report ?? ctx.cachedReport
  if (!sourceReport) return 'briefing'

  for (let attempt = 1; attempt <= MAX_AUTO_RETRIES && !signal.aborted; attempt++) {
    if (ctx.skipRetries) break

    // Reset failed sensors in both tracker AND summaryStatus
    const snap = tracker.snapshot()
    const summaryFailures = snap.sensors
      .filter(s => s.summary === 'failed')
      .map(s => s.name)

    if (summaryFailures.length === 0) break

    tracker.setRetryProgress(attempt, MAX_AUTO_RETRIES)
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
    ctx.summary = await summarizeReport(sourceReport, {
      ...baseSummarizeOpts,
      skipCache: false,
      skipOverall: hasFetchFailures,
    })

    if (signal.aborted) break

    // Check if all failures are resolved
    const afterSnap = tracker.snapshot()
    const remaining = afterSnap.sensors
      .filter(s => s.summary === 'failed')
      .map(s => s.name)

    if (remaining.length === 0) break
  }

  tracker.clearRetryProgress()
  ctx.skipRetries = false

  if (signal.aborted) return 'cancelled'

  // Check final state of summary failures
  const finalSnap = tracker.snapshot()
  const finalFailures = finalSnap.sensors
    .filter(s => s.summary === 'failed')
    .map(s => s.name)

  // If summary failures remain after retries, pause for user action.
  // Register them in ctx.failures so the pause loop blocks correctly.
  if (finalFailures.length > 0) {
    for (const name of finalFailures) {
      ctx.failures.add(name)
      ctx.failureKinds.set(name, 'summary')
    }
    return 'paused'
  }
  // If fetch failures exist, also pause (defer overall)
  if (hasFetchFailures) return 'paused'
  return 'briefing'
}
