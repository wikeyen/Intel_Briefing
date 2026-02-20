// ABOUTME: Tests for StaleProcessBanner component and detectStale function.
// ABOUTME: Covers stale detection logic, banner rendering, and dismiss/restart actions.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { StaleProcessBanner, detectStale } from './StaleProcessBanner'
import type { SummaryProgress, PipelineStatus } from '@/api/client'

/* ------------------------------------------------------------------ */
/* detectStale() unit tests                                            */
/* ------------------------------------------------------------------ */

function makeSummaryProgress(overrides: Partial<SummaryProgress> = {}): SummaryProgress {
  return {
    running: false,
    started_at: '2026-01-15T10:00:00Z',
    completed_at: '2026-01-15T10:30:00Z',
    sensors: [],
    alive: false,
    ...overrides,
  }
}

function makePipelineStatus(overrides: Partial<PipelineStatus> = {}): PipelineStatus {
  return {
    running: false,
    cancelled: false,
    mode: 'fetch_summarize',
    default_concurrency: 4,
    local_summary_concurrency: 1,
    started_at: '2026-01-15T10:00:00Z',
    completed_at: '2026-01-15T10:30:00Z',
    sensors: [],
    overall_summary: 'ok',
    total_items: 0,
    alive: false,
    ...overrides,
  }
}

describe('detectStale', () => {
  it('returns null when nothing is running', () => {
    const result = detectStale(
      makeSummaryProgress({ running: false }),
      makePipelineStatus({ running: false }),
    )
    expect(result).toBeNull()
  })

  it('returns null when process is running and alive', () => {
    const result = detectStale(
      makeSummaryProgress({ running: true, alive: true }),
      null,
    )
    expect(result).toBeNull()
  })

  it('detects stale summary (running=true, alive=false)', () => {
    const result = detectStale(
      makeSummaryProgress({
        running: true,
        alive: false,
        sensors: [
          { sensor_name: 'hacker_news', label: 'HN', state: 'ok', error: null },
          { sensor_name: 'github', label: 'GH', state: 'pending', error: null },
          { sensor_name: '__overall__', label: 'Overall', state: 'pending', error: null },
        ],
      }),
      null,
    )
    expect(result).not.toBeNull()
    expect(result!.type).toBe('summary')
    expect(result!.completedSensors).toBe(1)
    expect(result!.totalSensors).toBe(3)
  })

  it('detects stale pipeline (running=true, alive=false)', () => {
    const result = detectStale(
      null,
      makePipelineStatus({
        running: true,
        alive: false,
        sensors: [
          { name: 'hacker_news', fetch: 'ok', fetch_error: null, fetch_error_kind: null, summary: 'ok', summary_error: null, item_count: 5, summary_chunks_total: 0, summary_chunks_done: 0, verify_attempt: 0, verify_max_retries: 0, verify_failures: 0 },
          { name: 'github', fetch: 'failed', fetch_error: 'timeout', fetch_error_kind: 'api', summary: 'skipped', summary_error: null, item_count: 0, summary_chunks_total: 0, summary_chunks_done: 0, verify_attempt: 0, verify_max_retries: 0, verify_failures: 0 },
          { name: 'arxiv', fetch: 'running', fetch_error: null, fetch_error_kind: null, summary: 'queued', summary_error: null, item_count: 0, summary_chunks_total: 0, summary_chunks_done: 0, verify_attempt: 0, verify_max_retries: 0, verify_failures: 0 },
        ],
      }),
    )
    expect(result).not.toBeNull()
    expect(result!.type).toBe('pipeline')
    expect(result!.completedSensors).toBe(2)
    expect(result!.totalSensors).toBe(3)
    expect(result!.failedSensors).toEqual(['github'])
  })

  it('prioritises pipeline over summary when both are stale', () => {
    const result = detectStale(
      makeSummaryProgress({ running: true, alive: false }),
      makePipelineStatus({ running: true, alive: false }),
    )
    expect(result).not.toBeNull()
    expect(result!.type).toBe('pipeline')
  })

  it('returns null when both are null', () => {
    expect(detectStale(null, null)).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/* StaleProcessBanner component tests                                  */
/* ------------------------------------------------------------------ */

describe('StaleProcessBanner', () => {
  it('renders interrupted label for summary', () => {
    render(
      <StaleProcessBanner
        stale={{
          type: 'summary',
          startedAt: '2026-01-15T10:00:00Z',
          completedSensors: 3,
          totalSensors: 5,
          failedSensors: [],
        }}
        onDismiss={() => {}}
        onRestart={() => {}}
      />,
    )
    expect(screen.getByText('Summary interrupted')).toBeInTheDocument()
    expect(screen.getByText(/60% complete/)).toBeInTheDocument()
    expect(screen.getByText('Dismiss')).toBeInTheDocument()
    expect(screen.getByText('Restart')).toBeInTheDocument()
  })

  it('renders interrupted label for pipeline', () => {
    render(
      <StaleProcessBanner
        stale={{
          type: 'pipeline',
          startedAt: '2026-01-15T10:00:00Z',
          completedSensors: 1,
          totalSensors: 4,
          failedSensors: ['github'],
        }}
        onDismiss={() => {}}
        onRestart={() => {}}
      />,
    )
    expect(screen.getByText('Pipeline interrupted')).toBeInTheDocument()
    expect(screen.getByText(/25% complete/)).toBeInTheDocument()
    expect(screen.getByText(/1 failed/)).toBeInTheDocument()
  })

  it('calls onDismiss when Dismiss is clicked', () => {
    const onDismiss = vi.fn()
    render(
      <StaleProcessBanner
        stale={{
          type: 'summary',
          startedAt: '',
          completedSensors: 0,
          totalSensors: 3,
          failedSensors: [],
        }}
        onDismiss={onDismiss}
        onRestart={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('calls onRestart when Restart is clicked', () => {
    const onRestart = vi.fn()
    render(
      <StaleProcessBanner
        stale={{
          type: 'pipeline',
          startedAt: '',
          completedSensors: 0,
          totalSensors: 2,
          failedSensors: [],
        }}
        onDismiss={() => {}}
        onRestart={onRestart}
      />,
    )
    fireEvent.click(screen.getByText('Restart'))
    expect(onRestart).toHaveBeenCalledOnce()
  })
})
