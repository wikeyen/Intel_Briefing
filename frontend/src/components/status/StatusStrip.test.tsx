// ABOUTME: Tests for StatusStrip — the dense top bar showing health, metrics, and schedule.
// ABOUTME: Covers idle/running states, health dot, metrics display, schedule, and progress bar.
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusStrip } from './StatusStrip'
import type { StatusStripProps } from './StatusStrip'

function buildProps(overrides: Partial<StatusStripProps> = {}): StatusStripProps {
  return {
    health: { status: 'ok', last_fetch: '2026-01-15T10:30:00Z' },
    config: {
      fetch_time: '07:00',
      fetch_timezone: 'America/New_York',
    } as StatusStripProps['config'],
    sourcesOk: 10,
    sourcesTotal: 13,
    totalItems: 42,
    isRunning: false,
    phase: 'idle',
    progress: { done: 0, total: 0 },
    failedCount: 0,
    ...overrides,
  }
}

/** Helper to scope queries to the strip (single layout now, no mobile). */
function getStrip() {
  const dot = screen.getByTestId('strip-health-dot')
  return dot.closest('.status-strip') as HTMLElement
}

describe('StatusStrip', () => {
  it('renders health dot when idle', () => {
    render(<StatusStrip {...buildProps()} />)
    const dot = screen.getByTestId('strip-health-dot')
    expect(dot).toBeInTheDocument()
  })

  it('shows sources count when idle', () => {
    render(<StatusStrip {...buildProps()} />)
    const strip = getStrip()
    expect(within(strip).getByText('10/13')).toBeInTheDocument()
    expect(within(strip).getByText('sources')).toBeInTheDocument()
  })

  it('shows total items when idle', () => {
    render(<StatusStrip {...buildProps()} />)
    const strip = getStrip()
    expect(within(strip).getByText('42')).toBeInTheDocument()
    expect(within(strip).getByText('items')).toBeInTheDocument()
  })

  it('shows schedule when idle with config', () => {
    render(<StatusStrip {...buildProps()} />)
    const schedule = screen.getByTestId('strip-schedule')
    expect(schedule).toHaveTextContent(/Next:/)
  })

  it('shows "No schedule" when no fetch_time configured', () => {
    render(<StatusStrip {...buildProps({ config: null })} />)
    const schedule = screen.getByTestId('strip-schedule')
    expect(schedule).toHaveTextContent('No schedule')
  })

  it('shows progress percentage when running', () => {
    render(<StatusStrip {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 7, total: 13 },
    })} />)
    const pct = screen.getByTestId('strip-progress-pct')
    expect(pct).toHaveTextContent('54%')
  })

  it('shows sensor progress count when running', () => {
    render(<StatusStrip {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 5, total: 13 },
    })} />)
    const strip = getStrip()
    expect(within(strip).getByText('5/13')).toBeInTheDocument()
    expect(within(strip).getByText('sensors')).toBeInTheDocument()
  })

  it('shows failed count when running with failures', () => {
    render(<StatusStrip {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 10, total: 13 },
      failedCount: 2,
    })} />)
    const strip = getStrip()
    expect(within(strip).getByText('2')).toBeInTheDocument()
    expect(within(strip).getByText('failed')).toBeInTheDocument()
  })

  it('shows detail text when running with detail', () => {
    render(<StatusStrip {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
      detail: 'hacker_news',
    })} />)
    const strip = getStrip()
    expect(within(strip).getByText('hacker_news')).toBeInTheDocument()
  })

  it('shows "Fetching" label when in fetching phase', () => {
    render(<StatusStrip {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 0, total: 13 },
    })} />)
    const strip = getStrip()
    expect(within(strip).getByText('Fetching')).toBeInTheDocument()
  })

  it('shows "Summarizing" label when in summarizing phase', () => {
    render(<StatusStrip {...buildProps({
      isRunning: true,
      phase: 'summarizing',
      progress: { done: 5, total: 13 },
    })} />)
    const strip = getStrip()
    expect(within(strip).getByText('Summarizing')).toBeInTheDocument()
  })

  it('does not show failed count when failedCount is 0', () => {
    render(<StatusStrip {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
      failedCount: 0,
    })} />)
    const strip = getStrip()
    expect(within(strip).queryByText('failed')).not.toBeInTheDocument()
  })
})
