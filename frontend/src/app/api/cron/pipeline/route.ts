// ABOUTME: Cron pipeline trigger — GET /api/cron/pipeline.
// ABOUTME: Protected by CRON_SECRET; delegates to the pipeline orchestrator.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { verifyCronSecret } from '@/lib/cron-auth'
import { runPipeline, isPipelineRunning } from '@/lib/pipeline/orchestrator'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  const authError = verifyCronSecret(request)
  if (authError) return authError

  // Reject if a pipeline is already running (manual or previous cron overlap)
  if (isPipelineRunning()) {
    return NextResponse.json(
      { error: 'Pipeline is already running' },
      { status: 409 },
    )
  }

  const config = await loadConfig()

  try {
    const modeParam = request.nextUrl.searchParams.get('mode')
    const mode = modeParam === 'fetch' ? 'fetch'
      : modeParam === 'fetch_summary' ? 'fetch_summary'
      : modeParam === 'summarize' ? 'summarize'
      : config.summary_provider ? 'fetch_summarize' : 'fetch'
    const result = await runPipeline(config, mode)

    return NextResponse.json({
      status: 'ok',
      mode,
      sources_ok: result.report?.sources_ok.length ?? 0,
      sources_failed: result.report?.sources_failed.length ?? 0,
      total_items: Object.values(result.report?.items ?? {}).flat().length,
      summarized: !!result.summary,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Cron pipeline failed:', message)
    return NextResponse.json(
      { error: 'Pipeline failed' },
      { status: 500 },
    )
  }
}
