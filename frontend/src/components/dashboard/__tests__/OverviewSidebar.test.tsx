// ABOUTME: Tests for OverviewSidebar component — sentiment ring and source distribution bars.
// ABOUTME: Verifies correct rendering of sentiment data, group bars, empty states, and zero-item filtering.

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { OverviewSidebar } from '../OverviewSidebar'
import type { OverviewSidebarProps } from '../OverviewSidebar'
import type { IntelItem } from '@/api/client'
import type { SourceGroupTree } from '@/lib/groups/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides?: Partial<IntelItem>): IntelItem {
  return {
    id: 'item-' + Math.random().toString(36).slice(2, 8),
    source: 'hacker_news',
    title: 'Test Item',
    url: 'https://example.com',
    ...overrides,
  }
}

function makeGroup(overrides?: Partial<SourceGroupTree>): SourceGroupTree {
  return {
    id: 'g1',
    parent_id: null,
    name: 'Tech',
    color: '#3498db',
    icon: null,
    sort_order: 0,
    trend_enabled: false,
    topic_enabled: false,
    social_enabled: false,
    sentiment_enabled: false,
    summary_prompt: null,
    trend_prompt: null,
    topic_prompt: null,
    social_prompt: null,
    suppress_keywords: [],
    boost_keywords: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    sensors: ['hacker_news'],
    children: [],
    ...overrides,
  }
}

function renderSidebar(overrides?: Partial<OverviewSidebarProps>) {
  const defaults: OverviewSidebarProps = {
    items: [],
    groups: [],
    groupItemMap: {},
    ...overrides,
  }
  return render(<OverviewSidebar {...defaults} />)
}

// ---------------------------------------------------------------------------
// Sentiment Ring tests
// ---------------------------------------------------------------------------

describe('OverviewSidebar — Sentiment', () => {
  it('renders sentiment ring with item data', () => {
    const items = [
      makeItem({ sentiment: { label: 'positive', score: 0.9 } }),
      makeItem({ sentiment: { label: 'negative', score: 0.7 } }),
      makeItem({ sentiment: { label: 'neutral', score: 0.5 } }),
    ]
    renderSidebar({ items })

    const ring = screen.getByTestId('sentiment-ring')
    expect(ring).toBeTruthy()
    expect(ring.tagName.toLowerCase()).toBe('svg')

    // Should have circle arcs for each non-zero segment
    const circles = ring.querySelectorAll('circle')
    expect(circles.length).toBe(3)
  })

  it('shows dominant percentage in the center of the ring', () => {
    const items = [
      makeItem({ sentiment: { label: 'positive', score: 0.9 } }),
      makeItem({ sentiment: { label: 'positive', score: 0.8 } }),
      makeItem({ sentiment: { label: 'negative', score: 0.6 } }),
    ]
    renderSidebar({ items })

    // 2 out of 3 items are positive = 67%
    expect(screen.getByText('67%')).toBeTruthy()
  })

  it('shows legend rows with correct counts', () => {
    const items = [
      makeItem({ sentiment: { label: 'positive', score: 0.9 } }),
      makeItem({ sentiment: { label: 'positive', score: 0.8 } }),
      makeItem({ sentiment: { label: 'negative', score: 0.6 } }),
      makeItem({ sentiment: { label: 'neutral', score: 0.5 } }),
    ]
    renderSidebar({ items })

    expect(screen.getByText('Positive')).toBeTruthy()
    expect(screen.getByText('Negative')).toBeTruthy()
    expect(screen.getByText('Neutral')).toBeTruthy()
    // Count for positive = 2
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('shows "No sentiment data" when no items have sentiment', () => {
    const items = [makeItem(), makeItem()]
    renderSidebar({ items })

    expect(screen.getByText('No sentiment data')).toBeTruthy()
    expect(screen.queryByTestId('sentiment-ring')).toBeNull()
  })

  it('handles empty items array gracefully for sentiment', () => {
    renderSidebar({ items: [] })

    expect(screen.getByText('No sentiment data')).toBeTruthy()
    expect(screen.queryByTestId('sentiment-ring')).toBeNull()
  })

  it('skips items without sentiment in the count', () => {
    const items = [
      makeItem({ sentiment: { label: 'positive', score: 0.9 } }),
      makeItem(), // no sentiment — should be excluded from ring
    ]
    renderSidebar({ items })

    // Only 1 item has sentiment: 100% positive
    expect(screen.getByText('100%')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Sources by Group tests
// ---------------------------------------------------------------------------

describe('OverviewSidebar — Sources by Group', () => {
  it('renders source bars for each non-empty group', () => {
    const g1 = makeGroup({ id: 'g1', name: 'Tech', sort_order: 0, color: '#3498db' })
    const g2 = makeGroup({ id: 'g2', name: 'Finance', sort_order: 1, color: '#e67e22' })
    const items1 = [makeItem(), makeItem()]
    const items2 = [makeItem()]

    renderSidebar({
      items: [...items1, ...items2],
      groups: [g1, g2],
      groupItemMap: { g1: items1, g2: items2 },
    })

    expect(screen.getByText('Tech')).toBeTruthy()
    expect(screen.getByText('Finance')).toBeTruthy()
    // Counts should be visible
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('skips groups with zero items', () => {
    const g1 = makeGroup({ id: 'g1', name: 'Tech', sort_order: 0 })
    const g2 = makeGroup({ id: 'g2', name: 'Empty Group', sort_order: 1 })
    const items1 = [makeItem()]

    renderSidebar({
      items: items1,
      groups: [g1, g2],
      groupItemMap: { g1: items1, g2: [] },
    })

    expect(screen.getByText('Tech')).toBeTruthy()
    expect(screen.queryByText('Empty Group')).toBeNull()
  })

  it('skips groups not present in groupItemMap', () => {
    const g1 = makeGroup({ id: 'g1', name: 'Tech', sort_order: 0 })
    const g2 = makeGroup({ id: 'g2', name: 'Missing', sort_order: 1 })
    const items1 = [makeItem()]

    renderSidebar({
      items: items1,
      groups: [g1, g2],
      groupItemMap: { g1: items1 },
    })

    expect(screen.getByText('Tech')).toBeTruthy()
    expect(screen.queryByText('Missing')).toBeNull()
  })

  it('sorts bars by group sort_order', () => {
    const g1 = makeGroup({ id: 'g1', name: 'Zulu', sort_order: 2 })
    const g2 = makeGroup({ id: 'g2', name: 'Alpha', sort_order: 0 })
    const g3 = makeGroup({ id: 'g3', name: 'Mike', sort_order: 1 })

    const { container } = renderSidebar({
      items: [makeItem(), makeItem(), makeItem()],
      groups: [g1, g2, g3],
      groupItemMap: {
        g1: [makeItem()],
        g2: [makeItem()],
        g3: [makeItem()],
      },
    })

    // Collect label text in DOM order
    const labels = container.querySelectorAll('[data-testid="sources-section"] span')
    const labelTexts: string[] = []
    labels.forEach(el => {
      const t = el.textContent?.trim()
      if (t && ['Alpha', 'Mike', 'Zulu'].includes(t)) {
        labelTexts.push(t)
      }
    })

    expect(labelTexts).toEqual(['Alpha', 'Mike', 'Zulu'])
  })

  it('shows "No source data" when all groups are empty', () => {
    const g1 = makeGroup({ id: 'g1', name: 'Tech' })

    renderSidebar({
      items: [],
      groups: [g1],
      groupItemMap: { g1: [] },
    })

    expect(screen.getByText('No source data')).toBeTruthy()
  })

  it('handles empty items array gracefully for sources', () => {
    renderSidebar({ items: [], groups: [], groupItemMap: {} })

    expect(screen.getByText('No source data')).toBeTruthy()
  })

  it('scales bar widths relative to the largest group', () => {
    const g1 = makeGroup({ id: 'g1', name: 'Big', sort_order: 0, color: '#3498db' })
    const g2 = makeGroup({ id: 'g2', name: 'Small', sort_order: 1, color: '#e67e22' })
    const bigItems = [makeItem(), makeItem(), makeItem(), makeItem()]
    const smallItems = [makeItem()]

    const { container } = renderSidebar({
      items: [...bigItems, ...smallItems],
      groups: [g1, g2],
      groupItemMap: { g1: bigItems, g2: smallItems },
    })

    const bigFill = container.querySelector('[data-testid="bar-fill-g1"]') as HTMLElement
    const smallFill = container.querySelector('[data-testid="bar-fill-g2"]') as HTMLElement

    expect(bigFill).toBeTruthy()
    expect(smallFill).toBeTruthy()

    // Big group should be 100%, small should be 25%
    expect(bigFill.style.width).toBe('100%')
    expect(smallFill.style.width).toBe('25%')
  })
})
