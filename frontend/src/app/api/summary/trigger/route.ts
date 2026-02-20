// ABOUTME: Standalone summary trigger — POST /api/summary/trigger.
// ABOUTME: Runs LLM summarization on the existing cached report without a full pipeline run.
import { NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { readReport } from '@/lib/pipeline/cache'
import { summarizeReport } from '@/lib/summary/summarizer'
import { writeSummary, writeSummaryProgress } from '@/lib/summary/cache'
import type { SummaryProgress, SummarySensorProgress } from '@/lib/models'

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

  // Build initial summary progress from report sensors
  const sensorGroups = new Map<string, string>()
  for (const section of Object.values(report.items)) {
    for (const item of section) {
      if (!sensorGroups.has(item.source)) sensorGroups.set(item.source, item.source)
    }
  }

  const summaryStatus: SummaryProgress = {
    running: true,
    started_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    completed_at: null,
    sensors: [...sensorGroups.keys(), '__overall__'].map((name): SummarySensorProgress => ({
      sensor_name: name,
      label: name === '__overall__' ? 'Overall' : name,
      state: 'pending',
      error: null,
    })),
  }
  await writeSummaryProgress(summaryStatus).catch(() => {})

  // Run summarization in the background (fire-and-forget)
  const run = async () => {
    const onProgress = async (
      sensorName: string,
      label: string,
      state: 'pending' | 'running' | 'ok' | 'failed',
      error: string | null,
    ) => {
      for (const sp of summaryStatus.sensors) {
        if (sp.sensor_name === sensorName) {
          sp.state = state
          sp.label = label
          sp.error = error
          break
        }
      }
      await writeSummaryProgress(summaryStatus).catch(() => {})
    }

    try {
      const summary = await summarizeReport(report, {
        base_url: config.summary_base_url,
        api_key: config.summary_api_key,
        model: config.summary_model,
      }, onProgress)
      await writeSummary(summary)
    } catch (err) {
      console.error('Manual summarization failed:', err)
    } finally {
      summaryStatus.running = false
      summaryStatus.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      await writeSummaryProgress(summaryStatus).catch(() => {})
    }
  }

  // Fire and forget
  run()

  return NextResponse.json({ ok: true, status: 'accepted' }, { status: 202 })
}
