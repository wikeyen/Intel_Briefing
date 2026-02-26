// ABOUTME: Pipeline resume endpoint — POST /api/fetch/resume.
// ABOUTME: Handles skip-retries, retry-sensor, retry-all, skip-sensor, skip-fetching-sensor, and generate-overall actions.
import { NextRequest, NextResponse } from 'next/server'
import {
  skipPipelineRetries,
  isPipelineRunning,
  isPipelinePaused,
  retrySensor,
  retryAllFailed,
  skipSensor,
  skipFetchingSensor,
  generateOverall,
} from '@/lib/pipeline/orchestrator'

const VALID_ACTIONS = ['proceed', 'retry_sensor', 'retry_all', 'skip_sensor', 'skip_fetching_sensor', 'generate_overall'] as const
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

  // Skip a sensor mid-fetch — works during active fetch (no pause required)
  if (action === 'skip_fetching_sensor') {
    const sensor = sensors?.[0]
    if (!sensor) {
      return NextResponse.json({ error: 'sensors[0] required for skip_fetching_sensor' }, { status: 400 })
    }
    const ok = skipFetchingSensor(sensor)
    if (!ok) return NextResponse.json({ error: 'Sensor is not currently fetching' }, { status: 409 })
    return NextResponse.json({ status: 'skipped_fetching_sensor', sensor })
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

  if (action === 'retry_all') {
    const ok = retryAllFailed()
    if (!ok) return NextResponse.json({ error: 'Failed to retry all' }, { status: 500 })
    return NextResponse.json({ status: 'retrying_all_failed' })
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
