// ABOUTME: Pipeline stop endpoint — POST /api/fetch/stop.
// ABOUTME: Aborts the running pipeline and cleans up stale progress after restart.
import { NextResponse } from 'next/server'
import { cancelPipeline } from '@/lib/pipeline/orchestrator'
import { readPipelineStatus, writePipelineStatus } from '@/lib/pipeline/cache'
import { readSummaryProgress, writeSummaryProgress } from '@/lib/summary/cache'

export async function POST(): Promise<NextResponse> {
  const stopped = cancelPipeline()

  // cancelPipeline() now leaves singletons intact so the pipeline's finally block
  // can write the terminal status. For stale status from a crashed server, we still
  // need to clean up the DB directly.
  let cleaned = false
  if (!stopped) {
    // No in-memory pipeline was running. Check for stale DB state from a crash.
    const status = await readPipelineStatus()
    if (status && status.running) {
      status.running = false
      status.cancelled = true
      status.completed_at = status.completed_at ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      await writePipelineStatus(status)
      cleaned = true
    }

    // Also clean up stale summary progress
    const summary = await readSummaryProgress()
    if (summary?.running) {
      summary.running = false
      summary.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
      for (const sp of summary.sensors) {
        if (sp.state === 'pending' || sp.state === 'running') {
          sp.state = 'failed'
          sp.error = 'Cancelled'
        }
      }
      await writeSummaryProgress(summary).catch(() => {})
      cleaned = true
    }
  }

  if (stopped || cleaned) {
    return NextResponse.json({ status: 'stopped' })
  }

  return NextResponse.json({ error: 'No pipeline running' }, { status: 404 })
}
