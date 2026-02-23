// ABOUTME: Tests for SensorGrid — the responsive grid layout of sensor cards.
// ABOUTME: Covers rendering all sensors, disabled/failed states, dismissed filtering, and selection.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SensorGrid } from './SensorGrid'
import type { SensorGridProps } from './SensorGrid'
import { makeReport, makeConfig, makePipelineStatus, makeSensorJob } from './test-helpers'

function buildProps(overrides: Partial<SensorGridProps> = {}): SensorGridProps {
  return {
    isRunning: false,
    liveSensors: {},
    report: null,
    config: null,
    pipelineStatus: null,
    selected: new Set(),
    onToggleSelect: vi.fn(),
    dismissed: new Set(),
    onDismiss: vi.fn(),
    ...overrides,
  }
}

describe('SensorGrid', () => {
  it('renders sensor labels (Hacker News, GitHub Trending, etc.)', () => {
    const props = buildProps({
      report: makeReport(),
      config: makeConfig(),
      pipelineStatus: makePipelineStatus(),
    })
    render(<SensorGrid {...props} />)
    expect(screen.getByText('Hacker News')).toBeInTheDocument()
    expect(screen.getByText('GitHub Trending')).toBeInTheDocument()
    expect(screen.getByText('ArXiv AI')).toBeInTheDocument()
    expect(screen.getByText('Product Hunt')).toBeInTheDocument()
    expect(screen.getByText('Bluesky')).toBeInTheDocument()
    expect(screen.getByText('RSS Feeds')).toBeInTheDocument()
  })

  it('shows item count for sensors with data', () => {
    const props = buildProps({
      report: makeReport(),
      config: makeConfig(),
      pipelineStatus: makePipelineStatus(),
    })
    render(<SensorGrid {...props} />)
    // HN has 2 items, ArXiv has 2, GitHub has 1
    // Item counts are rendered as separate <span> elements (number + "items")
    const twos = screen.getAllByText('2')
    expect(twos.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows "Disabled" for disabled sensors', () => {
    const config = makeConfig({
      sensors_enabled: {
        ...makeConfig().sensors_enabled,
        github: false,
      },
    })
    const props = buildProps({
      report: makeReport(),
      config,
      pipelineStatus: makePipelineStatus(),
    })
    render(<SensorGrid {...props} />)
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('hides dismissed sensors', () => {
    const props = buildProps({
      report: makeReport({
        sources_failed: ['github'],
        sources_ok: ['hacker_news', 'arxiv'],
      }),
      config: makeConfig(),
      pipelineStatus: makePipelineStatus({
        sensors: [makeSensorJob('github', { fetch: 'failed', fetch_error: 'Error', fetch_error_kind: 'api' })],
      }),
      dismissed: new Set(['github']),
    })
    render(<SensorGrid {...props} />)
    expect(screen.queryByText('GitHub Trending')).not.toBeInTheDocument()
  })

  it('calls onToggleSelect when a sensor card is clicked', () => {
    const onToggleSelect = vi.fn()
    const props = buildProps({
      report: makeReport(),
      config: makeConfig(),
      pipelineStatus: makePipelineStatus(),
      onToggleSelect,
    })
    render(<SensorGrid {...props} />)
    fireEvent.click(screen.getByText('Hacker News'))
    expect(onToggleSelect).toHaveBeenCalledWith('hacker_news')
  })

  it('shows error text for failed sensors', () => {
    const report = makeReport({
      sources_ok: ['hacker_news'],
      sources_failed: ['github'],
      items: {
        tech: [
          { id: '1', source: 'hacker_news', title: 'HN Post', url: 'https://hn.com/1' },
        ],
      },
    })
    const pipelineStatus = makePipelineStatus({
      sensors: [
        makeSensorJob('github', {
          fetch: 'failed',
          fetch_error: 'Connection refused',
          fetch_error_kind: 'api',
        }),
      ],
    })
    const props = buildProps({
      report,
      config: makeConfig(),
      pipelineStatus,
    })
    render(<SensorGrid {...props} />)
    expect(screen.getByText('Connection refused')).toBeInTheDocument()
  })

  it('shows live sensor state during a run', () => {
    const liveSensors = {
      hacker_news: makeSensorJob('hacker_news', { fetch: 'running', item_count: 5 }),
    }
    const props = buildProps({
      isRunning: true,
      liveSensors,
      config: makeConfig(),
    })
    render(<SensorGrid {...props} />)
    expect(screen.getByText(/Fetching/)).toBeInTheDocument()
  })
})
