// ABOUTME: Standalone summary trigger — POST /api/summary/trigger.
// ABOUTME: Routes through the pipeline orchestrator (mode='summarize') for single source of truth.
import { NextResponse, after } from 'next/server'
import { loadConfig } from '@/lib/config'
import { runPipeline, isPipelineRunning } from '@/lib/pipeline/orchestrator'

/** Cancel the running standalone summary, if any. Returns true if cancelled. */
export function cancelSummary(): boolean {
  // Consolidated: standalone summaries now run through the pipeline,
  // so cancellation is handled by cancelPipeline() in the stop route.
  return false
}

/** Check whether a standalone summary is currently running. */
export function isSummaryRunning(): boolean {
  // Consolidated: standalone summaries now run through the pipeline.
  return false
}

export async function POST(): Promise<NextResponse> {
  const config = await loadConfig()

  if (!config.summary_provider) {
    return NextResponse.json(
      { ok: false, error: 'No LLM provider configured' },
      { status: 400 },
    )
  }

  if (isPipelineRunning()) {
    return NextResponse.json(
      { ok: false, error: 'Pipeline is already running' },
      { status: 409 },
    )
  }

  // Run summarization through the pipeline (mode='summarize') for single source of truth.
  // The pipeline handles progress tracking, event bus, and cache persistence.
  after(async () => {
    try {
      await runPipeline(config, 'summarize')
    } catch (err) {
      console.error('Summarization failed:', err)
    }
  })

  return NextResponse.json({ ok: true, status: 'accepted' }, { status: 202 })
}
