// ABOUTME: Tests for ControlBar — the unified top control bar on the Status page.
// ABOUTME: Covers idle/running/paused states, metrics display, run/stop buttons, mode selector, and selection helpers.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n/context'
import { ControlBar } from './ControlBar'
import type { ControlBarProps } from './ControlBar'
import { makeSensorJob, makePipelineStatus } from './test-helpers'

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider initialLocale="en">{ui}</I18nProvider>)
}

function buildProps(overrides: Partial<ControlBarProps> = {}): ControlBarProps {
  return {
    health: { status: 'ok', last_fetch: new Date().toISOString() },
    config: null,
    pipelineStatus: null,
    sourcesOk: 10,
    sourcesTotal: 13,
    totalItems: 114,
    isRunning: false,
    phase: 'idle',
    progress: { done: 0, total: 0 },
    failedCount: 0,
    retryingCount: 0,
    retryAttempt: 0,
    retryMax: 0,
    poolSize: 0,
    isPaused: false,
    selectedCount: 0,
    totalSensors: 13,
    hasFailedSensors: false,
    failedSensorCount: 0,
    onRun: vi.fn(),
    onStop: vi.fn(),
    onSkipRetries: vi.fn(),
    onSelectAll: vi.fn(),
    onSelectNone: vi.fn(),
    onSelectFailed: vi.fn(),
    onGenerateOverall: vi.fn(),
    onRetryFailed: vi.fn(),
    fetching: false,
    isStopping: false,
    ...overrides,
  }
}

describe('ControlBar', () => {
  // --- Idle state: metrics from former StatusStrip ---
  it('renders health label when idle', () => {
    renderWithI18n(<ControlBar {...buildProps()} />)
    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })

  it('renders source count when idle', () => {
    renderWithI18n(<ControlBar {...buildProps({ sourcesOk: 10, sourcesTotal: 13 })} />)
    expect(screen.getByText('10/13')).toBeInTheDocument()
    expect(screen.getByText('sources')).toBeInTheDocument()
  })

  it('renders item count when idle', () => {
    renderWithI18n(<ControlBar {...buildProps({ totalItems: 114 })} />)
    expect(screen.getByText('114')).toBeInTheDocument()
    expect(screen.getByText('items')).toBeInTheDocument()
  })

  it('renders schedule text when config has fetch_time', () => {
    renderWithI18n(<ControlBar {...buildProps({
      config: { fetch_time: '14:00', fetch_timezone: 'UTC' } as ControlBarProps['config'],
    })} />)
    expect(screen.getByTestId('control-schedule')).toHaveTextContent(/Next:/)
  })

  it('renders "No schedule" when no fetch_time', () => {
    renderWithI18n(<ControlBar {...buildProps({ config: null })} />)
    expect(screen.getByTestId('control-schedule')).toHaveTextContent('No schedule')
  })

  // --- Idle state: controls from former CommandBar ---
  it('renders mode dropdown with default "Fetch + Summarize"', () => {
    renderWithI18n(<ControlBar {...buildProps()} />)
    expect(screen.getByRole('combobox')).toHaveValue('fetch_summarize')
  })


  it('shows retry failed button when hasFailedSensors', () => {
    const onRetryFailed = vi.fn()
    renderWithI18n(<ControlBar {...buildProps({ hasFailedSensors: true, failedSensorCount: 3, onRetryFailed })} />)
    const btn = screen.getByRole('button', { name: /retry 3 failed/i })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(onRetryFailed).toHaveBeenCalledOnce()
  })

  it('hides retry failed button when no failures', () => {
    renderWithI18n(<ControlBar {...buildProps({ hasFailedSensors: false, failedSensorCount: 0 })} />)
    expect(screen.queryByRole('button', { name: /retry.*failed/i })).not.toBeInTheDocument()
  })

  it('does not render Failed quick-select when no failed sensors', () => {
    renderWithI18n(<ControlBar {...buildProps({ hasFailedSensors: false })} />)
    expect(screen.queryByText('Failed')).not.toBeInTheDocument()
  })


  it('shows "Run All" when no sensors selected', () => {
    renderWithI18n(<ControlBar {...buildProps({ selectedCount: 0 })} />)
    const btn = screen.getByRole('button', { name: /run all/i })
    expect(btn).toBeEnabled()
  })

  it('shows "Run N" when some sensors are selected', () => {
    renderWithI18n(<ControlBar {...buildProps({ selectedCount: 3 })} />)
    const btn = screen.getByRole('button', { name: /run 3/i })
    expect(btn).toBeEnabled()
  })

  it('shows "Run All" when all sensors are selected', () => {
    renderWithI18n(<ControlBar {...buildProps({ selectedCount: 13, totalSensors: 13 })} />)
    const btn = screen.getByRole('button', { name: /run all/i })
    expect(btn).toHaveTextContent('Run All')
  })

  it('calls onRun with selected mode when Run is clicked', () => {
    const onRun = vi.fn()
    renderWithI18n(<ControlBar {...buildProps({ selectedCount: 5, onRun })} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fetch' } })
    fireEvent.click(screen.getByRole('button', { name: /run/i }))
    expect(onRun).toHaveBeenCalledWith('fetch')
  })

  it('disables Run button when fetching', () => {
    renderWithI18n(<ControlBar {...buildProps({ fetching: true, selectedCount: 5 })} />)
    const btn = screen.getByRole('button', { name: /run/i })
    expect(btn).toBeDisabled()
  })

  // --- Running state ---
  it('shows Stop button when running', () => {
    renderWithI18n(<ControlBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
    })} />)
    const btn = screen.getByRole('button', { name: /stop/i })
    expect(btn).toBeEnabled()
  })

  it('calls onStop when Stop is clicked', () => {
    const onStop = vi.fn()
    renderWithI18n(<ControlBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
      onStop,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('shows disabled "Stopping..." when isStopping', () => {
    renderWithI18n(<ControlBar {...buildProps({
      isRunning: true,
      phase: 'stopping',
      progress: { done: 5, total: 13 },
      isStopping: true,
    })} />)
    const btn = screen.getByRole('button', { name: /stopping/i })
    expect(btn).toBeDisabled()
  })

  it('shows count-based phase label when fetching', () => {
    const sensors = Array.from({ length: 13 }, (_, i) =>
      makeSensorJob(`sensor_${i}`, i < 3 ? { fetch: 'ok' } : { fetch: 'queued' }),
    )
    renderWithI18n(<ControlBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
      pipelineStatus: makePipelineStatus({ running: true, alive: true, sensors }),
    })} />)
    expect(screen.getByText('Fetched 3 of 13 sources')).toBeInTheDocument()
  })

  it('shows progress count when running', () => {
    const sensors = Array.from({ length: 13 }, (_, i) =>
      makeSensorJob(`sensor_${i}`, i < 7
        ? { fetch: 'ok', summary: 'ok' }
        : { fetch: 'ok', summary: 'running' }),
    )
    renderWithI18n(<ControlBar {...buildProps({
      isRunning: true,
      phase: 'summarizing',
      progress: { done: 7, total: 13 },
      pipelineStatus: makePipelineStatus({ running: true, alive: true, sensors }),
    })} />)
    expect(screen.getByText('7/13')).toBeInTheDocument()
    expect(screen.getByText('sensors')).toBeInTheDocument()
  })

  it('shows failed count during run when failures exist', () => {
    renderWithI18n(<ControlBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 10, total: 13 },
      failedCount: 2,
    })} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('hides mode dropdown when running', () => {
    renderWithI18n(<ControlBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
    })} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows detail text when running with detail', () => {
    renderWithI18n(<ControlBar {...buildProps({
      isRunning: true,
      phase: 'fetching',
      progress: { done: 3, total: 13 },
      detail: 'hacker_news',
    })} />)
    expect(screen.getByText('hacker_news')).toBeInTheDocument()
  })

  // --- Paused state ---
  it('shows warning and Generate Summary when paused', () => {
    renderWithI18n(<ControlBar {...buildProps({
      isRunning: true,
      isPaused: true,
      failedCount: 3,
      phase: 'paused',
      progress: { done: 7, total: 13 },
    })} />)
    expect(screen.getByText(/3 failed/)).toBeInTheDocument()
    expect(screen.getByText(/retry or skip above/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate summary/i })).toBeInTheDocument()
  })

  it('calls onGenerateOverall when Generate Summary is clicked', () => {
    const onGenerateOverall = vi.fn()
    renderWithI18n(<ControlBar {...buildProps({
      isRunning: true,
      isPaused: true,
      failedCount: 2,
      phase: 'paused',
      progress: { done: 5, total: 13 },
      onGenerateOverall,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /generate summary/i }))
    expect(onGenerateOverall).toHaveBeenCalledOnce()
  })
})
