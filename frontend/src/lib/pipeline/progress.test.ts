// ABOUTME: Tests for PipelineProgressTracker — the observer that manages pipeline state.
// ABOUTME: Validates state transitions, event notifications, and snapshot generation.
import { describe, it, expect, vi } from 'vitest'
import { PipelineProgressTracker } from './progress'

describe('PipelineProgressTracker', () => {
  const sensors = ['hacker_news', 'arxiv', 'github']

  it('initializes all sensors with correct initial states for fetch_summarize', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    const snap = tracker.snapshot()
    expect(snap.running).toBe(true)
    expect(snap.mode).toBe('fetch_summarize')
    expect(snap.run_id).toBeTruthy()
    expect(snap.default_concurrency).toBe(4)
    expect(snap.local_summary_concurrency).toBe(4)
    expect(snap.sensors).toHaveLength(3)
    for (const s of snap.sensors) {
      expect(s.fetch).toBe('queued')
      expect(s.fetch_cached).toBe(false)
      expect(s.summary).toBe('queued')
    }
    expect(snap.overall_summary).toBe('queued')
  })

  it('initializes summary stages as skipped for fetch mode', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, 4)
    const snap = tracker.snapshot()
    for (const s of snap.sensors) {
      expect(s.fetch).toBe('queued')
      expect(s.summary).toBe('skipped')
    }
    expect(snap.overall_summary).toBe('skipped')
  })

  it('initializes fetch stages as skipped for summarize mode', () => {
    const tracker = new PipelineProgressTracker(sensors, 'summarize', 4, 4)
    const snap = tracker.snapshot()
    for (const s of snap.sensors) {
      expect(s.fetch).toBe('skipped')
      expect(s.summary).toBe('queued')
    }
    expect(snap.overall_summary).toBe('queued')
  })

  it('updates fetch stage state', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.setFetchState('arxiv', 'running')
    expect(tracker.snapshot().sensors[1].fetch).toBe('running')

    tracker.setFetchState('arxiv', 'ok', 5)
    const snap = tracker.snapshot()
    expect(snap.sensors[1].fetch).toBe('ok')
    expect(snap.sensors[1].item_count).toBe(5)
  })

  it('updates summary stage state', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.setSummaryState('arxiv', 'running')
    expect(tracker.snapshot().sensors[1].summary).toBe('running')

    tracker.setSummaryState('arxiv', 'ok')
    expect(tracker.snapshot().sensors[1].summary).toBe('ok')
  })

  it('tracks fetch errors with kind', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, 4)
    tracker.setFetchState('github', 'failed', 0, 'No token', 'config')
    const s = tracker.snapshot().sensors[2]
    expect(s.fetch).toBe('failed')
    expect(s.fetch_error).toBe('No token')
    expect(s.fetch_error_kind).toBe('config')
  })

  it('calls onChange listener on state change', () => {
    const onChange = vi.fn()
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, 4, onChange)
    tracker.setFetchState('hacker_news', 'running')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(tracker.snapshot())
  })

  it('computes total_items from ok sensors', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, 4)
    tracker.setFetchState('hacker_news', 'ok', 10)
    tracker.setFetchState('arxiv', 'ok', 5)
    tracker.setFetchState('github', 'failed')
    expect(tracker.snapshot().total_items).toBe(15)
  })

  it('complete() sets running=false and completed_at', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, 4)
    tracker.complete()
    const snap = tracker.snapshot()
    expect(snap.running).toBe(false)
    expect(snap.completed_at).toBeTruthy()
  })

  it('skipSummaryForSensor marks a sensor summary as skipped', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.skipSummaryForSensor('arxiv')
    const snap = tracker.snapshot()
    expect(snap.sensors[1].summary).toBe('skipped')
    // Other sensors remain queued
    expect(snap.sensors[0].summary).toBe('queued')
    expect(snap.sensors[2].summary).toBe('queued')
  })

  it('setCachedSensor marks fetch as ok with fetch_cached flag', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.setCachedSensor('arxiv', 15)
    const snap = tracker.snapshot()
    const sensor = snap.sensors.find(s => s.name === 'arxiv')!
    expect(sensor.fetch).toBe('ok')
    expect(sensor.fetch_cached).toBe(true)
    expect(sensor.item_count).toBe(15)
  })

  it('resetFetchState clears fetch_cached flag', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.setCachedSensor('arxiv', 15)
    tracker.resetFetchState('arxiv')
    const snap = tracker.snapshot()
    const sensor = snap.sensors.find(s => s.name === 'arxiv')!
    expect(sensor.fetch).toBe('queued')
    expect(sensor.fetch_cached).toBe(false)
    expect(sensor.item_count).toBe(0)
  })

  it('snapshot includes unique run_id', () => {
    const tracker1 = new PipelineProgressTracker(sensors, 'fetch', 4, 4)
    const tracker2 = new PipelineProgressTracker(sensors, 'fetch', 4, 4)
    expect(tracker1.snapshot().run_id).toBeTruthy()
    expect(tracker2.snapshot().run_id).toBeTruthy()
    expect(tracker1.snapshot().run_id).not.toBe(tracker2.snapshot().run_id)
  })

  it('snapshot reflects separate concurrency values', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 3, 6)
    const snap = tracker.snapshot()
    expect(snap.default_concurrency).toBe(3)
    expect(snap.local_summary_concurrency).toBe(6)
  })

  it('cancel() transitions queued and running stages to cancelled', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    // Set some sensors to various states before cancelling
    tracker.setFetchState('hacker_news', 'ok', 10)
    tracker.setFetchState('arxiv', 'running')
    // github remains 'queued'

    tracker.cancel()
    const snap = tracker.snapshot()

    expect(snap.running).toBe(false)
    expect(snap.cancelled).toBe(true)
    expect(snap.completed_at).toBeTruthy()

    // 'ok' is preserved
    expect(snap.sensors[0].fetch).toBe('ok')
    expect(snap.sensors[0].item_count).toBe(10)
    // 'running' becomes 'cancelled'
    expect(snap.sensors[1].fetch).toBe('cancelled')
    // 'queued' becomes 'cancelled'
    expect(snap.sensors[2].fetch).toBe('cancelled')

    // All summaries were queued, so all become cancelled
    for (const s of snap.sensors) {
      expect(s.summary).toBe('cancelled')
    }
    expect(snap.overall_summary).toBe('cancelled')
  })

  it('cancel() preserves failed stages', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.setFetchState('hacker_news', 'failed', 0, 'timeout', 'api')
    tracker.cancel()
    const snap = tracker.snapshot()
    expect(snap.sensors[0].fetch).toBe('failed')
    expect(snap.sensors[0].fetch_error).toBe('timeout')
  })

  it('cancel() calls onChange listener', () => {
    const onChange = vi.fn()
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, 4, onChange)
    onChange.mockClear()
    tracker.cancel()
    expect(onChange).toHaveBeenCalledTimes(1)
    const snap = onChange.mock.calls[0][0]
    expect(snap.cancelled).toBe(true)
    expect(snap.running).toBe(false)
  })

  it('snapshot includes cancelled field (false by default)', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, 4)
    expect(tracker.snapshot().cancelled).toBe(false)
  })

  it('snapshot includes paused fields (false by default)', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, 4)
    const snap = tracker.snapshot()
    expect(snap.paused).toBe(false)
    expect(snap.paused_stage).toBeNull()
  })

  it('pause() sets paused state with stage', () => {
    const onChange = vi.fn()
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4, onChange)
    onChange.mockClear()

    tracker.pause('pre_overall')
    const snap = tracker.snapshot()
    expect(snap.paused).toBe(true)
    expect(snap.paused_stage).toBe('pre_overall')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('unpause() clears paused state', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.pause('pre_overall')
    tracker.unpause()
    const snap = tracker.snapshot()
    expect(snap.paused).toBe(false)
    expect(snap.paused_stage).toBeNull()
  })

  it('resetFetchState() resets sensor fetch state to queued', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.setFetchState('arxiv', 'failed', 0, 'timeout', 'api')

    tracker.resetFetchState('arxiv')
    const snap = tracker.snapshot()
    const sensor = snap.sensors.find(s => s.name === 'arxiv')!
    expect(sensor.fetch).toBe('queued')
    expect(sensor.fetch_error).toBeNull()
    expect(sensor.fetch_error_kind).toBeNull()
    expect(sensor.fetch_detail).toBeNull()
    expect(sensor.item_count).toBe(0)
  })

  it('resetSummaryState() resets sensor summary state to queued', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.setSummaryState('arxiv', 'failed', 'LLM error')
    tracker.setSummaryChunks('arxiv', 10, 5)

    tracker.resetSummaryState('arxiv')
    const snap = tracker.snapshot()
    const sensor = snap.sensors.find(s => s.name === 'arxiv')!
    expect(sensor.summary).toBe('queued')
    expect(sensor.summary_error).toBeNull()
    expect(sensor.summary_chunks_total).toBe(0)
    expect(sensor.summary_chunks_done).toBe(0)
  })

  it('setRetryProgress() and clearRetryProgress() update retry fields', () => {
    const onChange = vi.fn()
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4, onChange)
    onChange.mockClear()

    tracker.setRetryProgress(2, 3)
    const snap1 = tracker.snapshot()
    expect(snap1.retry_attempt).toBe(2)
    expect(snap1.retry_max).toBe(3)
    expect(onChange).toHaveBeenCalledTimes(1)

    tracker.clearRetryProgress()
    const snap2 = tracker.snapshot()
    expect(snap2.retry_attempt).toBe(0)
    expect(snap2.retry_max).toBe(0)
  })

  it('snapshot includes empty events array initially', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, 4)
    expect(tracker.snapshot().events).toEqual([])
  })

  it('addEvent appends events and includes them in snapshot', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.addEvent('info', 'system', 'Pipeline started')
    tracker.addEvent('ok', 'fetch', 'Fetched 10 items', 'hacker_news')

    const snap = tracker.snapshot()
    expect(snap.events).toHaveLength(2)
    expect(snap.events[0]).toMatchObject({
      level: 'info',
      phase: 'system',
      message: 'Pipeline started',
    })
    expect(snap.events[0].sensor).toBeUndefined()
    expect(snap.events[1]).toMatchObject({
      level: 'ok',
      phase: 'fetch',
      message: 'Fetched 10 items',
      sensor: 'hacker_news',
    })
  })

  it('events have ISO timestamps ending in Z', () => {
    const tracker = new PipelineProgressTracker([], 'fetch', 4, 1)
    tracker.addEvent('info', 'system', 'test')

    const ts = tracker.snapshot().events[0].ts
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })

  it('caps events at 200', () => {
    const tracker = new PipelineProgressTracker([], 'fetch', 4, 1)
    for (let i = 0; i < 210; i++) {
      tracker.addEvent('info', 'system', `Event ${i}`)
    }

    const snap = tracker.snapshot()
    expect(snap.events).toHaveLength(200)
    expect(snap.events[0].message).toBe('Event 10')
    expect(snap.events[199].message).toBe('Event 209')
  })

  it('snapshot returns a copy of events array', () => {
    const tracker = new PipelineProgressTracker([], 'fetch', 4, 1)
    tracker.addEvent('info', 'system', 'first')

    const snap1 = tracker.snapshot()
    tracker.addEvent('ok', 'system', 'second')
    const snap2 = tracker.snapshot()

    expect(snap1.events).toHaveLength(1)
    expect(snap2.events).toHaveLength(2)
  })

  it('addEvent triggers onChange callback', () => {
    const onChange = vi.fn()
    const tracker = new PipelineProgressTracker([], 'fetch', 4, 1, onChange)
    onChange.mockClear()

    tracker.addEvent('info', 'system', 'test')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('events survive cancel and complete', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.addEvent('info', 'system', 'Started')
    tracker.addEvent('ok', 'fetch', 'Done', 'hacker_news')
    tracker.complete()

    const snap = tracker.snapshot()
    expect(snap.events).toHaveLength(2)
    expect(snap.running).toBe(false)
  })

  it('events accumulate after cancel', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4, 4)
    tracker.addEvent('info', 'system', 'Started')
    tracker.cancel()
    tracker.addEvent('warn', 'system', 'Cancelled')

    const snap = tracker.snapshot()
    expect(snap.events).toHaveLength(2)
    expect(snap.cancelled).toBe(true)
  })
})
