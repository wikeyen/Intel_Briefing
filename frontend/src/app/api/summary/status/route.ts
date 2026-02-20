// ABOUTME: Summary progress route — GET /api/summary/status.
// ABOUTME: Returns the live status of the current or most recent summarization run from SQLite.
import { NextResponse } from 'next/server'
import { readSummaryProgress } from '@/lib/summary/cache'
import { isSummaryRunning } from '../trigger/route'
import { isPipelineRunning } from '@/lib/pipeline/orchestrator'
import type { SummaryProgress } from '@/lib/models'

const STALE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes

export async function GET(): Promise<NextResponse<SummaryProgress & { alive: boolean }>> {
  const progress = await readSummaryProgress()
  if (!progress) {
    return NextResponse.json({
      running: false,
      started_at: null,
      completed_at: null,
      sensors: [],
      alive: false,
    })
  }

  // alive = there's actually an in-memory controller driving this run
  const alive = isSummaryRunning() || isPipelineRunning()

  // Detect stale runs — if still "running" but started > 10 min ago, report as failed
  // to the client. Read-side only: doesn't write to DB so it can't race with after().
  if (progress.running && progress.started_at) {
    const elapsed = Date.now() - new Date(progress.started_at).getTime()
    if (elapsed > STALE_THRESHOLD_MS) {
      const staleView = structuredClone(progress)
      staleView.running = false
      staleView.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      for (const s of staleView.sensors) {
        if (s.state === 'pending' || s.state === 'running') {
          s.state = 'failed'
          s.error = s.error ?? 'Timed out — background task did not complete'
        }
      }
      return NextResponse.json({ ...staleView, alive: false })
    }
  }

  return NextResponse.json({ ...progress, alive })
}
