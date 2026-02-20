// ABOUTME: Summary progress route — GET /api/summary/status.
// ABOUTME: Returns the live status of the current or most recent summarization run from SQLite.
import { NextResponse } from 'next/server'
import { readSummaryProgress, writeSummaryProgress } from '@/lib/summary/cache'
import type { SummaryProgress } from '@/lib/models'

const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

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

  // Detect stale runs — if still "running" but started > 5 min ago, mark as failed
  if (progress.running && progress.started_at) {
    const elapsed = Date.now() - new Date(progress.started_at).getTime()
    if (elapsed > STALE_THRESHOLD_MS) {
      progress.running = false
      progress.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      for (const s of progress.sensors) {
        if (s.state === 'pending' || s.state === 'running') {
          s.state = 'failed'
          s.error = s.error ?? 'Timed out — background task did not complete'
        }
      }
      await writeSummaryProgress(progress).catch(() => {})
    }
  }

  return NextResponse.json(progress)
}
