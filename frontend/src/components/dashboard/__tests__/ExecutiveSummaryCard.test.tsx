// ABOUTME: Tests for ExecutiveSummaryCard — verifies rendering of executive overview card.
// ABOUTME: Covers null/empty states, mood badge, citations, quick scan, collapsible risk flags.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement } from 'react'
import { ExecutiveSummaryCard } from '../ExecutiveSummaryCard'
import type { BriefingSummary } from '@/api/client'

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

// ---------------------------------------------------------------------------
// Tests
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
