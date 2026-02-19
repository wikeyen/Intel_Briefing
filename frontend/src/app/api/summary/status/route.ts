// ABOUTME: Summary progress route — GET /api/summary/status.
// ABOUTME: Returns the live status of the current or most recent summarization run from SQLite.
import { NextResponse } from 'next/server'
import { readSummaryProgress } from '@/lib/summary/cache'
import type { SummaryProgress } from '@/lib/models'

export async function GET(): Promise<NextResponse<SummaryProgress>> {
  const progress = await readSummaryProgress()
  if (!progress) {
    return NextResponse.json({
      running: false,
      started_at: null,
      completed_at: null,
      sensors: [],
    })
  }
  return NextResponse.json(progress)
}
