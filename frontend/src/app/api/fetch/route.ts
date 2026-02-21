// ABOUTME: Manual pipeline trigger — POST /api/fetch.
// ABOUTME: Accepts optional { mode } body; delegates to the pipeline orchestrator.
import { NextRequest, NextResponse, after } from 'next/server'
import { loadConfig } from '@/lib/config'
import { runPipeline, isPipelineRunning } from '@/lib/pipeline/orchestrator'
import type { RunMode } from '@/lib/models'

const VALID_MODES: RunMode[] = ['fetch', 'summarize', 'fetch_summarize']

export async function POST(request: NextRequest): Promise<NextResponse> {
  let mode: RunMode = 'fetch_summarize'

  const body = await request.json().catch(() => ({}))
  if (body.mode && VALID_MODES.includes(body.mode)) {
    mode = body.mode
  }

  if (isPipelineRunning()) {
    return NextResponse.json(
      { error: 'Pipeline is already running' },
      { status: 409 },
    )
  }

  const config = await loadConfig()

  // Run pipeline in background via after() — survives response delivery
  after(async () => {
    try {
      await runPipeline(config, mode)
    } catch (err) {
      console.error('Pipeline run failed:', err)
    }
  })

  return NextResponse.json({ status: 'accepted', mode }, { status: 202 })
}
