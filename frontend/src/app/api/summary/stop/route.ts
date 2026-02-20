// ABOUTME: Summary stop endpoint — POST /api/summary/stop.
// ABOUTME: Cancels any running summarization (standalone or pipeline) and cleans up stale progress.
import { NextResponse } from 'next/server'
import { cancelSummary } from '../trigger/route'
import { cancelPipeline } from '@/lib/pipeline/orchestrator'
import { readSummaryProgress, writeSummaryProgress } from '@/lib/summary/cache'

export async function POST(): Promise<NextResponse> {
  // Try cancelling standalone summary first, then pipeline
  const stoppedStandalone = cancelSummary()
  const stoppedPipeline = !stoppedStandalone && cancelPipeline()

  if (stoppedStandalone || stoppedPipeline) {
    return NextResponse.json({ status: 'stopped' })
  }

  // No active controller — but progress may be stale (e.g. after app restart).
  // If SummaryProgress still shows running, mark it as stopped so the UI clears.
  const progress = await readSummaryProgress()
  if (progress?.running) {
    progress.running = false
    progress.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    for (const sp of progress.sensors) {
      if (sp.state === 'pending' || sp.state === 'running') {
        sp.state = 'failed'
        sp.error = 'Cancelled (stale)'
      }
    }
    await writeSummaryProgress(progress).catch(() => {})
    return NextResponse.json({ status: 'stopped' })
  }

  return NextResponse.json({ error: 'No summary running' }, { status: 404 })
}
