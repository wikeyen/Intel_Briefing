// ABOUTME: Tests for the ActionBar component (Zone 1 of the Status page redesign).
// ABOUTME: Covers idle/running states, health display, mode dropdown, run button, and progress phases.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActionBar } from './ActionBar'
import type { HealthResponse } from '@/api/client'
import type { ActionBarProps } from './ActionBar'

function buildProps(overrides: Partial<ActionBarProps> = {}): ActionBarProps {
  return {
    health: { status: 'ok', last_fetch: '2025-01-15T10:30:00Z' },
    isRunning: false,
    phase: 'idle',
    progress: { done: 0, total: 0 },
    fetching: false,
    onRun: vi.fn(),
    ...overrides,
  }
}

describe('ActionBar', () => {
  it('shows health label and timestamp when idle', () => {
    const props = buildProps()
    render(<ActionBar {...props} />)
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    // Relative timestamp should be visible somewhere
    expect(screen.getByText(/ago$/)).toBeInTheDocument()
  })

  it('shows "No Data" when health has no_data status', () => {
    const props = buildProps({
      health: { status: 'no_data', last_fetch: null },
    })
    render(<ActionBar {...props} />)
    expect(screen.getByText('No Data')).toBeInTheDocument()
  })

  it('shows "Stale" when health is stale', () => {
    const props = buildProps({
      health: { status: 'stale', last_fetch: '2025-01-10T10:30:00Z' },
    })
    render(<ActionBar {...props} />)
    expect(screen.getByText('Stale')).toBeInTheDocument()
  })

  it('renders mode dropdown with default "Fetch + Summarize"', () => {
    const props = buildProps()
    render(<ActionBar {...props} />)
    // The dropdown should display the default mode
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

  it('shows progress info when running (fetching phase)', () => {
    const props = buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 7, total: 13 },
    })
    render(<ActionBar {...props} />)
    expect(screen.getByText(/Fetching/)).toBeInTheDocument()
    expect(screen.getByText(/7 of 13/)).toBeInTheDocument()
  })

  it('shows summarizing phase text', () => {
    const props = buildProps({
      isRunning: true,
      phase: 'summarizing',
      progress: { done: 3, total: 13 },
    })
    render(<ActionBar {...props} />)
    expect(screen.getByText(/Summarizing/)).toBeInTheDocument()
    expect(screen.getByText(/3 of 13/)).toBeInTheDocument()
  })

  it('shows briefing phase text', () => {
    const props = buildProps({
      isRunning: true,
      phase: 'briefing',
      progress: { done: 0, total: 0 },
    })
    render(<ActionBar {...props} />)
    expect(screen.getByText(/Generating briefing/)).toBeInTheDocument()
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

  it('disables Run button and shows "Running…" when running', () => {
    const props = buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 2, total: 13 },
    })
    render(<ActionBar {...props} />)
    const btn = screen.getByRole('button', { name: /running/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('Running\u2026')
  })
})
