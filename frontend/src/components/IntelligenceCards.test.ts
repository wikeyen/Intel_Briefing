// ABOUTME: Tests for IntelligenceCards component — sentiment coloring and layout structure.
// ABOUTME: Verifies TopicPulseCard/Detail, PublicFocusDetail, and VoicesDetail render correctly.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import {
  TopicPulseCard,
  TopicPulseDetail,
  PublicFocusDetail,
  VoicesDetail,
} from './IntelligenceCards'
import type {
  TopicIntelligence,
  TrendIntelligence,
  AccountsIntelligence,
} from './IntelligenceCards'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('./TagCloud', () => ({
  TagCloud: () => null,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOPIC_DATA: TopicIntelligence = {
  summary: 'Test topic summary',
  topics: [
    {
      topic: 'GPU Shortage',
      sentiment: 'negative',
      postCount: 42,
      summary: 'Supply chain problems continue',
      items: [{ title: 'Article A', url: 'https://example.com/a', brief: 'Brief A' }],
    },
    {
      topic: 'Open Source Wins',
      sentiment: 'positive',
      postCount: 17,
      summary: 'Community contributions surge',
      items: [],
    },
  ],
  tags: [],
  generated_at: '2026-02-27T00:00:00Z',
}

const TREND_DATA: TrendIntelligence = {
  summary: 'Test trend summary',
  topics: [
    {
      name: 'Quantum Leap',
      heat: 95,
      sources: ['arxiv', 'nature'],
      summary: 'Breakthrough in error correction',
      sentiment: 'positive',
      itemCount: 12,
    },
    {
      name: 'Market Crash',
      heat: 80,
      sources: ['reuters'],
      summary: 'Global downturn fears',
      sentiment: 'negative',
      itemCount: 8,
    },
  ],
  tags: [],
  generated_at: '2026-02-27T00:00:00Z',
}

const ACCOUNTS_DATA: AccountsIntelligence = {
  summary: 'Test voices summary',
  accounts: [
    {
      account: 'Jane Dev',
      handle: '@janedev',
      platform: 'bluesky',
      themes: ['rust', 'wasm', 'tooling'],
      sentiment: 'positive',
      postCount: 9,
    },
    {
      account: 'Bob Sec',
      handle: '@bobsec',
      platform: 'mastodon',
      themes: ['security'],
      sentiment: 'neutral',
      postCount: 3,
    },
  ],
  tags: [],
  generated_at: '2026-02-27T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Sentiment color map (mirrors component's SENTIMENT_DOT_COLORS)
// ---------------------------------------------------------------------------

// jsdom normalizes hex colors to rgb() — use the converted values for assertions
const COLORS: Record<string, string> = {
  positive: 'rgb(39, 174, 96)',
  negative: 'rgb(231, 76, 60)',
  mixed: 'rgb(243, 156, 18)',
  neutral: 'rgb(149, 165, 166)',
}

// ---------------------------------------------------------------------------
// TopicPulseCard
// ---------------------------------------------------------------------------

describe('TopicPulseCard', () => {
  it('renders topic names with sentiment-based colors', () => {
    const { container } = render(createElement(TopicPulseCard, { data: TOPIC_DATA }))

    const gpuSpan = screen.getByText('GPU Shortage')
    expect(gpuSpan.style.color).toBe(COLORS.negative)

    const ossSpan = screen.getByText('Open Source Wins')
    expect(ossSpan.style.color).toBe(COLORS.positive)

    // Ensure neither topic uses the default ink color
    expect(gpuSpan.style.color).not.toBe('var(--ink)')
    expect(ossSpan.style.color).not.toBe('var(--ink)')
  })

  it('shows post count next to each topic', () => {
    render(createElement(TopicPulseCard, { data: TOPIC_DATA }))
    expect(screen.getByText('42 posts')).toBeTruthy()
    expect(screen.getByText('17 posts')).toBeTruthy()
  })

  it('prevents topic name word-break with nowrap', () => {
    render(createElement(TopicPulseCard, { data: TOPIC_DATA }))
    const gpuSpan = screen.getByText('GPU Shortage')
    expect(gpuSpan.style.whiteSpace).toBe('nowrap')
    expect(gpuSpan.style.overflow).toBe('hidden')
    expect(gpuSpan.style.textOverflow).toBe('ellipsis')
  })
})

// ---------------------------------------------------------------------------
// TopicPulseDetail
// ---------------------------------------------------------------------------

describe('TopicPulseDetail', () => {
  it('renders topic headers with sentiment-based colors', () => {
    render(createElement(TopicPulseDetail, { data: TOPIC_DATA }))

    const gpuHeader = screen.getByText('GPU Shortage')
    expect(gpuHeader.style.color).toBe(COLORS.negative)

    const ossHeader = screen.getByText('Open Source Wins')
    expect(ossHeader.style.color).toBe(COLORS.positive)
  })

  it('renders curated items as links when URL is present', () => {
    render(createElement(TopicPulseDetail, { data: TOPIC_DATA }))

    const link = screen.getByText('Article A')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('https://example.com/a')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('renders summary text for each topic', () => {
    render(createElement(TopicPulseDetail, { data: TOPIC_DATA }))
    expect(screen.getByText('Supply chain problems continue')).toBeTruthy()
    expect(screen.getByText('Community contributions surge')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// PublicFocusDetail
// ---------------------------------------------------------------------------

describe('PublicFocusDetail', () => {
  it('renders top topic names with sentiment-based colors', () => {
    render(createElement(PublicFocusDetail, { data: TREND_DATA }))

    const quantumSpan = screen.getByText('Quantum Leap')
    expect(quantumSpan.style.color).toBe(COLORS.positive)

    const crashSpan = screen.getByText('Market Crash')
    expect(crashSpan.style.color).toBe(COLORS.negative)

    // Verify colors are not the default ink
    expect(quantumSpan.style.color).not.toBe('var(--ink)')
    expect(crashSpan.style.color).not.toBe('var(--ink)')
  })

  it('shows source count for each topic', () => {
    render(createElement(PublicFocusDetail, { data: TREND_DATA }))
    expect(screen.getByText('2 src')).toBeTruthy()
    expect(screen.getByText('1 src')).toBeTruthy()
  })

  it('renders the Top Topics section header', () => {
    render(createElement(PublicFocusDetail, { data: TREND_DATA }))
    expect(screen.getByText('Top Topics')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// VoicesDetail
// ---------------------------------------------------------------------------

describe('VoicesDetail', () => {
  it('renders each account in a two-row layout (handle row + tags row)', () => {
    const { container } = render(createElement(VoicesDetail, { data: ACCOUNTS_DATA }))

    // Each account renders inside a column-flex container with two child rows
    const janeHandle = screen.getByText('@janedev')
    // The handle is in row 1 (a flex row div); row 2 holds the theme tags
    const accountContainer = janeHandle.closest('div[style]')!.parentElement!
    expect(accountContainer).toBeTruthy()

    // The account container should use flexDirection: column for two-row layout
    expect(accountContainer.style.flexDirection).toBe('column')

    // Row 1 contains the handle
    expect(janeHandle).toBeTruthy()

    // Row 2 contains theme tags — verify themes are rendered
    expect(screen.getByText('rust')).toBeTruthy()
    expect(screen.getByText('wasm')).toBeTruthy()
    expect(screen.getByText('tooling')).toBeTruthy()
  })

  it('renders handle and theme tags in separate container divs', () => {
    render(createElement(VoicesDetail, { data: ACCOUNTS_DATA }))

    const handleEl = screen.getByText('@janedev')
    const themeEl = screen.getByText('rust')

    // Handle and theme tag should not share a direct parent
    const handleRow = handleEl.closest('div[style]')!
    const themeRow = themeEl.closest('div[style]')!
    expect(handleRow).not.toBe(themeRow)
  })

  it('sorts accounts by post count descending', () => {
    const { container } = render(createElement(VoicesDetail, { data: ACCOUNTS_DATA }))

    // @janedev has 9 posts, @bobsec has 3 — jane should appear first
    const handles = screen.getAllByText(/@\w+/)
    expect(handles[0].textContent).toBe('@janedev')
    expect(handles[1].textContent).toBe('@bobsec')
  })

  it('renders the Tracked Accounts section header', () => {
    render(createElement(VoicesDetail, { data: ACCOUNTS_DATA }))
    expect(screen.getByText('Tracked Accounts')).toBeTruthy()
  })
})
