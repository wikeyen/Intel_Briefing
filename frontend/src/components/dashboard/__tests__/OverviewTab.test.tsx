// ABOUTME: Tests for OverviewTab orchestrator component.
// ABOUTME: Verifies aggregate analytics, executive summary, and group snapshot rendering.

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { OverviewTab } from '../OverviewTab'
import type { BriefingSummary, IntelligenceReport, IntelItem } from '@/api/client'
import type { SourceGroupTree } from '@/lib/groups/types'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeGroup(overrides: Partial<SourceGroupTree> = {}): SourceGroupTree {
  return {
    id: 'g1',
    parent_id: null,
    name: 'Tech News',
    color: '#4488cc',
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
    sensors: ['hn', 'lobste_rs'],
    children: [],
    ...overrides,
  }
}

function makeItem(overrides: Partial<IntelItem> = {}): IntelItem {
  return {
    id: 'item-1',
    source: 'hn',
    title: 'Test Item',
    url: 'https://example.com',
    published_at: new Date().toISOString(),
    sentiment: { label: 'positive', score: 0.9 },
    velocity: { previousCount: 10, currentCount: 20, changePercent: 100, firstSeenAt: null, hoursOnTrend: null },
    ...overrides,
  }
}

function makeSummary(overrides: Partial<BriefingSummary> = {}): BriefingSummary {
  return {
    generated_at: '2026-01-01T12:00:00Z',
    report_fetched_at: '2026-01-01T12:00:00Z',
    sections: [
      {
        sensor_name: 'hn',
        label: 'Hacker News',
        source_url: 'https://news.ycombinator.com',
        summary: 'Full summary for HN sensor.',
        brief_summary: 'Brief summary for HN sensor.',
        item_count: 5,
        items: [],
      },
    ],
    overall: {
      executive_summary: 'Markets are looking steady with AI momentum continuing.',
      sections: [],
      sentiment: {
        overall_mood: 'bullish',
        mood_summary: 'Positive sentiment across tech.',
        controversies: [],
        opinion_shifts: [],
        risk_flags: [],
      },
    },
    ...overrides,
  }
}

function makeIntelligence(): IntelligenceReport {
  return {
    trend: {
      topics: [],
      tags: [
        { text: 'AI', weight: 10 },
        { text: 'Rust', weight: 8 },
        { text: 'WebAssembly', weight: 6 },
        { text: 'Kubernetes', weight: 4 },
      ],
      summary: 'AI dominates.',
      generated_at: '2026-01-01T12:00:00Z',
    },
    topics: null,
    accounts: null,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OverviewTab', () => {
  it('renders VisualDataStrip when items exist across groups', () => {
    const groups = [makeGroup()]
    const items = [
      makeItem({ id: 'i1', title: 'AI breakthrough', content: 'AI is big' }),
      makeItem({ id: 'i2', source: 'lobste_rs', title: 'Rust update' }),
    ]
    const groupItemMap = { g1: items }

    const { container } = render(
      <OverviewTab
        summary={makeSummary()}
        intelligence={null}
        groups={groups}
        groupItemMap={groupItemMap}
        allSensorKeys={['hn', 'lobste_rs']}
        onSelectGroup={vi.fn()}
      />,
    )

    // VisualDataStrip renders a div with class "visual-data-strip"
    const strip = container.querySelector('.visual-data-strip')
    expect(strip).toBeInTheDocument()
  })

  it('renders ExecutiveSummaryCard when summary has executive_summary', () => {
    const groups = [makeGroup()]
    const groupItemMap = { g1: [makeItem()] }

    render(
      <OverviewTab
        summary={makeSummary()}
        intelligence={null}
        groups={groups}
        groupItemMap={groupItemMap}
        allSensorKeys={['hn']}
        onSelectGroup={vi.fn()}
      />,
    )

    expect(screen.getByText('Executive Summary')).toBeInTheDocument()
    expect(screen.getByText(/Markets are looking steady/)).toBeInTheDocument()
  })

  it('renders GroupSnapshotCards for non-empty groups with group names', () => {
    const groups = [
      makeGroup({ id: 'g1', name: 'Tech News', sort_order: 0 }),
      makeGroup({ id: 'g2', name: 'Finance', sort_order: 1, sensors: ['rss_news'], color: '#cc4444' }),
    ]
    const groupItemMap = {
      g1: [makeItem({ id: 'i1' })],
      g2: [makeItem({ id: 'i2', source: 'rss_news' })],
    }

    render(
      <OverviewTab
        summary={makeSummary()}
        intelligence={null}
        groups={groups}
        groupItemMap={groupItemMap}
        allSensorKeys={['hn', 'rss_news']}
        onSelectGroup={vi.fn()}
      />,
    )

    expect(screen.getByText('Tech News')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
  })

  it('does not render GroupSnapshotCard for groups with 0 items', () => {
    const groups = [
      makeGroup({ id: 'g1', name: 'Tech News', sort_order: 0 }),
      makeGroup({ id: 'g2', name: 'Empty Group', sort_order: 1, sensors: ['rss_news'], color: '#cc4444' }),
    ]
    const groupItemMap = {
      g1: [makeItem({ id: 'i1' })],
      g2: [],
    }

    render(
      <OverviewTab
        summary={makeSummary()}
        intelligence={null}
        groups={groups}
        groupItemMap={groupItemMap}
        allSensorKeys={['hn', 'rss_news']}
        onSelectGroup={vi.fn()}
      />,
    )

    expect(screen.getByText('Tech News')).toBeInTheDocument()
    expect(screen.queryByText('Empty Group')).not.toBeInTheDocument()
  })

  it('renders SECTIONS header when groups with items exist', () => {
    const groups = [makeGroup()]
    const groupItemMap = { g1: [makeItem()] }

    render(
      <OverviewTab
        summary={makeSummary()}
        intelligence={null}
        groups={groups}
        groupItemMap={groupItemMap}
        allSensorKeys={['hn']}
        onSelectGroup={vi.fn()}
      />,
    )

    expect(screen.getByText('Sections')).toBeInTheDocument()
  })
})
