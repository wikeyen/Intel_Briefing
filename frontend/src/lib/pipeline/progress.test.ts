// ABOUTME: Tests for PipelineProgressTracker — the observer that manages pipeline state.
// ABOUTME: Validates state transitions, event notifications, and snapshot generation.
import { describe, it, expect, vi } from 'vitest'
import { PipelineProgressTracker } from './progress'

describe('PipelineProgressTracker', () => {
  const sensors = ['hacker_news', 'arxiv', 'github']

  it('initializes all sensors with correct initial states for fetch_summarize', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4)
    const snap = tracker.snapshot()
    expect(snap.running).toBe(true)
    expect(snap.mode).toBe('fetch_summarize')
    expect(snap.concurrency).toBe(4)
    expect(snap.sensors).toHaveLength(3)
    for (const s of snap.sensors) {
      expect(s.fetch).toBe('queued')
      expect(s.summary).toBe('queued')
    }
    expect(snap.overall_summary).toBe('queued')
  })

  it('initializes summary stages as skipped for fetch mode', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4)
    const snap = tracker.snapshot()
    for (const s of snap.sensors) {
      expect(s.fetch).toBe('queued')
      expect(s.summary).toBe('skipped')
    }
    expect(snap.overall_summary).toBe('skipped')
  })

  it('initializes fetch stages as skipped for summarize mode', () => {
    const tracker = new PipelineProgressTracker(sensors, 'summarize', 4)
    const snap = tracker.snapshot()
    for (const s of snap.sensors) {
      expect(s.fetch).toBe('skipped')
      expect(s.summary).toBe('queued')
    }
    expect(snap.overall_summary).toBe('queued')
  })

  it('updates fetch stage state', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4)
    tracker.setFetchState('arxiv', 'running')
    expect(tracker.snapshot().sensors[1].fetch).toBe('running')

    tracker.setFetchState('arxiv', 'ok', 5)
    const snap = tracker.snapshot()
    expect(snap.sensors[1].fetch).toBe('ok')
    expect(snap.sensors[1].item_count).toBe(5)
  })

  it('updates summary stage state', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch_summarize', 4)
    tracker.setSummaryState('arxiv', 'running')
    expect(tracker.snapshot().sensors[1].summary).toBe('running')

    tracker.setSummaryState('arxiv', 'ok')
    expect(tracker.snapshot().sensors[1].summary).toBe('ok')
  })

  it('tracks fetch errors with kind', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4)
    tracker.setFetchState('github', 'failed', 0, 'No token', 'config')
    const s = tracker.snapshot().sensors[2]
    expect(s.fetch).toBe('failed')
    expect(s.fetch_error).toBe('No token')
    expect(s.fetch_error_kind).toBe('config')
  })

  it('calls onChange listener on state change', () => {
    const onChange = vi.fn()
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4, onChange)
    tracker.setFetchState('hacker_news', 'running')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(tracker.snapshot())
  })

  it('computes total_items from ok sensors', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4)
    tracker.setFetchState('hacker_news', 'ok', 10)
    tracker.setFetchState('arxiv', 'ok', 5)
    tracker.setFetchState('github', 'failed')
    expect(tracker.snapshot().total_items).toBe(15)
  })

  it('complete() sets running=false and completed_at', () => {
    const tracker = new PipelineProgressTracker(sensors, 'fetch', 4)
    tracker.complete()
    const snap = tracker.snapshot()
    expect(snap.running).toBe(false)
    expect(snap.completed_at).toBeTruthy()
  })
})
