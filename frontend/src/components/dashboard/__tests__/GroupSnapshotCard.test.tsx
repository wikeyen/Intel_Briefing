// ABOUTME: Tests for GroupSnapshotCard mini overview card.
// ABOUTME: Verifies group info display, sentiment donut, tags, narrative, and click behavior.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement } from 'react'
import { GroupSnapshotCard } from '../GroupSnapshotCard'
import type { GroupSnapshotCardProps } from '../GroupSnapshotCard'
import type { SourceGroupTree } from '@/lib/groups/types'
import type { IntelItem, IntelTag } from '@/api/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGroup(overrides?: Partial<SourceGroupTree>): SourceGroupTree {
  return {
    id: 'g1',
    parent_id: null,
    name: 'Tech Research',
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
    sensors: ['arxiv', 'github'],
    children: [],
    ...overrides,
  }
}

function makeItem(overrides?: Partial<IntelItem>): IntelItem {
  return {
    id: 'item-' + Math.random().toString(36).slice(2, 8),
    source: 'arxiv',
    title: 'Test Article',
    url: 'https://example.com/test',
    ...overrides,
  }
}

function makeTags(texts: string[]): IntelTag[] {
  return texts.map((text, i) => ({ text, weight: 1 - i * 0.1 }))
}

function renderCard(overrides?: Partial<GroupSnapshotCardProps>) {
  const defaults: GroupSnapshotCardProps = {
    group: makeGroup(),
    items: [makeItem()],
    narrative: 'AI research is accelerating across multiple fronts.',
    tags: makeTags(['AI', 'LLM', 'Robotics']),
    onClick: () => {},
    ...overrides,
  }
  return render(createElement(GroupSnapshotCard, defaults))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GroupSnapshotCard', () => {
  it('renders group name and item count badge', () => {
    const items = [makeItem(), makeItem(), makeItem()]
    renderCard({ items })

    expect(screen.getByText('Tech Research')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('shows tag pills when tags are provided', () => {
    renderCard({ tags: makeTags(['AI', 'LLM', 'Robotics']) })

    expect(screen.getByText('AI')).toBeTruthy()
    expect(screen.getByText('LLM')).toBeTruthy()
    expect(screen.getByText('Robotics')).toBeTruthy()
  })

  it('truncates long narrative with CSS ellipsis', () => {
    const longNarrative = 'A'.repeat(500)
    const { container } = renderCard({ narrative: longNarrative })

    const narrativeEl = container.querySelector('p')
    expect(narrativeEl).toBeTruthy()
    expect(narrativeEl!.style.textOverflow).toBe('ellipsis')
    expect(narrativeEl!.style.overflow).toBe('hidden')
    expect(narrativeEl!.style.whiteSpace).toBe('nowrap')
  })

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn()
    const { container } = renderCard({ onClick })

    fireEvent.click(container.firstElementChild!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('returns null when items array is empty', () => {
    const { container } = renderCard({ items: [] })

    expect(container.innerHTML).toBe('')
  })

  it('shows sentiment donut SVG when items have sentiment data', () => {
    const items = [
      makeItem({ sentiment: { label: 'positive', score: 0.9 } }),
      makeItem({ sentiment: { label: 'negative', score: 0.7 } }),
      makeItem({ sentiment: { label: 'neutral', score: 0.5 } }),
    ]
    renderCard({ items })

    const donut = screen.getByTestId('sentiment-donut')
    expect(donut).toBeTruthy()
    expect(donut.tagName.toLowerCase()).toBe('svg')

    // Should have colored arcs — at least one circle element for each non-zero segment
    const circles = donut.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThanOrEqual(3)
  })

  it('shows a gray ring when no items have sentiment', () => {
    const items = [makeItem(), makeItem()]
    const { container } = renderCard({ items })

    // Should have an SVG with a single neutral circle (no data-testid since it's the fallback)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBe(1)
    const circles = svgs[0].querySelectorAll('circle')
    expect(circles.length).toBe(1)
  })

  it('shows at most 3 tag pills even if more provided', () => {
    renderCard({ tags: makeTags(['AI', 'LLM', 'Robotics', 'Vision', 'NLP']) })

    expect(screen.getByText('AI')).toBeTruthy()
    expect(screen.getByText('LLM')).toBeTruthy()
    expect(screen.getByText('Robotics')).toBeTruthy()
    expect(screen.queryByText('Vision')).toBeNull()
    expect(screen.queryByText('NLP')).toBeNull()
  })

  it('does not render narrative paragraph when narrative is empty', () => {
    const { container } = renderCard({ narrative: '' })

    expect(container.querySelector('p')).toBeNull()
  })
})
