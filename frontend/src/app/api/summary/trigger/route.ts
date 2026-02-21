// ABOUTME: Standalone summary trigger — POST /api/summary/trigger.
// ABOUTME: Uses the unified summarization engine with per-sensor caching and concurrency from config.
import { NextResponse, after } from 'next/server'
import { loadConfig } from '@/lib/config'
import { readReport } from '@/lib/pipeline/cache'
import { summarizeReport, type SummaryProgressCallback } from '@/lib/summary/summarizer'
import { writeSummary, writeSummaryProgress } from '@/lib/summary/cache'
import type { SummaryProgress, SummarySensorProgress } from '@/lib/models'
import { createBus } from '@/lib/summary/events'

// Store controller on globalThis so it survives Next.js HMR module re-evaluation.
// Without this, dev-mode module recycling resets the singleton to null mid-run,
// causing the status endpoint to report alive=false and triggering a stale banner.
const g = globalThis as unknown as { __summaryAbortController?: AbortController | null }

/** Cancel the running standalone summary, if any. Returns true if cancelled. */
export function cancelSummary(): boolean {
  if (!g.__summaryAbortController) return false
  g.__summaryAbortController.abort()
  g.__summaryAbortController = null
  return true
}

/** Check whether a standalone summary is currently running. */
export function isSummaryRunning(): boolean {
  return g.__summaryAbortController != null
}

export async function POST(): Promise<NextResponse> {
  const config = await loadConfig()

  if (!config.summary_provider) {
    return NextResponse.json(
      { ok: false, error: 'No LLM provider configured' },
      { status: 400 },
    )
  }

  const report = await readReport()
  if (!report) {
    return NextResponse.json(
      { ok: false, error: 'No report data available — run the pipeline first' },
      { status: 400 },
    )
  }

  // Build enabled sensor set from config — the engine handles filtering
  const enabledSensors = new Set(
    Object.entries(config.sensors_enabled)
      .filter(([, enabled]) => enabled !== false)
      .map(([name]) => name),
  )

  // Build initial progress list: sensors with data that are enabled and not failed
  const failedSet = new Set(report.sources_failed)
  const eligibleSensors: string[] = []
  const seen = new Set<string>()
  for (const section of Object.values(report.items)) {
    for (const item of section) {
      if (!seen.has(item.source) && enabledSensors.has(item.source) && !failedSet.has(item.source)) {
        eligibleSensors.push(item.source)
        seen.add(item.source)
      }
    }
  }

  const summaryStatus: SummaryProgress = {
    running: true,
    started_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    completed_at: null,
    sensors: [...eligibleSensors, '__overall__'].map((name): SummarySensorProgress => ({
      sensor_name: name,
      label: name === '__overall__' ? 'Overall' : name,
      state: 'pending',
      error: null,
    })),
  }
  await writeSummaryProgress(summaryStatus).catch(() => {})

  // Create abort controller for this run
  const abortController = new AbortController()
  g.__summaryAbortController = abortController

  // Derive concurrency from config (same logic as pipeline orchestrator)
  const isLocalModel = config.summary_provider === 'local'
  const effectiveConcurrency = isLocalModel
    ? (config.local_summary_concurrency ?? 1)
    : (config.default_concurrency ?? 4)

  // Run summarization in the background via after() — survives response delivery
  after(async () => {
    const bus = createBus()

    // Bridge the unified engine's progress callback to the SummaryProgress persistence
    const onProgress: SummaryProgressCallback = async (
      sensorName, label, state, error,
    ) => {
      bus.emitState(sensorName, state, label, error)
      // Map 'cached' to 'ok' for the progress UI
      const displayState = state === 'cached' ? 'ok' as const : state
      for (const sp of summaryStatus.sensors) {
        if (sp.sensor_name === sensorName) {
          sp.state = displayState
          sp.label = label
          sp.error = error
          break
        }
      }
      await writeSummaryProgress(summaryStatus).catch(() => {})
    }

    try {
      const summary = await summarizeReport(report, {
        llmConfig: {
          base_url: config.summary_base_url,
          api_key: config.summary_api_key,
          model: config.summary_model,
        },
        concurrency: effectiveConcurrency,
        promptOverrides: config.summary_sensor_prompts,
        overallPromptOverride: config.summary_overall_prompt,
        signal: abortController.signal,
        onProgress,
        skipCache: false, // Standalone regenerate uses cache — skip unchanged sensors
        enabledSensors,
        language: config.summary_language,
        onToken: (sensorName, token) => bus.emitToken(sensorName, token),
      })
      await writeSummary(summary)
    } catch (err) {
      console.error('Manual summarization failed:', err)
      const isCancelled = abortController.signal.aborted
      // Mark all still-pending sensors as failed/cancelled so the UI shows the state
      for (const sp of summaryStatus.sensors) {
        if (sp.state === 'pending' || sp.state === 'running') {
          sp.state = 'failed'
          sp.error = isCancelled ? 'Cancelled' : (err as Error).message
        }
      }
    } finally {
      summaryStatus.running = false
      summaryStatus.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      await writeSummaryProgress(summaryStatus).catch(() => {})
      bus.emitDone()
      // Clear singleton
      if (g.__summaryAbortController === abortController) {
        g.__summaryAbortController = null
      }
    }
  })

  return NextResponse.json({ ok: true, status: 'accepted' }, { status: 202 })
}
