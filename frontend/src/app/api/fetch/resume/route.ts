// ABOUTME: Pipeline resume endpoint — POST /api/fetch/resume.
// ABOUTME: Accepts user decision (retry/proceed) when the pipeline pauses on sensor failures.
import { NextRequest, NextResponse } from 'next/server'
import { resumePipeline, isPipelinePaused } from '@/lib/pipeline/orchestrator'
import type { ResumeDecision } from '@/lib/models'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: Partial<ResumeDecision> = await request.json().catch(() => ({}))

  if (!body.action || !['retry', 'proceed'].includes(body.action)) {
    return NextResponse.json(
      { error: 'Invalid action — must be "retry" or "proceed"' },
      { status: 400 },
    )
  }

  if (!isPipelinePaused()) {
    return NextResponse.json(
      { error: 'Pipeline is not paused' },
      { status: 409 },
    )
  }

  const sensors = Array.isArray(body.sensors) ? body.sensors : undefined
  const resumed = resumePipeline({ action: body.action, sensors })

  if (!resumed) {
    return NextResponse.json(
      { error: 'Failed to resume pipeline' },
      { status: 500 },
    )
  }

  return NextResponse.json({ status: 'resumed', action: body.action })
}
