// ABOUTME: Manual fetch trigger — POST /api/fetch.
// ABOUTME: Triggers an immediate pipeline collection run in the background; returns 202 Accepted.
import { NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { collect } from '@/lib/pipeline/collector'
import { writePipelineStatus, readReport } from '@/lib/pipeline/cache'
import { summarizeReport } from '@/lib/summary/summarizer'
import { writeSummary } from '@/lib/summary/cache'
import type { PipelineStatus, SensorProgress } from '@/lib/models'

export async function POST(): Promise<NextResponse> {
  const config = await loadConfig()

  // Initialise progress — list every enabled sensor as pending
  const enabledSensors = Object.keys(config.sensors_enabled).filter(
    (k) => config.sensors_enabled[k],
  )
  const status: PipelineStatus = {
    running: true,
    started_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    completed_at: null,
    sensors: enabledSensors.map((name): SensorProgress => ({
      name,
      state: 'pending',
      item_count: 0,
      error: null,
    })),
    total_items: 0,
  }

  await writePipelineStatus(status)

  // Run pipeline in the background (fire-and-forget)
  const runPipeline = async () => {
    const onProgress = async (
      sensorName: string,
      state: string,
      itemCount: number,
      error: string | null,
      errorKind: 'config' | 'api' | null,
    ) => {
      for (const sp of status.sensors) {
        if (sp.name === sensorName) {
          sp.state = state as SensorProgress['state']
          sp.item_count = itemCount
          sp.error = error
          sp.error_kind = errorKind
          break
        }
      }
      status.total_items = status.sensors
        .filter((sp) => sp.state === 'ok')
        .reduce((sum, sp) => sum + sp.item_count, 0)
      await writePipelineStatus(status).catch(() => {})
    }

    try {
      await collect(config, onProgress)

      // Auto-summarize if LLM provider is configured
      if (config.summary_provider) {
        const report = await readReport()
        if (report) {
          try {
            const summary = await summarizeReport(report, {
              base_url: config.summary_base_url,
              api_key: config.summary_api_key,
              model: config.summary_model,
            })
            await writeSummary(summary)
          } catch (err) {
            console.error('Auto-summarization failed:', err)
          }
        }
      }
    } catch (err) {
      console.error('Manual fetch failed:', err)
    } finally {
      status.running = false
      status.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      // Mark any stuck sensors as failed
      for (const sp of status.sensors) {
        if (sp.state === 'pending' || sp.state === 'running') {
          sp.state = 'failed'
          sp.error = 'interrupted'
        }
      }
      await writePipelineStatus(status).catch(() => {})
    }
  }

  // Fire and forget — don't await
  runPipeline()

  return NextResponse.json({ status: 'accepted' }, { status: 202 })
}
