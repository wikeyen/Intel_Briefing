// ABOUTME: Tests for VisualDataStrip conditional rendering and dynamic grid.
// ABOUTME: Verifies cards only render when underlying data exists, and grid adapts to visible count.

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { VisualDataStrip } from '../VisualDataStrip'
import type { IntelItem } from '@/api/client'

// ---------------------------------------------------------------------------
// Helpers — build IntelItem fixtures with only the fields we care about
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<IntelItem> = {}): IntelItem {
  return {
    id: overrides.id ?? `item-${Math.random().toString(36).slice(2, 8)}`,
    source: overrides.source ?? 'hacker_news',
    title: overrides.title ?? 'Test Item',
    url: overrides.url ?? 'https://example.com',
    ...overrides,
  }
}

const FULL_ITEM: IntelItem = makeItem({
  sentiment: { label: 'positive', score: 0.9 },
  published_at: new Date().toISOString(),
  velocity: { previousCount: 5, currentCount: 10, changePercent: 100, firstSeenAt: null, hoursOnTrend: null },
})

const DEFAULT_PROPS = {
  groupColor: '#3D9E85',
  sensorKeys: ['hacker_news'],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VisualDataStrip', () => {
  it('returns null when items array is empty', () => {
    const { container } = render(
      <VisualDataStrip items={[]} {...DEFAULT_PROPS} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders all 4 cards when all data is present', () => {
    render(
      <VisualDataStrip items={[FULL_ITEM]} {...DEFAULT_PROPS} />,
    )
    expect(screen.getByText('SENTIMENT')).toBeInTheDocument()
    expect(screen.getByText('SOURCES')).toBeInTheDocument()
    expect(screen.getByText('ACTIVITY')).toBeInTheDocument()
    expect(screen.getByText('VELOCITY')).toBeInTheDocument()
  })

  it('sets grid columns to match visible card count when all 4 present', () => {
    const { container } = render(
      <VisualDataStrip items={[FULL_ITEM]} {...DEFAULT_PROPS} />,
    )
    const grid = container.querySelector('.visual-data-strip') as HTMLElement
    expect(grid).toBeTruthy()
    expect(grid.style.getPropertyValue('--strip-cols')).toBe('4')
    expect(grid.dataset.cols).toBe('4')
  })

  it('omits sentiment card when no items have sentiment', () => {
    const itemNoSentiment = makeItem({
      published_at: new Date().toISOString(),
      velocity: { previousCount: 5, currentCount: 10, changePercent: 50, firstSeenAt: null, hoursOnTrend: null },
    })
    render(
      <VisualDataStrip items={[itemNoSentiment]} {...DEFAULT_PROPS} />,
    )
    expect(screen.queryByText('SENTIMENT')).not.toBeInTheDocument()
    expect(screen.getByText('SOURCES')).toBeInTheDocument()
    expect(screen.getByText('ACTIVITY')).toBeInTheDocument()
    expect(screen.getByText('VELOCITY')).toBeInTheDocument()
  })

  it('omits velocity card when no items have velocity', () => {
    const itemNoVelocity = makeItem({
      sentiment: { label: 'neutral', score: 0.5 },
      published_at: new Date().toISOString(),
    })
    render(
      <VisualDataStrip items={[itemNoVelocity]} {...DEFAULT_PROPS} />,
    )
    expect(screen.getByText('SENTIMENT')).toBeInTheDocument()
    expect(screen.getByText('SOURCES')).toBeInTheDocument()
    expect(screen.getByText('ACTIVITY')).toBeInTheDocument()
    expect(screen.queryByText('VELOCITY')).not.toBeInTheDocument()
  })

  it('omits activity card when no items have published_at', () => {
    const itemNoDate = makeItem({
      sentiment: { label: 'negative', score: 0.7 },
      velocity: { previousCount: 3, currentCount: 8, changePercent: 166, firstSeenAt: null, hoursOnTrend: null },
    })
    render(
      <VisualDataStrip items={[itemNoDate]} {...DEFAULT_PROPS} />,
    )
    expect(screen.getByText('SENTIMENT')).toBeInTheDocument()
    expect(screen.getByText('SOURCES')).toBeInTheDocument()
    expect(screen.queryByText('ACTIVITY')).not.toBeInTheDocument()
    expect(screen.getByText('VELOCITY')).toBeInTheDocument()
  })

  it('renders only sources card when items have no sentiment, velocity, or dates', () => {
    const bareItem = makeItem()
    render(
      <VisualDataStrip items={[bareItem]} {...DEFAULT_PROPS} />,
    )
    expect(screen.queryByText('SENTIMENT')).not.toBeInTheDocument()
    expect(screen.getByText('SOURCES')).toBeInTheDocument()
    expect(screen.queryByText('ACTIVITY')).not.toBeInTheDocument()
    expect(screen.queryByText('VELOCITY')).not.toBeInTheDocument()
  })

  it('sets grid columns to 1 when only sources card is visible', () => {
    const bareItem = makeItem()
    const { container } = render(
      <VisualDataStrip items={[bareItem]} {...DEFAULT_PROPS} />,
    )
    const grid = container.querySelector('.visual-data-strip') as HTMLElement
    expect(grid.style.getPropertyValue('--strip-cols')).toBe('1')
    expect(grid.dataset.cols).toBe('1')
  })

  it('sets grid columns to 3 when three cards are visible', () => {
    const itemNoVelocity = makeItem({
      sentiment: { label: 'positive', score: 0.8 },
      published_at: new Date().toISOString(),
    })
    const { container } = render(
      <VisualDataStrip items={[itemNoVelocity]} {...DEFAULT_PROPS} />,
    )
    const grid = container.querySelector('.visual-data-strip') as HTMLElement
    expect(grid.style.getPropertyValue('--strip-cols')).toBe('3')
    expect(grid.dataset.cols).toBe('3')
  })

  it('treats null sentiment as absent', () => {
    const item = makeItem({ sentiment: null, published_at: new Date().toISOString() })
    render(
      <VisualDataStrip items={[item]} {...DEFAULT_PROPS} />,
    )
    expect(screen.queryByText('SENTIMENT')).not.toBeInTheDocument()
  })

  it('treats null velocity as absent', () => {
    const item = makeItem({ velocity: null, published_at: new Date().toISOString() })
    render(
      <VisualDataStrip items={[item]} {...DEFAULT_PROPS} />,
    )
    expect(screen.queryByText('VELOCITY')).not.toBeInTheDocument()
  })

  it('treats null published_at as absent for activity', () => {
    const item = makeItem({ published_at: null, sentiment: { label: 'positive', score: 0.9 } })
    render(
      <VisualDataStrip items={[item]} {...DEFAULT_PROPS} />,
    )
    expect(screen.queryByText('ACTIVITY')).not.toBeInTheDocument()
    expect(screen.getByText('SENTIMENT')).toBeInTheDocument()
  })

  it('shows card if at least one item in array has the data', () => {
    const itemWithSentiment = makeItem({ sentiment: { label: 'positive', score: 0.9 } })
    const itemWithoutSentiment = makeItem()
    render(
      <VisualDataStrip items={[itemWithSentiment, itemWithoutSentiment]} {...DEFAULT_PROPS} />,
    )
    expect(screen.getByText('SENTIMENT')).toBeInTheDocument()
  })

  it('renders correct number of child cards in the grid', () => {
    const itemSentimentAndDate = makeItem({
      sentiment: { label: 'neutral', score: 0.5 },
      published_at: new Date().toISOString(),
    })
    const { container } = render(
      <VisualDataStrip items={[itemSentimentAndDate]} {...DEFAULT_PROPS} />,
    )
    const grid = container.querySelector('.visual-data-strip') as HTMLElement
    // Sources is always shown when items exist, plus sentiment and activity = 3 cards
    expect(grid.children.length).toBe(3)
  })
})
