// ABOUTME: Tests for derivePhaseTooltipData() — per-phase tooltip aggregation from pipeline status.
// ABOUTME: Covers all phases (fetch, summary, briefing, intelligence) in terminal and non-terminal states.
import { describe, it, expect } from 'vitest'
import type { PipelinePhaseStep, StepStatus } from '../PhaseStepper'
import { derivePhaseTooltipData, deriveStepStatuses } from '../PhaseStepper'
import { makePipelineStatus, makeSensorJob } from '../test-helpers'

/** Passthrough translator — returns the key as-is. */
const t = (key: string) => key

function makeStatuses(
  overrides: Partial<Record<PipelinePhaseStep, StepStatus>> = {},
): Record<PipelinePhaseStep, StepStatus> {
  return {
    fetch: 'pending',
    retry: 'pending',
    summary: 'pending',
    briefing: 'pending',
    intelligence: 'pending',
    ...overrides,
  }
}

describe('deriveStepStatuses', () => {
  it('summary stays active when a sensor is still running even if briefing finished', () => {
    const ps = makePipelineStatus({
      running: true,
      mode: 'summarize',
      completed_at: null,
      overall_summary: 'ok',
      sensors: [
        makeSensorJob('s1', { fetch: 'skipped', summary: 'ok' }),
        makeSensorJob('s2', { fetch: 'skipped', summary: 'ok' }),
        makeSensorJob('douyin', { fetch: 'skipped', summary: 'running', summary_error: 'fetch failed' }),
      ],
    })
    const statuses = deriveStepStatuses(ps)
    expect(statuses.summary).toBe('active')
  })

  it('summary shows warn after all sensors finish with some errors', () => {
    const ps = makePipelineStatus({
      running: false,
      mode: 'summarize',
      overall_summary: 'ok',
      sensors: [
        makeSensorJob('s1', { fetch: 'skipped', summary: 'ok' }),
        makeSensorJob('s2', { fetch: 'skipped', summary: 'ok', summary_error: 'fetch failed' }),
      ],
    })
    const statuses = deriveStepStatuses(ps)
    expect(statuses.summary).toBe('warn')
  })
})

describe('derivePhaseTooltipData', () => {
  it('returns all nulls when pipelineStatus is null', () => {
    const result = derivePhaseTooltipData(null, makeStatuses(), t)
    expect(result.fetch).toBeNull()
    expect(result.retry).toBeNull()
    expect(result.summary).toBeNull()
    expect(result.briefing).toBeNull()
    expect(result.intelligence).toBeNull()
  })

  it('returns all nulls when all phases are pending', () => {
    const ps = makePipelineStatus()
    const result = derivePhaseTooltipData(ps, makeStatuses(), t)
    expect(result.fetch).toBeNull()
    expect(result.retry).toBeNull()
    expect(result.summary).toBeNull()
    expect(result.briefing).toBeNull()
    expect(result.intelligence).toBeNull()
  })

  it('fetch tooltip: counts fetched, cached, failed sensors and total items', () => {
    const ps = makePipelineStatus({
      sensors: [
        makeSensorJob('s1', { fetch: 'ok', fetch_cached: false, item_count: 10 }),
        makeSensorJob('s2', { fetch: 'ok', fetch_cached: true, item_count: 5 }),
        makeSensorJob('s3', { fetch: 'failed', fetch_cached: false, item_count: 0 }),
      ],
    })
    const statuses = makeStatuses({ fetch: 'done' })
    const result = derivePhaseTooltipData(ps, statuses, t)

    expect(result.fetch).not.toBeNull()
    expect(result.fetch!.lines).toEqual([
      '1 stepper.sources_fetched',
      '1 stepper.sources_cached',
      '1 stepper.sources_failed',
      '15 stepper.items_collected',
    ])
  })

  it('fetch tooltip: shows Skipped when fetch is skipped', () => {
    const ps = makePipelineStatus()
    const statuses = makeStatuses({ fetch: 'skipped' })
    const result = derivePhaseTooltipData(ps, statuses, t)

    expect(result.fetch).not.toBeNull()
    expect(result.fetch!.lines).toEqual(['stepper.skipped'])
  })

  it('summary tooltip: counts summarized, failed, and chunks', () => {
    const ps = makePipelineStatus({
      sensors: [
        makeSensorJob('s1', { summary: 'ok', summary_chunks_done: 3 }),
        makeSensorJob('s2', { summary: 'failed', summary_chunks_done: 0 }),
      ],
    })
    const statuses = makeStatuses({ summary: 'done' })
    const result = derivePhaseTooltipData(ps, statuses, t)

    expect(result.summary).not.toBeNull()
    expect(result.summary!.lines).toEqual([
      '1 stepper.sources_summarized',
      '1 stepper.summaries_failed',
      '3 stepper.chunks_processed',
    ])
  })

  it('summary tooltip: counts summary_error sensors as failed even when summary=ok', () => {
    const ps = makePipelineStatus({
      sensors: [
        makeSensorJob('s1', { summary: 'ok', summary_chunks_done: 5 }),
        makeSensorJob('s2', { summary: 'ok', summary_error: 'fetch failed', summary_chunks_done: 0 }),
        makeSensorJob('s3', { summary: 'ok', summary_error: 'fetch failed', summary_chunks_done: 0 }),
      ],
    })
    const statuses = makeStatuses({ summary: 'done' })
    const result = derivePhaseTooltipData(ps, statuses, t)

    expect(result.summary).not.toBeNull()
    expect(result.summary!.lines).toEqual([
      '1 stepper.sources_summarized',
      '2 stepper.summaries_failed',
      '5 stepper.chunks_processed',
    ])
  })

  it('summary tooltip: shows Skipped when summary is skipped', () => {
    const ps = makePipelineStatus()
    const statuses = makeStatuses({ summary: 'skipped' })
    const result = derivePhaseTooltipData(ps, statuses, t)

    expect(result.summary).not.toBeNull()
    expect(result.summary!.lines).toEqual(['stepper.skipped'])
  })

  it('briefing tooltip: shows status and duration', () => {
    const ps = makePipelineStatus({
      started_at: '2026-01-15T10:00:00Z',
      completed_at: '2026-01-15T10:01:30Z',  // 90 seconds later
    })
    const statuses = makeStatuses({ briefing: 'done' })
    const result = derivePhaseTooltipData(ps, statuses, t)

    expect(result.briefing).not.toBeNull()
    expect(result.briefing!.lines).toEqual([
      'stepper.status_ok',
      '1m 30s',
    ])
  })

  it('briefing tooltip: shows Failed status', () => {
    const ps = makePipelineStatus({
      started_at: null,
      completed_at: null,
    })
    const statuses = makeStatuses({ briefing: 'error' })
    const result = derivePhaseTooltipData(ps, statuses, t)

    expect(result.briefing).not.toBeNull()
    expect(result.briefing!.lines).toEqual(['stepper.status_failed'])
  })

  it('intelligence tooltip: shows Completed status', () => {
    const ps = makePipelineStatus({
      started_at: null,
      completed_at: null,
    })
    const statuses = makeStatuses({ intelligence: 'done' })
    const result = derivePhaseTooltipData(ps, statuses, t)

    expect(result.intelligence).not.toBeNull()
    expect(result.intelligence!.lines).toEqual(['stepper.status_ok'])
  })

  it('intelligence tooltip: shows Skipped when skipped', () => {
    const ps = makePipelineStatus()
    const statuses = makeStatuses({ intelligence: 'skipped' })
    const result = derivePhaseTooltipData(ps, statuses, t)

    expect(result.intelligence).not.toBeNull()
    expect(result.intelligence!.lines).toEqual(['stepper.skipped'])
  })

  it('does not show tooltip for active phases', () => {
    const ps = makePipelineStatus({
      sensors: [makeSensorJob('s1', { fetch: 'running' })],
    })
    const statuses = makeStatuses({ fetch: 'active' })
    const result = derivePhaseTooltipData(ps, statuses, t)

    expect(result.fetch).toBeNull()
    expect(result.retry).toBeNull()
    expect(result.summary).toBeNull()
    expect(result.briefing).toBeNull()
    expect(result.intelligence).toBeNull()
  })
})
