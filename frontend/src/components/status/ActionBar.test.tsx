// ABOUTME: Tests for the ActionBar component — the page header with health dot and run controls.
// ABOUTME: Covers idle/running states, health dot, subtitle, mode dropdown, run button, and progress phases.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ActionBar } from './ActionBar'
import type { ActionBarProps } from './ActionBar'

function buildProps(overrides: Partial<ActionBarProps> = {}): ActionBarProps {
  return {
    health: { status: 'ok', last_fetch: '2025-01-15T10:30:00Z' },
    isRunning: false,
    phase: 'idle',
    progress: { done: 0, total: 0 },
    fetching: false,
    isStopping: false,
    onRun: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  }
}

describe('ActionBar', () => {
  it('shows "Status" title and health description when idle', () => {
    const props = buildProps()
    render(<ActionBar {...props} />)
    expect(screen.getByText('Status')).toBeInTheDocument()
    // Subtitle should show health description + relative timestamp
    const subtitle = screen.getByTestId('action-bar-subtitle')
    expect(subtitle).toHaveTextContent(/Data is fresh/)
    expect(subtitle).toHaveTextContent(/ago$/)
  })

  it('shows health dot with correct aria-label for ok status', () => {
    const props = buildProps()
    render(<ActionBar {...props} />)
    const dot = screen.getByTestId('health-dot')
    expect(dot).toHaveAttribute('aria-label', 'Healthy')
  })

  it('shows health dot with "No Data" label when no_data', () => {
    const props = buildProps({
      health: { status: 'no_data', last_fetch: null },
    })
    render(<ActionBar {...props} />)
    const dot = screen.getByTestId('health-dot')
    expect(dot).toHaveAttribute('aria-label', 'No Data')
    const subtitle = screen.getByTestId('action-bar-subtitle')
    expect(subtitle).toHaveTextContent('Pipeline has never run')
  })

  it('shows health dot with "Stale" label when stale', () => {
    const props = buildProps({
      health: { status: 'stale', last_fetch: '2025-01-10T10:30:00Z' },
    })
    render(<ActionBar {...props} />)
    const dot = screen.getByTestId('health-dot')
    expect(dot).toHaveAttribute('aria-label', 'Stale')
  })

  it('renders mode dropdown with default "Fetch + Summarize"', () => {
    const props = buildProps()
    render(<ActionBar {...props} />)
    expect(screen.getByRole('combobox')).toHaveValue('fetch_summarize')
  })

  it('renders Run button', () => {
    const props = buildProps()
    render(<ActionBar {...props} />)
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument()
  })

  it('calls onRun with selected mode when Run is clicked', () => {
    const onRun = vi.fn()
    const props = buildProps({ onRun })
    render(<ActionBar {...props} />)
    // Change mode to 'fetch'
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fetch' } })
    fireEvent.click(screen.getByRole('button', { name: /run/i }))
    expect(onRun).toHaveBeenCalledWith('fetch')
  })

  it('disables Run button when fetching', () => {
    const props = buildProps({ fetching: true })
    render(<ActionBar {...props} />)
    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled()
  })

  it('shows progress info in subtitle when running (fetching phase)', () => {
    const props = buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 7, total: 13 },
    })
    render(<ActionBar {...props} />)
    const subtitle = screen.getByTestId('action-bar-subtitle')
    expect(subtitle).toHaveTextContent(/Fetching/)
    expect(subtitle).toHaveTextContent(/7 of 13/)
  })

  it('shows summarizing phase text in subtitle', () => {
    const props = buildProps({
      isRunning: true,
      phase: 'summarizing',
      progress: { done: 3, total: 13 },
    })
    render(<ActionBar {...props} />)
    const subtitle = screen.getByTestId('action-bar-subtitle')
    expect(subtitle).toHaveTextContent(/Summarizing/)
    expect(subtitle).toHaveTextContent(/3 of 13/)
  })

  it('shows briefing phase text in subtitle', () => {
    const props = buildProps({
      isRunning: true,
      phase: 'briefing',
      progress: { done: 0, total: 0 },
    })
    render(<ActionBar {...props} />)
    const subtitle = screen.getByTestId('action-bar-subtitle')
    expect(subtitle).toHaveTextContent(/Generating overall briefing/)
  })

  it('hides mode dropdown when running', () => {
    const props = buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 2, total: 13 },
    })
    render(<ActionBar {...props} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows Stop button when running', () => {
    const onStop = vi.fn()
    const props = buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 2, total: 13 },
      onStop,
    })
    render(<ActionBar {...props} />)
    const btn = screen.getByRole('button', { name: /stop/i })
    expect(btn).toBeEnabled()
    expect(btn).toHaveTextContent('Stop')
    fireEvent.click(btn)
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('shows disabled "Stopping\u2026" button when isStopping', () => {
    const props = buildProps({
      isRunning: true,
      phase: 'stopping',
      progress: { done: 2, total: 13 },
      isStopping: true,
    })
    render(<ActionBar {...props} />)
    const btn = screen.getByRole('button', { name: /stopping/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('Stopping\u2026')
  })

  it('shows "Stopping\u2026" in subtitle when stopping phase', () => {
    const props = buildProps({
      isRunning: true,
      phase: 'stopping',
      progress: { done: 5, total: 13 },
      isStopping: true,
    })
    render(<ActionBar {...props} />)
    const subtitle = screen.getByTestId('action-bar-subtitle')
    expect(subtitle).toHaveTextContent(/Stopping/)
  })
})
