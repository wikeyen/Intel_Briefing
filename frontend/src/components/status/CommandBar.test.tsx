// ABOUTME: Tests for CommandBar — the fixed bottom control bar on the Status page.
// ABOUTME: Covers idle/running/paused states, run/stop buttons, mode selector, and selection helpers.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CommandBar } from './CommandBar'
import type { CommandBarProps } from './CommandBar'

function buildProps(overrides: Partial<CommandBarProps> = {}): CommandBarProps {
  return {
    isRunning: false,
    phase: 'idle',
    progress: { done: 0, total: 0 },
    failedCount: 0,
    isPaused: false,
    selectedCount: 0,
    totalSensors: 13,
    hasFailedSensors: false,
    onRun: vi.fn(),
    onStop: vi.fn(),
    onSkipRetries: vi.fn(),
    onSelectAll: vi.fn(),
    onSelectNone: vi.fn(),
    onSelectFailed: vi.fn(),
    fetching: false,
    isStopping: false,
    ...overrides,
  }
}

describe('CommandBar', () => {
  // --- Idle state ---
  it('renders mode dropdown with default "Fetch + Summarize"', () => {
    render(<CommandBar {...buildProps()} />)
    expect(screen.getByRole('combobox')).toHaveValue('fetch_summarize')
  })

  it('renders All and None quick-select buttons', () => {
    render(<CommandBar {...buildProps()} />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('None')).toBeInTheDocument()
  })

  it('renders Failed quick-select when hasFailedSensors', () => {
    render(<CommandBar {...buildProps({ hasFailedSensors: true })} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('does not render Failed quick-select when no failed sensors', () => {
    render(<CommandBar {...buildProps({ hasFailedSensors: false })} />)
    expect(screen.queryByText('Failed')).not.toBeInTheDocument()
  })

  it('calls onSelectAll when All is clicked', () => {
    const onSelectAll = vi.fn()
    render(<CommandBar {...buildProps({ onSelectAll })} />)
    fireEvent.click(screen.getByText('All'))
    expect(onSelectAll).toHaveBeenCalledOnce()
  })

  it('calls onSelectNone when None is clicked', () => {
    const onSelectNone = vi.fn()
    render(<CommandBar {...buildProps({ onSelectNone })} />)
    fireEvent.click(screen.getByText('None'))
    expect(onSelectNone).toHaveBeenCalledOnce()
  })

  it('disables Run button when no sensors selected', () => {
    render(<CommandBar {...buildProps({ selectedCount: 0 })} />)
    const btn = screen.getByRole('button', { name: /run/i })
    expect(btn).toBeDisabled()
  })

  it('enables Run button when sensors are selected', () => {
    render(<CommandBar {...buildProps({ selectedCount: 3 })} />)
    const btn = screen.getByRole('button', { name: /run 3/i })
    expect(btn).toBeEnabled()
  })

  it('shows "Run" when all sensors are selected', () => {
    render(<CommandBar {...buildProps({ selectedCount: 13, totalSensors: 13 })} />)
    const btn = screen.getByRole('button', { name: /run/i })
    expect(btn).toHaveTextContent('Run')
    expect(btn).not.toHaveTextContent('Run 13')
  })

  it('calls onRun with selected mode when Run is clicked', () => {
    const onRun = vi.fn()
    render(<CommandBar {...buildProps({ selectedCount: 5, onRun })} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fetch' } })
    fireEvent.click(screen.getByRole('button', { name: /run/i }))
    expect(onRun).toHaveBeenCalledWith('fetch')
  })

  it('disables Run button when fetching', () => {
    render(<CommandBar {...buildProps({ fetching: true, selectedCount: 5 })} />)
    const btn = screen.getByRole('button', { name: /run/i })
    expect(btn).toBeDisabled()
  })

  // --- Running state ---
  it('shows Stop button when running', () => {
    render(<CommandBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
    })} />)
    const btn = screen.getByRole('button', { name: /stop/i })
    expect(btn).toBeEnabled()
  })

  it('calls onStop when Stop is clicked', () => {
    const onStop = vi.fn()
    render(<CommandBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
      onStop,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('shows disabled "Stopping..." when isStopping', () => {
    render(<CommandBar {...buildProps({
      isRunning: true,
      phase: 'stopping',
      progress: { done: 5, total: 13 },
      isStopping: true,
    })} />)
    const btn = screen.getByRole('button', { name: /stopping/i })
    expect(btn).toBeDisabled()
  })

  it('shows phase label when running', () => {
    render(<CommandBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
    })} />)
    expect(screen.getByText('Fetching')).toBeInTheDocument()
  })

  it('shows progress count when running', () => {
    render(<CommandBar {...buildProps({
      isRunning: true,
      phase: 'summarizing',
      progress: { done: 7, total: 13 },
    })} />)
    expect(screen.getByText('7/13')).toBeInTheDocument()
    expect(screen.getByText('sensors')).toBeInTheDocument()
  })

  it('shows failed count during run when failures exist', () => {
    render(<CommandBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 10, total: 13 },
      failedCount: 2,
    })} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('hides mode dropdown when running', () => {
    render(<CommandBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
    })} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  // --- Paused state ---
  it('shows warning and Skip & Continue when paused', () => {
    render(<CommandBar {...buildProps({
      isRunning: true,
      isPaused: true,
      failedCount: 3,
      phase: 'fetching',
      progress: { done: 7, total: 13 },
    })} />)
    expect(screen.getByText(/3 sensors failed/)).toBeInTheDocument()
    expect(screen.getByText(/Skip/)).toBeInTheDocument()
  })

  it('calls onSkipRetries when Skip & Continue is clicked', () => {
    const onSkipRetries = vi.fn()
    render(<CommandBar {...buildProps({
      isRunning: true,
      isPaused: true,
      failedCount: 2,
      phase: 'fetching',
      progress: { done: 5, total: 13 },
      onSkipRetries,
    })} />)
    fireEvent.click(screen.getByText(/Skip/))
    expect(onSkipRetries).toHaveBeenCalledOnce()
  })

  it('shows detail text when running with detail', () => {
    render(<CommandBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
      detail: 'hacker_news',
    })} />)
    expect(screen.getByText('hacker_news')).toBeInTheDocument()
  })
})
