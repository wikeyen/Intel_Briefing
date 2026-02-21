// ABOUTME: Pipeline stop endpoint — POST /api/fetch/stop.
// ABOUTME: Aborts the running pipeline and cleans up stale progress after restart.
import { NextResponse } from 'next/server'
import { cancelPipeline } from '@/lib/pipeline/orchestrator'
import { readPipelineStatus, writePipelineStatus } from '@/lib/pipeline/cache'

export async function POST(): Promise<NextResponse> {
  const stopped = cancelPipeline()
  if (stopped) {
    return NextResponse.json({ status: 'stopped' })
  }

  // No active controller — but status may be stale (e.g. after app restart).
  // If PipelineStatus still shows running, mark it as cancelled so the UI clears.
  const status = await readPipelineStatus()
  if (status && !status.completed_at && !status.cancelled) {
    status.running = false
    status.cancelled = true
    status.completed_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    await writePipelineStatus(status).catch(() => {})
    return NextResponse.json({ status: 'stopped' })
  }

  return NextResponse.json({ error: 'No pipeline running' }, { status: 404 })
}
