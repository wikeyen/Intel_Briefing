// ABOUTME: Manual pipeline trigger — POST /api/fetch.
// ABOUTME: Accepts optional { mode } body; delegates to the pipeline orchestrator.
import { NextRequest, NextResponse, after } from 'next/server'
import { loadConfig } from '@/lib/config'
import { runPipeline, isPipelineRunning } from '@/lib/pipeline/orchestrator'
import type { RunMode } from '@/lib/models'

const VALID_MODES: RunMode[] = ['fetch', 'summarize', 'fetch_summarize', 'intelligence', 'fetch_intelligence']

export async function POST(request: NextRequest): Promise<NextResponse> {
  let mode: RunMode = 'fetch_summarize'

  const body = await request.json().catch(() => ({}))
  if (body.mode && VALID_MODES.includes(body.mode)) {
    mode = body.mode
  }

  // Optional sensor filter — only run the listed sensors
  const sensors: string[] | undefined = Array.isArray(body.sensors) ? body.sensors : undefined

  if (isPipelineRunning()) {
    return NextResponse.json(
      { error: 'Pipeline is already running' },
      { status: 409 },
    )
  }

  const config = await loadConfig()

  // Run pipeline in background via after() — survives response delivery.
  // Errors cannot produce an HTTP response (202 is already sent), but must
  // propagate so Next.js error handling and monitoring tools can observe them.
  after(async () => {
    await runPipeline(config, mode, sensors)
  })

  return NextResponse.json({ status: 'accepted', mode }, { status: 202 })
}
