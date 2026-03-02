// ABOUTME: Render tests for SectionIntelligencePanel component.
// ABOUTME: Verifies null return when empty, and visible panel when intelligence or summary exist.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { SectionIntelligencePanel } from '../SectionIntelligencePanel'
import type { SectionIntelligencePanelProps } from '../SectionIntelligencePanel'
import type { SourceGroupTree } from '@/lib/groups/types'
import type { IntelItem, BriefingSummary, IntelligenceReport } from '@/api/client'

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
    content: null,
    sentiment: null,
    velocity: null,
    ...overrides,
  } as IntelItem
}

function makeDefaultProps(overrides?: Partial<SectionIntelligencePanelProps>): SectionIntelligencePanelProps {
  return {
    group: makeGroup(),
    summary: null,
    intelligence: null,
    items: [],
    allGroupItems: {},
    allGroups: [],
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

function makeIntelligence(): IntelligenceReport {
  return {
    trend: {
      tags: [{ text: 'AI Models', weight: 10 }],
      topics: [],
      generated_at: '2026-02-27T00:00:00Z',
    },
    topics: null,
    accounts: null,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionIntelligencePanel', () => {
  it('returns null when both intelligence and summary are null', () => {
    const props = makeDefaultProps({ intelligence: null, summary: null })
    const { container } = render(createElement(SectionIntelligencePanel, props))

    expect(container.innerHTML).toBe('')
  })

  it('renders panel when intelligence has content', () => {
    const intelligence = makeIntelligence()
    const items = [makeItem({ title: 'AI Models research paper', content: 'AI Models overview' })]
    const props = makeDefaultProps({ intelligence, items })

    const { container } = render(createElement(SectionIntelligencePanel, props))

    // Panel should render — check for the INTELLIGENCE header text
    expect(container.innerHTML).not.toBe('')
    expect(screen.getByText('INTELLIGENCE')).toBeTruthy()
  })

  it('renders panel when summary has content', () => {
    const group = makeGroup({ sensors: ['arxiv', 'github'] })
    const summary = makeSummary(['arxiv', 'github'])
    const props = makeDefaultProps({ group, summary })

    const { container } = render(createElement(SectionIntelligencePanel, props))

    // Panel should render with narrative from the summary
    expect(container.innerHTML).not.toBe('')
    expect(screen.getByText('INTELLIGENCE')).toBeTruthy()
  })

  it('renders panel when both intelligence and summary exist', () => {
    const group = makeGroup({ sensors: ['arxiv'] })
    const summary = makeSummary(['arxiv'])
    const intelligence = makeIntelligence()
    const items = [makeItem({ title: 'AI Models paper', content: 'AI Models deep dive' })]
    const props = makeDefaultProps({ group, summary, intelligence, items })

    const { container } = render(createElement(SectionIntelligencePanel, props))

    expect(container.innerHTML).not.toBe('')
    expect(screen.getByText('INTELLIGENCE')).toBeTruthy()
    // Narrative from summary should appear
    expect(screen.getByText(/Brief about arxiv/)).toBeTruthy()
  })
})
