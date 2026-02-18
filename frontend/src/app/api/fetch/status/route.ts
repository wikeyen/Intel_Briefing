// ABOUTME: Pipeline status route — GET /api/fetch/status.
// ABOUTME: Returns the live status of the current or most recent pipeline run from SQLite.
import { NextResponse } from 'next/server'
import { readPipelineStatus } from '@/lib/pipeline/cache'
import type { PipelineStatus } from '@/lib/models'

export async function GET(): Promise<NextResponse<PipelineStatus>> {
  const status = await readPipelineStatus()
  if (!status) {
    return NextResponse.json({
      running: false,
      started_at: null,
      completed_at: null,
      sensors: [],
      total_items: 0,
    })
  }
  return NextResponse.json(status)
}
