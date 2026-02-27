// ABOUTME: Tests for GroupIntelCard — verifies group header, summary, top items, and analysis badges.
// ABOUTME: Uses mock i18n and validates rendering with various group configurations.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement } from 'react'
import { GroupIntelCard } from '../GroupIntelCard'
import type { GroupIntelCardProps } from '../GroupIntelCard'
import type { SourceGroupTree } from '@/lib/groups/types'
import type { IntelItem, BriefingSummary } from '@/api/client'

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

function makeSummary(sensorKeys: string[]): BriefingSummary {
  return {
    generated_at: '2026-02-27T00:00:00Z',
    report_fetched_at: '2026-02-27T00:00:00Z',
    sections: sensorKeys.map(key => ({
      sensor_name: key,
      label: key,
      source_url: `https://example.com/${key}`,
      summary: `Full summary for ${key}.`,
      brief_summary: `Brief about ${key}.`,
      item_count: 5,
      items: [],
    })),
    overall: {
      executive_summary: 'Executive overview.',
      sections: [],
      sentiment: {
        overall_mood: 'neutral',
        mood_summary: 'Neutral sentiment.',
        controversies: [],
        opinion_shifts: [],
        risk_flags: [],
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GroupIntelCard', () => {
  it('renders group name and color dot', () => {
    const group = makeGroup()
    render(createElement(GroupIntelCard, {
      group,
      items: [],
      summary: null,
      onClick: () => {},
    }))

    expect(screen.getByText('Tech Research')).toBeTruthy()
  })

  it('displays sensor count pill', () => {
    const group = makeGroup({ sensors: ['arxiv', 'github', 'hacker_news'] })
    render(createElement(GroupIntelCard, {
      group,
      items: [],
      summary: null,
      onClick: () => {},
    }))

    // t('dashboard.group_sources', { n: 3 }) returns 'dashboard.group_sources' with {n} -> '3'
    expect(screen.getByText('dashboard.group_sources')).toBeTruthy()
  })

  it('shows brief summary when summary is provided', () => {
    const group = makeGroup()
    const summary = makeSummary(['arxiv', 'github'])
    render(createElement(GroupIntelCard, {
      group,
      items: [],
      summary,
      onClick: () => {},
    }))

    expect(screen.getByText(/Brief about arxiv/)).toBeTruthy()
  })

  it('shows fallback text when no summary and no items', () => {
    const group = makeGroup()
    render(createElement(GroupIntelCard, {
      group,
      items: [],
      summary: null,
      onClick: () => {},
    }))

    expect(screen.getByText('dashboard.no_summary_yet')).toBeTruthy()
  })

  it('shows item count fallback when items exist but no summary', () => {
    const group = makeGroup()
    const items = [makeItem(), makeItem()]
    render(createElement(GroupIntelCard, {
      group,
      items,
      summary: null,
      onClick: () => {},
    }))

    expect(screen.getByText('dashboard.group_items')).toBeTruthy()
  })

  it('renders up to 3 top items', () => {
    const group = makeGroup()
    const items = [
      makeItem({ title: 'Article Alpha' }),
      makeItem({ title: 'Article Beta' }),
      makeItem({ title: 'Article Gamma' }),
      makeItem({ title: 'Article Delta' }),
    ]
    render(createElement(GroupIntelCard, {
      group,
      items,
      summary: null,
      onClick: () => {},
    }))

    // Should show 3 of the 4 items (top 3 by signal score)
    const allTitles = items.map(i => i.title)
    const rendered = allTitles.filter(t => {
      try { return screen.getByText(t); } catch { return false; }
    })
    expect(rendered.length).toBe(3)
  })

  it('renders analysis badges when workflows are enabled', () => {
    const group = makeGroup({
      trend_enabled: true,
      topic_enabled: true,
      social_enabled: false,
      sentiment_enabled: true,
    })
    render(createElement(GroupIntelCard, {
      group,
      items: [],
      summary: null,
      onClick: () => {},
    }))

    expect(screen.getByText('dashboard.analysis_trend')).toBeTruthy()
    expect(screen.getByText('dashboard.analysis_topic')).toBeTruthy()
    expect(screen.getByText('dashboard.analysis_sentiment')).toBeTruthy()
    expect(screen.queryByText('dashboard.analysis_social')).toBeNull()
  })

  it('does not render analysis badges when no workflows enabled', () => {
    const group = makeGroup()
    render(createElement(GroupIntelCard, {
      group,
      items: [],
      summary: null,
      onClick: () => {},
    }))

    expect(screen.queryByText('dashboard.analysis_trend')).toBeNull()
    expect(screen.queryByText('dashboard.analysis_topic')).toBeNull()
    expect(screen.queryByText('dashboard.analysis_social')).toBeNull()
    expect(screen.queryByText('dashboard.analysis_sentiment')).toBeNull()
  })

  it('calls onClick when clicked', () => {
    const group = makeGroup()
    const onClick = vi.fn()
    const { container } = render(createElement(GroupIntelCard, {
      group,
      items: [],
      summary: null,
      onClick,
    }))

    // Click the root card div
    fireEvent.click(container.firstElementChild!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows sentiment mood badge when sentiment_enabled and items have sentiment', () => {
    const group = makeGroup({ sentiment_enabled: true })
    const items = [
      makeItem({ sentiment: { label: 'positive', score: 0.9 } }),
      makeItem({ sentiment: { label: 'positive', score: 0.8 } }),
      makeItem({ sentiment: { label: 'neutral', score: 0.5 } }),
    ]
    render(createElement(GroupIntelCard, {
      group,
      items,
      summary: null,
      onClick: () => {},
    }))

    // Should show a mood badge — the dominant sentiment is positive
    expect(screen.getByText('sentiment.positive')).toBeTruthy()
  })

  it('does not show sentiment mood when sentiment_enabled is false', () => {
    const group = makeGroup({ sentiment_enabled: false })
    const items = [
      makeItem({ sentiment: { label: 'positive', score: 0.9 } }),
    ]
    render(createElement(GroupIntelCard, {
      group,
      items,
      summary: null,
      onClick: () => {},
    }))

    expect(screen.queryByText('sentiment.positive')).toBeNull()
  })
})
