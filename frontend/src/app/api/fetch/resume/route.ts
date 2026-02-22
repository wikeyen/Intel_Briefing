// ABOUTME: Pipeline resume endpoint — POST /api/fetch/resume.
// ABOUTME: Handles skip-retries, retry-sensor, skip-sensor, and generate-overall actions.
import { NextRequest, NextResponse } from 'next/server'
import {
  skipPipelineRetries,
  isPipelineRunning,
  isPipelinePaused,
  retrySensor,
  skipSensor,
  generateOverall,
} from '@/lib/pipeline/orchestrator'

const VALID_ACTIONS = ['proceed', 'retry_sensor', 'skip_sensor', 'generate_overall'] as const
type Action = typeof VALID_ACTIONS[number]

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}))
  const action = body?.action as Action | undefined
  const sensors: string[] | undefined = body?.sensors

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Supported: ${VALID_ACTIONS.join(', ')}` },
      { status: 400 },
    )
  }

  if (!isPipelineRunning()) {
    return NextResponse.json(
      { error: 'Pipeline is not running' },
      { status: 409 },
    )
  }

  // Skip retries — works during auto-retry phase
  if (action === 'proceed') {
    const skipped = skipPipelineRetries()
    if (!skipped) {
      return NextResponse.json({ error: 'Failed to skip retries' }, { status: 500 })
    }
    return NextResponse.json({ status: 'skipped_retries' })
  }

  // Actions below require the pipeline to be in paused state
  if (!isPipelinePaused()) {
    return NextResponse.json(
      { error: 'Pipeline is not paused' },
      { status: 409 },
    )
  }

  if (action === 'retry_sensor') {
    const sensor = sensors?.[0]
    if (!sensor) {
      return NextResponse.json({ error: 'sensors[0] required for retry_sensor' }, { status: 400 })
    }
    const ok = retrySensor(sensor)
    if (!ok) return NextResponse.json({ error: 'Failed to retry sensor' }, { status: 500 })
    return NextResponse.json({ status: 'retrying_sensor', sensor })
  }

  if (action === 'skip_sensor') {
    const sensor = sensors?.[0]
    if (!sensor) {
      return NextResponse.json({ error: 'sensors[0] required for skip_sensor' }, { status: 400 })
    }
    const ok = skipSensor(sensor)
    if (!ok) return NextResponse.json({ error: 'Failed to skip sensor' }, { status: 500 })
    return NextResponse.json({ status: 'skipped_sensor', sensor })
  }

  if (action === 'generate_overall') {
    const ok = generateOverall()
    if (!ok) return NextResponse.json({ error: 'Failed to trigger overall' }, { status: 500 })
    return NextResponse.json({ status: 'generating_overall' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
