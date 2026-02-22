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
    expect(snap.default_concurrency).toBe(4)
    expect(snap.local_summary_concurrency).toBe(4)
    expect(snap.sensors).toHaveLength(3)
    for (const s of snap.sensors) {
      expect(s.fetch).toBe('queued')
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
})
