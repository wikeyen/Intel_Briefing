// ABOUTME: Cron pipeline trigger — GET /api/cron/pipeline.
// ABOUTME: Protected by CRON_SECRET; used by Vercel Cron Jobs and Docker cron sidecar.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { collect } from '@/lib/pipeline/collector'
import { writePipelineStatus } from '@/lib/pipeline/cache'
import type { PipelineStatus, SensorProgress } from '@/lib/models'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
    }
  }

  const config = await loadConfig()

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
  await writePipelineStatus(status).catch(() => {})

  try {
    const report = await collect(config)
    status.running = false
    status.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    status.total_items = Object.values(report.items)
      .flat()
      .length
    await writePipelineStatus(status).catch(() => {})

    return NextResponse.json({
      status: 'ok',
      sources_ok: report.sources_ok.length,
      sources_failed: report.sources_failed.length,
      total_items: status.total_items,
    })
  } catch (err) {
    status.running = false
    status.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    await writePipelineStatus(status).catch(() => {})

    return NextResponse.json(
      { detail: `Pipeline failed: ${err}` },
      { status: 500 },
    )
  }
}
