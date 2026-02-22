// ABOUTME: Pipeline skip-retries endpoint — POST /api/fetch/resume.
// ABOUTME: Signals the running pipeline to skip remaining auto-retries and proceed.
import { NextRequest, NextResponse } from 'next/server'
import { skipPipelineRetries, isPipelineRunning } from '@/lib/pipeline/orchestrator'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}))
  const action = body?.action

  if (action !== 'proceed') {
    return NextResponse.json(
      { error: 'Only "proceed" action is supported' },
      { status: 400 },
    )
  }

  if (!isPipelineRunning()) {
    return NextResponse.json(
      { error: 'Pipeline is not running' },
      { status: 409 },
    )
  }

  const skipped = skipPipelineRetries()

  if (!skipped) {
    return NextResponse.json(
      { error: 'Failed to skip retries' },
      { status: 500 },
    )
  }

  return NextResponse.json({ status: 'skipped_retries' })
}
