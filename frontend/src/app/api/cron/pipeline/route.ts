// ABOUTME: Cron pipeline trigger — GET /api/cron/pipeline.
// ABOUTME: Protected by CRON_SECRET; delegates to the pipeline orchestrator.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { runPipeline } from '@/lib/pipeline/orchestrator'

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

  try {
    const mode = config.summary_provider ? 'fetch_summarize' : 'fetch'
    const result = await runPipeline(config, mode as 'fetch' | 'fetch_summarize')

    return NextResponse.json({
      status: 'ok',
      mode,
      sources_ok: result.report?.sources_ok.length ?? 0,
      sources_failed: result.report?.sources_failed.length ?? 0,
      total_items: Object.values(result.report?.items ?? {}).flat().length,
      summarized: !!result.summary,
    })
  } catch (err) {
    return NextResponse.json(
      { detail: `Pipeline failed: ${err}` },
      { status: 500 },
    )
  }
}
