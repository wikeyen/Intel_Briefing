// ABOUTME: Manual pipeline trigger — POST /api/fetch.
// ABOUTME: Accepts optional { mode } body; delegates to the pipeline orchestrator.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { runPipeline } from '@/lib/pipeline/orchestrator'
import type { RunMode } from '@/lib/models'

const VALID_MODES: RunMode[] = ['fetch', 'summarize', 'fetch_summarize']

export async function POST(request: NextRequest): Promise<NextResponse> {
  let mode: RunMode = 'fetch_summarize'

  try {
    const body = await request.json().catch(() => ({}))
    if (body.mode && VALID_MODES.includes(body.mode)) {
      mode = body.mode
    }
  } catch {
    // Use default mode
  }

  const config = await loadConfig()

  // Fire and forget — don't await
  runPipeline(config, mode)

  return NextResponse.json({ status: 'accepted', mode }, { status: 202 })
}
