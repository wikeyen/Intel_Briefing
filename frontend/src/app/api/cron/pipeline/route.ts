// ABOUTME: Cron pipeline trigger — GET /api/cron/pipeline.
// ABOUTME: Protected by CRON_SECRET; delegates to the pipeline orchestrator.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { runPipeline } from '@/lib/pipeline/orchestrator'

/** Constant-time string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const encoder = new TextEncoder()
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)
  let diff = 0
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i]
  }
  return diff === 0
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    const expected = `Bearer ${cronSecret}`
    if (!authHeader || !timingSafeEqual(authHeader, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Cron pipeline failed:', message)
    return NextResponse.json(
      { error: 'Pipeline failed' },
      { status: 500 },
    )
  }
}
