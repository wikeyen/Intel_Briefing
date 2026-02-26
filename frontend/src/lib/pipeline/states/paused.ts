// ABOUTME: Paused state handler — waits for user actions to resolve failed sensors.
// ABOUTME: Handles cancel, generate_overall, skip_sensor, retry_sensor, retry_all actions.

import { sensorResultSucceeded } from '../../models'
import { writeReport } from '../cache'
import { summarizeSingleSensor } from '../../summary/summarizer'
import { fetchSensor, mergeRetryResult, mergeSensorSummary } from '../helpers'
import type { PipelineContext, PipelineState, PauseAction } from '../types'

/**
 * Paused state: wait for user actions to resolve failed sensors.
 * The pause loop processes one action at a time, re-pausing after each action
 * until all failures are resolved or the user triggers generate_overall/cancel.
 *
 * Returns:
 *  - 'cancelled'  if cancel action or signal aborted
 *  - 'briefing'   otherwise (generate_overall or all resolved)
 */
export async function handlePaused(ctx: PipelineContext): Promise<PipelineState> {
  const { config, signal, tracker } = ctx

  const sourceReport = ctx.report ?? ctx.cachedReport

  tracker.addEvent('warn', 'system', `Paused — ${ctx.failures.size} sensor(s) need attention, awaiting action`)
  tracker.pause('pre_overall')

  // Pause loop: wait for user to resolve each failed sensor or trigger overall.
  // The pause Promise is raced against an abort listener so cancellation
  // always unblocks the loop.
  let generateNow = false
  while (ctx.failures.size > 0 && !signal.aborted && !generateNow) {
    const action = await new Promise<PauseAction>(resolve => {
      ctx.pauseResolve = resolve
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
      ctx.failures.delete(action.sensor)
      ctx.failureKinds.delete(action.sensor)
      tracker.skipSummaryForSensor(action.sensor)
    }

    if (action.type === 'retry_sensor' && sourceReport) {
      const sensorName = action.sensor
      const failureKind = ctx.failureKinds.get(sensorName)

      if (failureKind === 'summary') {
        // Summary-only failure — re-summarize without re-fetching
        tracker.addEvent('info', 'retry', 'Manual summary retry requested', sensorName)
        tracker.resetSummaryState(sensorName)
        tracker.setSummaryState(sensorName, 'running')

        if (ctx.baseSummarizeOpts) {
          const sensorSummary = await summarizeSingleSensor(sourceReport, sensorName, {
            ...ctx.baseSummarizeOpts,
            skipCache: true,
          })

          if (signal.aborted) break

          if (sensorSummary) {
            tracker.setSummaryState(sensorName, 'ok')
            tracker.addEvent('ok', 'retry', 'Summary retry succeeded', sensorName)
            ctx.failures.delete(sensorName)
            ctx.failureKinds.delete(sensorName)
            if (ctx.summary) {
              mergeSensorSummary(ctx.summary, sensorSummary)
            }
          } else {
            tracker.setSummaryState(sensorName, 'failed')
            tracker.addEvent('error', 'retry', 'Summary retry failed', sensorName)
            // Stays in failures — user can retry again or skip
          }
        }
      } else {
        // Fetch failure — re-fetch + re-summarize
        tracker.addEvent('info', 'retry', `Manual retry requested`, sensorName)
        tracker.resetFetchState(sensorName)
        tracker.resetSummaryState(sensorName)
        tracker.setFetchState(sensorName, 'running')

        const result = await fetchSensor(sensorName, config, (detail, itemCount) => {
          tracker.setFetchDetail(sensorName, detail, itemCount)
        })

        if (signal.aborted) break

        if (sensorResultSucceeded(result)) {
          tracker.setFetchState(sensorName, 'ok', result.items.length)
          tracker.addEvent('ok', 'retry', `Retry succeeded — ${result.items.length} items`, sensorName)
          ctx.failures.delete(sensorName)
          ctx.failureKinds.delete(sensorName)

          // Merge retry result into report: remove old items by source, add new
          mergeRetryResult(sourceReport, result)
          await writeReport(sourceReport).catch(() => {})

          // Update sources_ok / sources_failed
          if (!sourceReport.sources_ok.includes(sensorName)) {
            sourceReport.sources_ok.push(sensorName)
          }
          sourceReport.sources_failed = sourceReport.sources_failed.filter(n => n !== sensorName)

          // Summarize just this sensor
          if (ctx.baseSummarizeOpts) {
            const sensorSummary = await summarizeSingleSensor(sourceReport, sensorName, {
              ...ctx.baseSummarizeOpts!,
              skipCache: true,
            })

            if (sensorSummary && ctx.summary) {
              mergeSensorSummary(ctx.summary, sensorSummary)
            }
          }
        } else {
          tracker.setFetchState(sensorName, 'failed', 0, result.error, result.error_kind ?? 'api')
          tracker.addEvent('error', 'retry', result.error ?? 'Retry failed', sensorName)
          // Stays in failures — user can retry again or skip
        }
      }
    }

    if (action.type === 'retry_all' && sourceReport) {
      const snap = tracker.snapshot()

      // Separate fetch failures from summary-only failures
      const fetchRetryNames = [...ctx.failures].filter(name => {
        const kind = ctx.failureKinds.get(name)
        if (kind === 'summary') return false  // handle separately
        const sp = snap.sensors.find(s => s.name === name)
        return sp?.fetch_error_kind !== 'config'
      })
      const summaryRetryNames = [...ctx.failures].filter(name => ctx.failureKinds.get(name) === 'summary')

      tracker.addEvent('info', 'retry', `Retrying ${fetchRetryNames.length} fetch + ${summaryRetryNames.length} summary failure(s)`)

      // Re-fetch failures
      for (const sensorName of fetchRetryNames) {
        if (signal.aborted) break
        tracker.resetFetchState(sensorName)
        tracker.resetSummaryState(sensorName)
        tracker.setFetchState(sensorName, 'running')

        const result = await fetchSensor(sensorName, config, (detail, itemCount) => {
          tracker.setFetchDetail(sensorName, detail, itemCount)
        })

        if (signal.aborted) break

        if (sensorResultSucceeded(result)) {
          tracker.setFetchState(sensorName, 'ok', result.items.length)
          tracker.addEvent('ok', 'retry', `Retry succeeded — ${result.items.length} items`, sensorName)
          ctx.failures.delete(sensorName)
          ctx.failureKinds.delete(sensorName)
          mergeRetryResult(sourceReport, result)
          await writeReport(sourceReport).catch(() => {})
          if (!sourceReport.sources_ok.includes(sensorName)) {
            sourceReport.sources_ok.push(sensorName)
          }
          sourceReport.sources_failed = sourceReport.sources_failed.filter(n => n !== sensorName)
          if (ctx.baseSummarizeOpts) {
            const sensorSummary = await summarizeSingleSensor(sourceReport, sensorName, {
              ...ctx.baseSummarizeOpts!,
              skipCache: true,
            })
            if (sensorSummary && ctx.summary) {
              mergeSensorSummary(ctx.summary, sensorSummary)
            }
          }
        } else {
          tracker.setFetchState(sensorName, 'failed', 0, result.error, result.error_kind ?? 'api')
          tracker.addEvent('error', 'retry', result.error ?? 'Retry failed', sensorName)
        }
      }

      // Re-summarize summary-only failures
      for (const sensorName of summaryRetryNames) {
        if (signal.aborted) break
        tracker.resetSummaryState(sensorName)
        tracker.setSummaryState(sensorName, 'running')

        if (ctx.baseSummarizeOpts) {
          const sensorSummary = await summarizeSingleSensor(sourceReport, sensorName, {
            ...ctx.baseSummarizeOpts,
            skipCache: true,
          })

          if (signal.aborted) break

          if (sensorSummary) {
            tracker.setSummaryState(sensorName, 'ok')
            tracker.addEvent('ok', 'retry', 'Summary retry succeeded', sensorName)
            ctx.failures.delete(sensorName)
            ctx.failureKinds.delete(sensorName)
            if (ctx.summary) {
              mergeSensorSummary(ctx.summary, sensorSummary)
            }
          } else {
            tracker.setSummaryState(sensorName, 'failed')
            tracker.addEvent('error', 'retry', 'Summary retry failed', sensorName)
          }
        }
      }
    }
  }

  ctx.pauseResolve = null

  // Finalize summary state for any sensors still failed after pause loop.
  // When a sensor was retried and failed again, resetSummaryState set it back
  // to 'queued' but nothing re-skipped it — do so now before overall briefing.
  // Only skip summary for fetch failures — summary failures already have their
  // summary state set (they were fetched successfully, just failed to summarize).
  for (const name of ctx.failures) {
    const kind = ctx.failureKinds.get(name)
    if (kind !== 'summary') {
      tracker.skipSummaryForSensor(name)
    }
  }

  tracker.unpause()

  if (signal.aborted) return 'cancelled'
  return 'briefing'
}
