// ABOUTME: Tests for OverviewTab two-column layout orchestrator.
// ABOUTME: Verifies grid layout rendering, removal of old components, and composition of ExecutiveSummaryCard + OverviewSidebar.

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { OverviewTab } from '../OverviewTab'
import type { BriefingSummary, IntelItem } from '@/api/client'
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
    id: 'item-' + Math.random().toString(36).slice(2, 8),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OverviewTab — two-column layout', () => {
  it('renders the overview-layout grid container', () => {
    const groups = [makeGroup()]
    const groupItemMap = { g1: [makeItem()] }

    const { container } = render(
      <OverviewTab
        summary={makeSummary()}
        groups={groups}
        groupItemMap={groupItemMap}
      />,
    )

    const layout = container.querySelector('.overview-layout')
    expect(layout).toBeInTheDocument()
  })

  it('renders overview-main and overview-sidebar columns', () => {
    const groups = [makeGroup()]
    const groupItemMap = { g1: [makeItem()] }

    const { container } = render(
      <OverviewTab
        summary={makeSummary()}
        groups={groups}
        groupItemMap={groupItemMap}
      />,
    )

    expect(container.querySelector('.overview-main')).toBeInTheDocument()
    expect(container.querySelector('.overview-sidebar')).toBeInTheDocument()
  })

  it('does NOT render VisualDataStrip', () => {
    const groups = [makeGroup()]
    const groupItemMap = { g1: [makeItem(), makeItem()] }

    const { container } = render(
      <OverviewTab
        summary={makeSummary()}
        groups={groups}
        groupItemMap={groupItemMap}
      />,
    )

    // VisualDataStrip renders a div with class "visual-data-strip"
    const strip = container.querySelector('.visual-data-strip')
    expect(strip).not.toBeInTheDocument()
  })

  it('does NOT render GroupSnapshotCard or "Sections" header', () => {
    const groups = [
      makeGroup({ id: 'g1', name: 'Tech News', sort_order: 0 }),
      makeGroup({ id: 'g2', name: 'Finance', sort_order: 1, sensors: ['rss_news'], color: '#cc4444' }),
    ]
    const groupItemMap = {
      g1: [makeItem({ id: 'i1' })],
      g2: [makeItem({ id: 'i2', source: 'rss_news' })],
    }

    const { container } = render(
      <OverviewTab
        summary={makeSummary()}
        groups={groups}
        groupItemMap={groupItemMap}
      />,
    )

    // GroupSnapshotCard renders within a "group-snapshot-row" container
    const snapshotRow = container.querySelector('.group-snapshot-row')
    expect(snapshotRow).not.toBeInTheDocument()

    // The old "Sections" header label should be gone
    expect(screen.queryByText('Sections')).not.toBeInTheDocument()
  })

  it('renders ExecutiveSummaryCard with summary content', () => {
    const groups = [makeGroup()]
    const groupItemMap = { g1: [makeItem()] }

    render(
      <OverviewTab
        summary={makeSummary()}
        groups={groups}
        groupItemMap={groupItemMap}
      />,
    )

    expect(screen.getByText('Executive Summary')).toBeInTheDocument()
    expect(screen.getByText(/Markets are looking steady/)).toBeInTheDocument()
  })

  it('renders OverviewSidebar with sentiment and sources sections', () => {
    const groups = [makeGroup()]
    const groupItemMap = { g1: [makeItem({ sentiment: { label: 'positive', score: 0.9 } })] }

    render(
      <OverviewTab
        summary={makeSummary()}
        groups={groups}
        groupItemMap={groupItemMap}
      />,
    )

    // Sidebar renders sentiment and sources section headers
    expect(screen.getByTestId('sentiment-section')).toBeInTheDocument()
    expect(screen.getByTestId('sources-section')).toBeInTheDocument()
  })

  it('does not pass groups to ExecutiveSummaryCard (no per-group breakdowns)', () => {
    const groups = [
      makeGroup({ id: 'g1', name: 'Tech News', sort_order: 0, sensors: ['hn'] }),
    ]
    const summary = makeSummary({
      sections: [
        {
          sensor_name: 'hn',
          label: 'Hacker News',
          source_url: 'https://news.ycombinator.com',
          summary: 'HN shows strong activity.',
          item_count: 3,
          items: [],
        },
      ],
    })
    const groupItemMap = { g1: [makeItem()] }

    const { container } = render(
      <OverviewTab
        summary={summary}
        groups={groups}
        groupItemMap={groupItemMap}
      />,
    )

    // Per-group breakdown dots should not exist
    const dots = container.querySelectorAll('[data-testid^="group-dot-"]')
    expect(dots).toHaveLength(0)
  })

  it('handles null summary gracefully without crashing', () => {
    const groups = [makeGroup()]
    const groupItemMap = { g1: [makeItem()] }

    const { container } = render(
      <OverviewTab
        summary={null}
        groups={groups}
        groupItemMap={groupItemMap}
      />,
    )

    // Layout should still render even without a summary
    expect(container.querySelector('.overview-layout')).toBeInTheDocument()
    expect(container.querySelector('.overview-sidebar')).toBeInTheDocument()
    // ExecutiveSummaryCard returns null when summary is null, so no exec summary text
    expect(screen.queryByText('Executive Summary')).not.toBeInTheDocument()
  })
})
