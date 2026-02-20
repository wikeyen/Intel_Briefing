// ABOUTME: Pipeline stop endpoint — POST /api/fetch/stop.
// ABOUTME: Aborts the running pipeline and returns 200, or 404 if nothing is running.
import { NextResponse } from 'next/server'
import { cancelPipeline } from '@/lib/pipeline/orchestrator'

export async function POST(): Promise<NextResponse> {
  const stopped = cancelPipeline()
  if (stopped) {
    return NextResponse.json({ status: 'stopped' })
  }
  return NextResponse.json({ error: 'No pipeline running' }, { status: 404 })
}
