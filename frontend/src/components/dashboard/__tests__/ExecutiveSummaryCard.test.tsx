// ABOUTME: Tests for ExecutiveSummaryCard — verifies rendering of executive overview card.
// ABOUTME: Covers null/empty states, mood badge, citations, quick scan, collapsible risk flags, and per-group section breakdowns.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement } from 'react'
import { ExecutiveSummaryCard } from '../ExecutiveSummaryCard'
import type { BriefingSummary } from '@/api/client'
import type { SourceGroupTree } from '@/lib/groups/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<BriefingSummary['overall']> = {}): BriefingSummary {
  return {
    generated_at: '2026-03-01T00:00:00Z',
    report_fetched_at: '2026-03-01T00:00:00Z',
    sections: [],
    overall: {
      executive_summary: 'Markets showed mixed signals today.',
      sections: [],
      sentiment: {
        overall_mood: 'mixed',
        mood_summary: 'Mixed signals',
        controversies: [],
        opinion_shifts: [],
        risk_flags: [],
      },
      ...overrides,
    },
  }
}

function makeGroup(overrides?: Partial<SourceGroupTree>): SourceGroupTree {
  return {
    id: 'g1',
    parent_id: null,
    name: 'News',
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
    sensors: ['hacker_news', '36kr'],
    children: [],
    ...overrides,
  }
}

/** Create a full summary with sensor sections matching group sensors. */
function makeSummaryWithSections(
  overallOverrides: Partial<BriefingSummary['overall']> = {},
  sections: BriefingSummary['sections'] = [],
): BriefingSummary {
  return {
    generated_at: '2026-03-01T00:00:00Z',
    report_fetched_at: '2026-03-01T00:00:00Z',
    sections,
    overall: {
      executive_summary: 'Markets showed mixed signals today.',
      sections: [],
      sentiment: {
        overall_mood: 'mixed',
        mood_summary: 'Mixed signals',
        controversies: [],
        opinion_shifts: [],
        risk_flags: [],
      },
      ...overallOverrides,
    },
  }
}

// ---------------------------------------------------------------------------
// Existing behaviour (backwards compatibility)
// ---------------------------------------------------------------------------

describe('ExecutiveSummaryCard', () => {
  it('returns null when summary is null', () => {
    const { container } = render(createElement(ExecutiveSummaryCard, { summary: null }))
    expect(container.innerHTML).toBe('')
  })

  it('returns null when executive_summary is empty', () => {
    const summary = makeSummary({ executive_summary: '' })
    const { container } = render(createElement(ExecutiveSummaryCard, { summary }))
    expect(container.innerHTML).toBe('')
  })

  it('renders executive summary text', () => {
    const summary = makeSummary({ executive_summary: 'Test summary text.' })
    render(createElement(ExecutiveSummaryCard, { summary }))
    expect(screen.getByText('Test summary text.')).toBeTruthy()
  })

  it('renders card container with shadow styling', () => {
    const summary = makeSummary()
    const { container } = render(createElement(ExecutiveSummaryCard, { summary }))
    const card = container.firstElementChild as HTMLElement
    expect(card).toBeTruthy()
    expect(card.style.boxShadow).toBeTruthy()
  })

  it('renders mood badge with correct text', () => {
    const summary = makeSummary()
    render(createElement(ExecutiveSummaryCard, { summary }))
    expect(screen.getByText('mixed')).toBeTruthy()
  })

  it('renders EXECUTIVE SUMMARY label', () => {
    const summary = makeSummary()
    render(createElement(ExecutiveSummaryCard, { summary }))
    expect(screen.getByText('Executive Summary')).toBeTruthy()
  })

  it('renders full text without truncation', () => {
    const longText = 'A'.repeat(300)
    const summary = makeSummary({ executive_summary: longText })
    render(createElement(ExecutiveSummaryCard, { summary }))
    expect(screen.getByText(longText)).toBeTruthy()
    expect(screen.queryByText('Show more')).toBeNull()
  })

  it('renders quick scan bullets when present', () => {
    const summary = makeSummary({
      quick_scan: [
        { text: 'BTC rallied 5%', source: 'CoinDesk', refs: [] },
        { text: 'Fed holds rates', source: 'Reuters', refs: [] },
      ],
    })
    render(createElement(ExecutiveSummaryCard, { summary }))
    expect(screen.getByText('Quick Scan')).toBeTruthy()
    expect(screen.getByText('BTC rallied 5%')).toBeTruthy()
    expect(screen.getByText(/CoinDesk/)).toBeTruthy()
  })

  it('does not render quick scan when empty', () => {
    const summary = makeSummary({ quick_scan: [] })
    render(createElement(ExecutiveSummaryCard, { summary }))
    expect(screen.queryByText('Quick Scan')).toBeNull()
  })

  it('renders risk flags when present', () => {
    const summary = makeSummary({
      sentiment: {
        overall_mood: 'bearish',
        mood_summary: 'Bearish outlook',
        controversies: [],
        opinion_shifts: [],
        risk_flags: [
          { topic: 'Liquidity crunch', analysis: 'Trading volumes dropped sharply.', refs: [] },
        ],
      },
    })
    render(createElement(ExecutiveSummaryCard, { summary }))
    expect(screen.getByText('Risk Flags')).toBeTruthy()
    expect(screen.getByText('Liquidity crunch')).toBeTruthy()
    expect(screen.getByText('Trading volumes dropped sharply.')).toBeTruthy()
  })

  it('does not render risk flags when empty', () => {
    const summary = makeSummary()
    render(createElement(ExecutiveSummaryCard, { summary }))
    expect(screen.queryByText('Risk Flags')).toBeNull()
  })

  it('renders card without left border', () => {
    const summary = makeSummary()
    const { container } = render(createElement(ExecutiveSummaryCard, { summary }))
    const card = container.firstElementChild as HTMLElement
    expect(card.style.borderLeft).toBeFalsy()
  })

  it('renders bullish mood badge', () => {
    const summary = makeSummary({
      sentiment: {
        overall_mood: 'bullish',
        mood_summary: 'Bullish outlook',
        controversies: [],
        opinion_shifts: [],
        risk_flags: [],
      },
    })
    render(createElement(ExecutiveSummaryCard, { summary }))
    const badge = screen.getByText('bullish')
    expect(badge).toBeTruthy()
  })

  it('renders citation links when sources are provided', () => {
    const summary = makeSummary({
      executive_summary: 'Markets rallied [1] after the Fed announcement [2].',
      sources: [
        { id: 1, title: 'Bloomberg Report', url: 'https://bloomberg.com/1' },
        { id: 2, title: 'Reuters Update', url: 'https://reuters.com/2' },
      ],
    })
    const { container } = render(createElement(ExecutiveSummaryCard, { summary }))
    const supElements = container.querySelectorAll('sup')
    expect(supElements.length).toBe(2)
    const links = container.querySelectorAll('sup a')
    expect(links.length).toBe(2)
    expect((links[0] as HTMLAnchorElement).href).toBe('https://bloomberg.com/1')
    expect((links[1] as HTMLAnchorElement).href).toBe('https://reuters.com/2')
  })

  it('renders summary text without citation markup when no sources', () => {
    const summary = makeSummary({
      executive_summary: 'Plain text without citations.',
    })
    const { container } = render(createElement(ExecutiveSummaryCard, { summary }))
    const supElements = container.querySelectorAll('sup')
    expect(supElements.length).toBe(0)
    expect(screen.getByText('Plain text without citations.')).toBeTruthy()
  })

  it('collapses risk flags when toggle is clicked', () => {
    const summary = makeSummary({
      sentiment: {
        overall_mood: 'bearish',
        mood_summary: 'Bearish outlook',
        controversies: [],
        opinion_shifts: [],
        risk_flags: [
          { topic: 'Liquidity crunch', analysis: 'Trading volumes dropped sharply.', refs: [] },
        ],
      },
    })
    const { container } = render(createElement(ExecutiveSummaryCard, { summary }))

    // Risk flags are visible by default (expanded)
    const toggle = screen.getByRole('button', { name: /risk flags/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    // The content wrapper should have maxHeight > 0 when expanded
    const contentWrapper = container.querySelector('[style*="overflow: hidden"]') as HTMLElement
    expect(contentWrapper).toBeTruthy()
    expect(contentWrapper.style.maxHeight).toBe('2000px')

    // Click to collapse
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(contentWrapper.style.maxHeight).toBe('0')

    // Click again to expand
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(contentWrapper.style.maxHeight).toBe('2000px')
  })

  it('supports keyboard toggle for risk flags', () => {
    const summary = makeSummary({
      sentiment: {
        overall_mood: 'bearish',
        mood_summary: 'Bearish outlook',
        controversies: [],
        opinion_shifts: [],
        risk_flags: [
          { topic: 'Systemic risk', analysis: 'Contagion spreading.', refs: [] },
        ],
      },
    })
    render(createElement(ExecutiveSummaryCard, { summary }))

    const toggle = screen.getByRole('button', { name: /risk flags/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    // Press Enter to collapse
    fireEvent.keyDown(toggle, { key: 'Enter' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    // Press Space to expand
    fireEvent.keyDown(toggle, { key: ' ' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('defaults risk flags to collapsed on mobile viewport', () => {
    const original = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 390, writable: true })
    try {
      const summary = makeSummary({
        sentiment: {
          overall_mood: 'bearish',
          mood_summary: 'Bearish outlook',
          controversies: [],
          opinion_shifts: [],
          risk_flags: [
            { topic: 'Risk', analysis: 'Analysis.', refs: [] },
          ],
        },
      })
      render(createElement(ExecutiveSummaryCard, { summary }))
      const toggle = screen.getByRole('button', { name: /risk flags/i })
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: original, writable: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Per-group section breakdowns
// ---------------------------------------------------------------------------

describe('ExecutiveSummaryCard — per-group breakdowns', () => {
  it('renders per-group section headers when groups and sensor summaries exist', () => {
    const groups = [
      makeGroup({ id: 'news', name: 'News', color: '#e74c3c', sort_order: 0, sensors: ['hacker_news'] }),
      makeGroup({ id: 'research', name: 'Research', color: '#3498db', sort_order: 1, sensors: ['arxiv'] }),
    ]
    const summary = makeSummaryWithSections({}, [
      {
        sensor_name: 'hacker_news',
        label: 'Hacker News',
        source_url: 'https://news.ycombinator.com',
        summary: 'HN full summary.',
        brief_summary: 'HN brief.',
        item_count: 3,
        items: [],
      },
      {
        sensor_name: 'arxiv',
        label: 'ArXiv',
        source_url: 'https://arxiv.org',
        summary: 'ArXiv full summary.',
        item_count: 2,
        items: [],
      },
    ])

    render(createElement(ExecutiveSummaryCard, { summary, groups }))

    // Both group headers should render
    expect(screen.getByText('News')).toBeTruthy()
    expect(screen.getByText('Research')).toBeTruthy()
  })

  it('shows sensor summary text under correct group heading', () => {
    const groups = [
      makeGroup({ id: 'news', name: 'News', color: '#e74c3c', sort_order: 0, sensors: ['hacker_news', '36kr'] }),
    ]
    const summary = makeSummaryWithSections({}, [
      {
        sensor_name: 'hacker_news',
        label: 'Hacker News',
        source_url: 'https://news.ycombinator.com',
        summary: 'Full HN summary for today.',
        brief_summary: 'Brief HN summary.',
        item_count: 5,
        items: [],
      },
      {
        sensor_name: '36kr',
        label: '36Kr',
        source_url: 'https://36kr.com',
        summary: 'Full 36Kr summary.',
        item_count: 3,
        items: [],
      },
    ])

    render(createElement(ExecutiveSummaryCard, { summary, groups }))

    // brief_summary takes precedence over summary
    expect(screen.getByText('Brief HN summary.')).toBeTruthy()
    // Falls back to full summary when brief_summary is absent
    expect(screen.getByText('Full 36Kr summary.')).toBeTruthy()
  })

  it('renders item citation links with correct URLs', () => {
    const groups = [
      makeGroup({ id: 'news', name: 'News', sort_order: 0, sensors: ['hacker_news'] }),
    ]
    const summary = makeSummaryWithSections({}, [
      {
        sensor_name: 'hacker_news',
        label: 'Hacker News',
        source_url: 'https://news.ycombinator.com',
        summary: 'HN summary.',
        item_count: 3,
        items: [
          { title: 'GPT-5 Released', url: 'https://example.com/gpt5', brief: 'OpenAI released GPT-5.' },
          { title: 'Rust 2.0', url: 'https://example.com/rust2', brief: 'Rust hits 2.0.' },
          { title: 'AI Regulation', url: 'https://example.com/ai-reg', brief: 'New AI laws proposed.' },
        ],
      },
    ])

    const { container } = render(createElement(ExecutiveSummaryCard, { summary, groups }))

    // Check item links exist with correct href and target
    const link1 = screen.getByText('GPT-5 Released') as HTMLAnchorElement
    expect(link1.tagName).toBe('A')
    expect(link1.href).toBe('https://example.com/gpt5')
    expect(link1.target).toBe('_blank')

    const link2 = screen.getByText('Rust 2.0') as HTMLAnchorElement
    expect(link2.href).toBe('https://example.com/rust2')

    const link3 = screen.getByText('AI Regulation') as HTMLAnchorElement
    expect(link3.href).toBe('https://example.com/ai-reg')

    // Check "Sources:" label appears
    expect(screen.getByText(/Sources:/)).toBeTruthy()

    // Check middle-dot separators exist between items
    const dots = container.querySelectorAll('span')
    const dotTexts = Array.from(dots).filter(el => el.textContent === '\u00B7')
    expect(dotTexts.length).toBe(2) // 3 items = 2 separators
  })

  it('still renders global executive summary with CitationText alongside group breakdowns', () => {
    const groups = [
      makeGroup({ id: 'news', name: 'News', sort_order: 0, sensors: ['hacker_news'] }),
    ]
    const summary = makeSummaryWithSections(
      {
        executive_summary: 'Global overview [1] text.',
        sources: [{ id: 1, title: 'Source One', url: 'https://example.com/1' }],
      },
      [
        {
          sensor_name: 'hacker_news',
          label: 'HN',
          source_url: 'https://hn.com',
          summary: 'HN sensor summary.',
          item_count: 1,
          items: [],
        },
      ],
    )

    const { container } = render(createElement(ExecutiveSummaryCard, { summary, groups }))

    // Global citation should resolve
    const supLinks = container.querySelectorAll('sup a')
    expect(supLinks.length).toBe(1)
    expect((supLinks[0] as HTMLAnchorElement).href).toBe('https://example.com/1')

    // Sensor summary also renders
    expect(screen.getByText('HN sensor summary.')).toBeTruthy()
  })

  it('skips groups with no matching sensor summaries', () => {
    const groups = [
      makeGroup({ id: 'news', name: 'News', sort_order: 0, sensors: ['hacker_news'] }),
      makeGroup({ id: 'empty', name: 'Empty Group', sort_order: 1, sensors: ['nonexistent_sensor'] }),
    ]
    const summary = makeSummaryWithSections({}, [
      {
        sensor_name: 'hacker_news',
        label: 'Hacker News',
        source_url: 'https://news.ycombinator.com',
        summary: 'HN summary.',
        item_count: 1,
        items: [],
      },
    ])

    render(createElement(ExecutiveSummaryCard, { summary, groups }))

    // News group should render, Empty Group should not
    expect(screen.getByText('News')).toBeTruthy()
    expect(screen.queryByText('Empty Group')).toBeNull()
  })

  it('renders groups sorted by sort_order regardless of input order', () => {
    const groups = [
      makeGroup({ id: 'research', name: 'Research', color: '#3498db', sort_order: 2, sensors: ['arxiv'] }),
      makeGroup({ id: 'news', name: 'News', color: '#e74c3c', sort_order: 0, sensors: ['hacker_news'] }),
      makeGroup({ id: 'social', name: 'Social', color: '#2ecc71', sort_order: 1, sensors: ['x_posts'] }),
    ]
    const summary = makeSummaryWithSections({}, [
      { sensor_name: 'hacker_news', label: 'HN', source_url: '', summary: 'HN.', item_count: 1, items: [] },
      { sensor_name: 'x_posts', label: 'X', source_url: '', summary: 'X posts.', item_count: 1, items: [] },
      { sensor_name: 'arxiv', label: 'ArXiv', source_url: '', summary: 'ArXiv.', item_count: 1, items: [] },
    ])

    const { container } = render(createElement(ExecutiveSummaryCard, { summary, groups }))

    // Collect group header texts in DOM order
    const headers = Array.from(container.querySelectorAll('[data-testid^="group-dot-"]'))
      .map(dot => dot.parentElement?.textContent?.trim())

    expect(headers).toEqual(['News', 'Social', 'Research'])
  })

  it('renders colored dot with correct background for each group', () => {
    const groups = [
      makeGroup({ id: 'news', name: 'News', color: '#e74c3c', sort_order: 0, sensors: ['hacker_news'] }),
    ]
    const summary = makeSummaryWithSections({}, [
      { sensor_name: 'hacker_news', label: 'HN', source_url: '', summary: 'HN.', item_count: 1, items: [] },
    ])

    const { container } = render(createElement(ExecutiveSummaryCard, { summary, groups }))

    const dot = container.querySelector('[data-testid="group-dot-news"]') as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.style.background).toBe('rgb(231, 76, 60)')
  })

  it('does not render group breakdowns when groups prop is omitted', () => {
    const summary = makeSummaryWithSections({}, [
      { sensor_name: 'hacker_news', label: 'HN', source_url: '', summary: 'HN.', item_count: 1, items: [] },
    ])

    render(createElement(ExecutiveSummaryCard, { summary }))

    // Executive summary renders but no group headers
    expect(screen.getByText('Executive Summary')).toBeTruthy()
    // No group-specific content (sensor summary text from sections should not appear)
    expect(screen.queryByText('HN.')).toBeNull()
  })

  it('does not render group breakdowns when groups array is empty', () => {
    const summary = makeSummaryWithSections({}, [
      { sensor_name: 'hacker_news', label: 'HN', source_url: '', summary: 'HN.', item_count: 1, items: [] },
    ])

    render(createElement(ExecutiveSummaryCard, { summary, groups: [] }))

    expect(screen.getByText('Executive Summary')).toBeTruthy()
    expect(screen.queryByText('HN.')).toBeNull()
  })
})
