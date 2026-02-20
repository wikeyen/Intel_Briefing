// ABOUTME: Pipeline status route — GET /api/fetch/status.
// ABOUTME: Returns the live status of the current or most recent pipeline run from SQLite.
import { NextResponse } from 'next/server'
import { readPipelineStatus } from '@/lib/pipeline/cache'
import { isPipelineRunning } from '@/lib/pipeline/orchestrator'
import type { PipelineStatus } from '@/lib/models'

export async function GET(): Promise<NextResponse<PipelineStatus & { alive: boolean }>> {
  const status = await readPipelineStatus()
  if (!status) {
    return NextResponse.json({
      running: false,
      mode: 'fetch_summarize',
      default_concurrency: 4,
      local_summary_concurrency: 1,
      started_at: null,
      completed_at: null,
      sensors: [],
      overall_summary: 'skipped',
      total_items: 0,
      cancelled: false,
      alive: false,
    })
  }

  // alive = there's an in-memory AbortController driving this pipeline run
  const alive = isPipelineRunning()

  return NextResponse.json({ ...status, alive })
}
