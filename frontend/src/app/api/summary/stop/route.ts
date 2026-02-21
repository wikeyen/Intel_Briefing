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
  const stopped = stoppedStandalone || stoppedPipeline

  // Whether actively cancelled or stale, ensure DB reflects running=false.
  // cancel functions fire async writes via notify() but don't await them,
  // so the next status poll could see stale running=true + alive=false.
  const progress = await readSummaryProgress()
  if (progress?.running) {
    progress.running = false
    progress.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    for (const sp of progress.sensors) {
      if (sp.state === 'pending' || sp.state === 'running') {
        sp.state = 'failed'
        sp.error = 'Cancelled'
      }
    }
    await writeSummaryProgress(progress).catch(() => {})
    return NextResponse.json({ status: 'stopped' })
  }

  if (stopped) {
    return NextResponse.json({ status: 'stopped' })
  }

  return NextResponse.json({ error: 'No summary running' }, { status: 404 })
}
