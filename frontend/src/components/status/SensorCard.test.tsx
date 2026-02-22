// ABOUTME: Tests for SensorCard — individual sensor status card in the grid.
// ABOUTME: Covers all visual states: healthy, selected, disabled, failed, running, and interactions.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SensorCard } from './SensorCard'
import type { SensorCardProps } from './SensorCard'
import { makeSensorJob } from './test-helpers'

function buildProps(overrides: Partial<SensorCardProps> = {}): SensorCardProps {
  return {
    sensorKey: 'hacker_news',
    label: 'Hacker News',
    category: 'Tech',
    isRunning: false,
    itemCount: 15,
    lastFetchAgo: '2h ago',
    isOk: true,
    isFailed: false,
    isDisabled: false,
    isConfigError: false,
    isApiError: false,
    isSelected: false,
    onToggleSelect: vi.fn(),
    ...overrides,
  }
}

describe('SensorCard', () => {
  it('renders label and category', () => {
    render(<SensorCard {...buildProps()} />)
    expect(screen.getByText('Hacker News')).toBeInTheDocument()
    expect(screen.getByText('Tech')).toBeInTheDocument()
  })

  it('shows item count for healthy sensor', () => {
    render(<SensorCard {...buildProps()} />)
    expect(screen.getByText('15 items')).toBeInTheDocument()
  })

  it('shows last fetch time for healthy sensor', () => {
    render(<SensorCard {...buildProps()} />)
    expect(screen.getByText('2h ago')).toBeInTheDocument()
  })

  it('calls onToggleSelect when clicked (idle, not disabled)', () => {
    const onToggleSelect = vi.fn()
    render(<SensorCard {...buildProps({ onToggleSelect })} />)
    fireEvent.click(screen.getByText('Hacker News'))
    expect(onToggleSelect).toHaveBeenCalledOnce()
  })

  it('calls onToggleSelect on Enter key', () => {
    const onToggleSelect = vi.fn()
    render(<SensorCard {...buildProps({ onToggleSelect })} />)
    const card = screen.getByRole('button')
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onToggleSelect).toHaveBeenCalledOnce()
  })

  it('does not call onToggleSelect when disabled', () => {
    const onToggleSelect = vi.fn()
    render(<SensorCard {...buildProps({ isDisabled: true, isOk: false, onToggleSelect })} />)
    fireEvent.click(screen.getByText('Hacker News'))
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('does not call onToggleSelect when running', () => {
    const onToggleSelect = vi.fn()
    render(<SensorCard {...buildProps({
      isRunning: true,
      liveSensor: makeSensorJob('hacker_news', { fetch: 'running' }),
      onToggleSelect,
    })} />)
    fireEvent.click(screen.getByText('Hacker News'))
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('shows "Disabled" for disabled sensor', () => {
    render(<SensorCard {...buildProps({ isDisabled: true, isOk: false })} />)
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('shows error text for failed sensor', () => {
    render(<SensorCard {...buildProps({
      isOk: false,
      isFailed: true,
      fetchError: 'Connection timeout',
    })} />)
    expect(screen.getByText('Connection timeout')).toBeInTheDocument()
  })

  it('shows "Needs API key" for config error', () => {
    render(<SensorCard {...buildProps({
      isOk: false,
      isFailed: true,
      isConfigError: true,
      fetchError: 'Missing GITHUB_TOKEN',
    })} />)
    expect(screen.getByText('Needs API key')).toBeInTheDocument()
  })

  it('shows Retry and Dismiss buttons for failed sensor', () => {
    const onRetry = vi.fn()
    const onDismiss = vi.fn()
    render(<SensorCard {...buildProps({
      isOk: false,
      isFailed: true,
      fetchError: 'Failed',
      onRetry,
      onDismiss,
    })} />)
    const retryBtn = screen.getByText('Retry')
    const dismissBtn = screen.getByText('Dismiss')
    expect(retryBtn).toBeInTheDocument()
    expect(dismissBtn).toBeInTheDocument()

    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledOnce()

    fireEvent.click(dismissBtn)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('shows fetching state with item count during live run', () => {
    render(<SensorCard {...buildProps({
      isRunning: true,
      liveSensor: makeSensorJob('hacker_news', { fetch: 'running', item_count: 7 }),
    })} />)
    expect(screen.getByText(/Fetching/)).toBeInTheDocument()
    expect(screen.getByText(/7/)).toBeInTheDocument()
  })

  it('shows "Summarizing" during summary phase', () => {
    render(<SensorCard {...buildProps({
      isRunning: true,
      liveSensor: makeSensorJob('hacker_news', { fetch: 'ok', summary: 'running', item_count: 10 }),
    })} />)
    expect(screen.getByText('Summarizing')).toBeInTheDocument()
  })

  it('shows chunk progress bar during summarization', () => {
    render(<SensorCard {...buildProps({
      isRunning: true,
      liveSensor: makeSensorJob('hacker_news', {
        fetch: 'ok',
        summary: 'running',
        item_count: 10,
        summary_chunks_total: 4,
        summary_chunks_done: 2,
      }),
    })} />)
    expect(screen.getByText('2/4 chunks')).toBeInTheDocument()
  })

  it('shows done state with checkmark after completion', () => {
    render(<SensorCard {...buildProps({
      isRunning: true,
      liveSensor: makeSensorJob('hacker_news', {
        fetch: 'ok',
        summary: 'ok',
        item_count: 20,
      }),
    })} />)
    expect(screen.getByText('20 items')).toBeInTheDocument()
  })

  it('shows "Waiting..." for queued sensor during run', () => {
    render(<SensorCard {...buildProps({
      isRunning: true,
      // No liveSensor means waiting
    })} />)
    expect(screen.getByText(/Waiting/)).toBeInTheDocument()
  })

  it('shows error for sensor that failed mid-run', () => {
    render(<SensorCard {...buildProps({
      isRunning: true,
      liveSensor: makeSensorJob('hacker_news', {
        fetch: 'failed',
        fetch_error: 'Rate limited',
      }),
    })} />)
    expect(screen.getByText('Rate limited')).toBeInTheDocument()
  })
})
