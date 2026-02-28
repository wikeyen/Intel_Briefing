// ABOUTME: Tests for GroupDetailPanel — verifies summary, analysis sections, sensor breakdown, and item list.
// ABOUTME: Uses mock i18n and framer-motion, validates rendering with various analysis configurations.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement } from 'react'
import { GroupDetailPanel } from '../GroupDetailPanel'
import type { GroupDetailPanelProps } from '../GroupDetailPanel'
import type { SourceGroupTree } from '@/lib/groups/types'
import type { IntelItem, BriefingSummary, IntelligenceReport } from '@/api/client'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, params?: Record<string, string | number>) => {
      if (params) {
        return Object.entries(params).reduce(
          (s, [key, val]) => s.replace(`{${key}}`, String(val)),
          k,
        )
      }
      return k
    },
  }),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => createElement('div', props as Record<string, string>, children as React.ReactNode),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGroup(overrides?: Partial<SourceGroupTree>): SourceGroupTree {
  return {
    id: 'g1',
    parent_id: null,
    name: 'Social Pulse',
    color: '#e74c3c',
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
    sensors: ['x', 'bluesky'],
    children: [],
    ...overrides,
  }
}

function makeItem(overrides?: Partial<IntelItem>): IntelItem {
  return {
    id: 'item-' + Math.random().toString(36).slice(2, 8),
    source: 'x',
    title: 'Test Post',
    url: 'https://example.com/post',
    published_at: '2026-02-27T10:00:00Z',
    ...overrides,
  }
}

function makeSummary(sensorKeys: string[]): BriefingSummary {
  return {
    generated_at: '2026-02-27T00:00:00Z',
    report_fetched_at: '2026-02-27T00:00:00Z',
    sections: sensorKeys.map(key => ({
      sensor_name: key,
      label: key,
      source_url: `https://example.com/${key}`,
      summary: `Detailed summary for ${key}.`,
      brief_summary: `Brief about ${key}.`,
      item_count: 3,
      items: [],
    })),
    overall: {
      executive_summary: 'Executive overview.',
      sections: [],
      sentiment: {
        overall_mood: 'neutral',
        mood_summary: 'Neutral mood.',
        controversies: [],
        opinion_shifts: [],
        risk_flags: [],
      },
    },
  }
}

function makeIntelligence(overrides?: Partial<IntelligenceReport>): IntelligenceReport {
  return {
    trend: {
      summary: 'Trend intel summary.',
      topics: [
        {
          name: 'AI Regulation',
          heat: 80,
          sources: ['x', 'bluesky'],
          summary: 'Growing discussion about AI regulation.',
          sentiment: 'mixed',
          itemCount: 15,
        },
      ],
      tags: [],
      generated_at: '2026-02-27T00:00:00Z',
    },
    topics: {
      summary: 'Topic intel summary.',
      topics: [
        {
          topic: 'LLM Safety',
          sentiment: 'negative',
          postCount: 22,
          summary: 'Concerns about safety.',
          items: [],
        },
      ],
      tags: [],
      generated_at: '2026-02-27T00:00:00Z',
    },
    accounts: {
      summary: 'Account intel summary.',
      accounts: [
        {
          account: 'Jane AI',
          handle: 'janeai',
          platform: 'bluesky',
          themes: ['safety', 'alignment'],
          sentiment: 'neutral',
          postCount: 7,
        },
      ],
      tags: [],
      generated_at: '2026-02-27T00:00:00Z',
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GroupDetailPanel', () => {
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
  })

  it('applies slide-panel class for mobile CSS overrides', () => {
    const { container } = render(createElement(GroupDetailPanel, {
      group: makeGroup(),
      items: [],
      summary: null,
      intelligence: null,
      onClose,
    }))

    const panel = container.querySelector('.slide-panel')
    expect(panel).toBeTruthy()
  })

  it('renders group name and close button', () => {
    render(createElement(GroupDetailPanel, {
      group: makeGroup(),
      items: [],
      summary: null,
      intelligence: null,
      onClose,
    }))

    expect(screen.getByText('Social Pulse')).toBeTruthy()
    // Close button has × character
    const closeBtn = screen.getByText('\u00D7')
    expect(closeBtn).toBeTruthy()
  })

  it('calls onClose when close button is clicked', () => {
    render(createElement(GroupDetailPanel, {
      group: makeGroup(),
      items: [],
      summary: null,
      intelligence: null,
      onClose,
    }))

    fireEvent.click(screen.getByText('\u00D7'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape key is pressed', () => {
    render(createElement(GroupDetailPanel, {
      group: makeGroup(),
      items: [],
      summary: null,
      intelligence: null,
      onClose,
    }))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders full group summary from matching sensor sections', () => {
    const group = makeGroup()
    const summary = makeSummary(['x', 'bluesky'])
    render(createElement(GroupDetailPanel, {
      group,
      items: [],
      summary,
      intelligence: null,
      onClose,
    }))

    expect(screen.getByText(/Detailed summary for x/)).toBeTruthy()
    expect(screen.getByText(/Detailed summary for bluesky/)).toBeTruthy()
  })

  it('renders per-sensor breakdown section', () => {
    const group = makeGroup()
    const summary = makeSummary(['x', 'bluesky'])
    render(createElement(GroupDetailPanel, {
      group,
      items: [],
      summary,
      intelligence: null,
      onClose,
    }))

    // Should show the sensor breakdown heading
    expect(screen.getByText('dashboard.sensor_breakdown')).toBeTruthy()
  })

  it('renders trend intelligence when trend_enabled', () => {
    const group = makeGroup({ trend_enabled: true })
    const intel = makeIntelligence()
    render(createElement(GroupDetailPanel, {
      group,
      items: [],
      summary: null,
      intelligence: intel,
      onClose,
    }))

    expect(screen.getByText('Trend intel summary.')).toBeTruthy()
    expect(screen.getByText('AI Regulation')).toBeTruthy()
  })

  it('does not render trend section when trend_enabled is false', () => {
    const group = makeGroup({ trend_enabled: false })
    const intel = makeIntelligence()
    render(createElement(GroupDetailPanel, {
      group,
      items: [],
      summary: null,
      intelligence: intel,
      onClose,
    }))

    expect(screen.queryByText('Trend intel summary.')).toBeNull()
  })

  it('renders topic intelligence when topic_enabled', () => {
    const group = makeGroup({ topic_enabled: true })
    const intel = makeIntelligence()
    render(createElement(GroupDetailPanel, {
      group,
      items: [],
      summary: null,
      intelligence: intel,
      onClose,
    }))

    expect(screen.getByText('Topic intel summary.')).toBeTruthy()
    expect(screen.getByText('LLM Safety')).toBeTruthy()
  })

  it('renders accounts intelligence when social_enabled', () => {
    const group = makeGroup({ social_enabled: true })
    const intel = makeIntelligence()
    render(createElement(GroupDetailPanel, {
      group,
      items: [],
      summary: null,
      intelligence: intel,
      onClose,
    }))

    expect(screen.getByText('Account intel summary.')).toBeTruthy()
    expect(screen.getByText('Jane AI')).toBeTruthy()
  })

  it('renders sentiment distribution when sentiment_enabled and items have sentiment', () => {
    const group = makeGroup({ sentiment_enabled: true })
    const items = [
      makeItem({ sentiment: { label: 'positive', score: 0.9 } }),
      makeItem({ sentiment: { label: 'positive', score: 0.8 } }),
      makeItem({ sentiment: { label: 'negative', score: 0.7 } }),
      makeItem({ sentiment: { label: 'neutral', score: 0.5 } }),
    ]
    render(createElement(GroupDetailPanel, {
      group,
      items,
      summary: null,
      intelligence: null,
      onClose,
    }))

    // Should render sentiment counts
    expect(screen.getByText(/50%/)).toBeTruthy() // 2/4 = 50% positive
  })

  it('renders all items as links', () => {
    const group = makeGroup()
    const items = [
      makeItem({ title: 'Post Alpha', url: 'https://example.com/alpha' }),
      makeItem({ title: 'Post Beta', url: 'https://example.com/beta' }),
    ]
    render(createElement(GroupDetailPanel, {
      group,
      items,
      summary: null,
      intelligence: null,
      onClose,
    }))

    const linkAlpha = screen.getByText('Post Alpha')
    expect(linkAlpha.closest('a')?.getAttribute('href')).toBe('https://example.com/alpha')

    const linkBeta = screen.getByText('Post Beta')
    expect(linkBeta.closest('a')?.getAttribute('href')).toBe('https://example.com/beta')
  })

  it('shows all items section header with count', () => {
    const group = makeGroup()
    const items = [makeItem(), makeItem(), makeItem()]
    render(createElement(GroupDetailPanel, {
      group,
      items,
      summary: null,
      intelligence: null,
      onClose,
    }))

    expect(screen.getByText(/dashboard\.all_items/)).toBeTruthy()
  })

  it('shows empty state when no items and no summary', () => {
    const group = makeGroup()
    render(createElement(GroupDetailPanel, {
      group,
      items: [],
      summary: null,
      intelligence: null,
      onClose,
    }))

    expect(screen.getByText('dash.no_domain_data')).toBeTruthy()
  })

  it('renders source chip and sentiment chip for items', () => {
    const group = makeGroup()
    const items = [
      makeItem({
        title: 'Sentiment Post',
        source: 'x',
        sentiment: { label: 'positive', score: 0.9 },
      }),
    ]
    render(createElement(GroupDetailPanel, {
      group,
      items,
      summary: null,
      intelligence: null,
      onClose,
    }))

    // Source chip should show sensor label
    expect(screen.getByText('Sentiment Post')).toBeTruthy()
    expect(screen.getByText('positive')).toBeTruthy()
  })

  it('renders velocity percentage for items with velocity data', () => {
    const group = makeGroup()
    const items = [
      makeItem({
        title: 'Trending Post',
        velocity: { previousCount: 10, currentCount: 20, changePercent: 100, firstSeenAt: null, hoursOnTrend: null },
      }),
    ]
    render(createElement(GroupDetailPanel, {
      group,
      items,
      summary: null,
      intelligence: null,
      onClose,
    }))

    expect(screen.getByText('+100%')).toBeTruthy()
  })
})
