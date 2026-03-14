// ABOUTME: Summarizing state handler — runs per-sensor summaries via the unified engine.
// ABOUTME: Builds SummaryProgress for cross-page awareness and the onProgress bridge callback.

import type { SummarySensorProgress, SummaryProgress } from '../../models'
import { SENSOR_LABELS } from '../../sensors/taxonomy'
import { listGroupsFlat } from '../../groups/queries'
import { createBus } from '../../summary/events'
import { writeSummaryProgress } from '../../summary/cache'
import { summarizeReport } from '../../summary/summarizer'
import type { SummaryProgressCallback } from '../../summary/summarizer'
import { buildAttributionLlmConfig } from '../helpers'
import type { PipelineContext, PipelineState } from '../types'

/**
 * Summarizing state: build summary progress structures, run the summarization engine,
 * and check for per-sensor failures.
 *
 * Populates ctx: summaryStatus, summaryBus, onProgress, baseSummarizeOpts, summary
 *
 * Returns:
 *  - 'complete'       if no sourceReport
 *  - 'intelligence'   if no llmConfig (no LLM configured)
 *  - 'summary_retry'  if there are summary failures
 *  - 'paused'         if there are fetch failures still (defer overall)
 *  - 'briefing'       if all good
 */
export async function handleSummarizing(ctx: PipelineContext): Promise<PipelineState> {
  const { config, signal, tracker, llmConfig, enabledSensors, trackerSensorNames } = ctx

  const shouldFetch = ctx.mode === 'fetch' || ctx.mode === 'fetch_summarize'

  // Use the freshly-fetched report, or the pre-loaded cached report
  const sourceReport = ctx.report ?? ctx.cachedReport
  if (!sourceReport) {
    tracker.complete()
    return 'complete'
  }

  const isLocalModel = config.summary_provider === 'local'
  const defaultConcurrency = config.default_concurrency ?? 4
  const localSummaryConcurrency = config.local_summary_concurrency ?? 1
  const effectiveSummaryConcurrency = isLocalModel ? localSummaryConcurrency : defaultConcurrency

  // Build SummaryProgress for cross-page awareness (Feed page polls intel:summary_status).
  // Exclude sensors that failed in this run AND previously-failed sensors from merged report.
  const reportFailed = new Set(sourceReport.sources_failed)
  const eligibleSensors = trackerSensorNames.filter(n =>
    !ctx.failures.has(n) && !reportFailed.has(n),
  )
  const summaryStatus: SummaryProgress = {
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
  ctx.summaryStatus = summaryStatus
  await writeSummaryProgress(summaryStatus).catch(() => {})

  const summaryBus = createBus()
  ctx.summaryBus = summaryBus

  // If no LLM configured, skip summarization entirely but still run intelligence
  if (!llmConfig) {
    return 'intelligence'
  }

  tracker.addEvent('info', 'summary', 'Summarization started')

  // Bridge between tracker and the unified engine's progress callback
  const onProgress: SummaryProgressCallback = (sensorName, _label, state, error, chunks, verify) => {
    summaryBus.emitState(sensorName, state, _label, error)
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
        if (state === 'cached') tracker.setSummaryCached(sensorName)
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
  ctx.onProgress = onProgress

  // Build sensor → group credibility map for source credibility tagging
  const FACTUAL_GROUP_NAMES = new Set(['News', 'Research & Reports'])
  let sensorCredibilityMap: Record<string, { groupName: string; credibility: 'FACTUAL' | 'CONTEXTUAL' }> = {}
  try {
    const groups = await listGroupsFlat()
    for (const group of groups) {
      const credibility = FACTUAL_GROUP_NAMES.has(group.name) ? 'FACTUAL' as const : 'CONTEXTUAL' as const
      for (const sensor of group.sensors) {
        sensorCredibilityMap[sensor] = { groupName: group.name, credibility }
      }
    }
  } catch {
    // Graceful degradation — all sensors treated as CONTEXTUAL if groups query fails
  }

  // Build shared summarize options for reuse in pause loop and retry
  const baseSummarizeOpts = {
    llmConfig,
    concurrency: effectiveSummaryConcurrency,
    promptOverrides: config.summary_sensor_prompts,
    overallPromptOverride: config.summary_overall_prompt,
    signal,
    onProgress,
    enabledSensors,
    language: config.summary_language,
    onToken: (sensorName: string, token: string) => summaryBus.emitToken(sensorName, token),
    attributionLlmConfig: buildAttributionLlmConfig(config) ?? undefined,
    sensorGroupMap: sensorCredibilityMap,
  }
  ctx.baseSummarizeOpts = baseSummarizeOpts

  // Determine whether to skip overall: if there are fetch failures, defer it
  const hasFetchFailures = ctx.failures.size > 0

  // Delegate to the unified summarization engine.
  // Full fetch_summarize: skipCache=true since we just invalidated all caches.
  // Incremental: skipCache=false — unchanged sensors hit cache (content-hash match).
  // Summarize-only: skipCache=false to reuse cached per-sensor summaries.
  const skipCacheForSummary = shouldFetch && !ctx.isIncrementalRun

  // fetch_intelligence mode: skip overall briefing (and intelligence stage)
  const skipBriefingAndIntel = ctx.mode === 'fetch_intelligence'

  ctx.summary = await summarizeReport(sourceReport, {
    ...baseSummarizeOpts,
    skipCache: skipCacheForSummary,
    skipOverall: hasFetchFailures || skipBriefingAndIntel,
  })

  if (signal.aborted) return 'cancelled'

  // fetch_intelligence: per-sensor summaries done, skip briefing + intelligence
  if (skipBriefingAndIntel) return 'complete'

  // Check for per-sensor summary failures
  const snap = tracker.snapshot()
  const summaryFailures = snap.sensors
    .filter(s => s.summary === 'failed')
    .map(s => s.name)

  if (summaryFailures.length > 0) return 'summary_retry'
  if (hasFetchFailures) return 'paused'
  return 'briefing'
}
