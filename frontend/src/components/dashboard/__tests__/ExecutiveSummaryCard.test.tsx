// ABOUTME: Tests for ExecutiveSummaryCard — verifies rendering of executive overview card.
// ABOUTME: Covers null/empty states, mood badge, truncation, quick scan, and risk flags.
import { describe, it, expect } from 'vitest'
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

  it('renders card container with background styling', () => {
    const summary = makeSummary()
    const { container } = render(createElement(ExecutiveSummaryCard, { summary }))
    const card = container.firstElementChild as HTMLElement
    expect(card).toBeTruthy()
    expect(card.style.background).toContain('color-mix')
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

  it('truncates long text and shows expand toggle', () => {
    const longText = 'A'.repeat(300)
    const summary = makeSummary({ executive_summary: longText })
    render(createElement(ExecutiveSummaryCard, { summary }))
    expect(screen.getByText('Show more')).toBeTruthy()
    // Text should be truncated
    const displayed = screen.getByText(/^A+\u2026$/)
    expect(displayed).toBeTruthy()
  })

  it('expands text when toggle is clicked', () => {
    const longText = 'B'.repeat(300)
    const summary = makeSummary({ executive_summary: longText })
    render(createElement(ExecutiveSummaryCard, { summary }))
    fireEvent.click(screen.getByText('Show more'))
    expect(screen.getByText('Show less')).toBeTruthy()
    expect(screen.getByText(longText)).toBeTruthy()
  })

  it('does not show toggle for short text', () => {
    const summary = makeSummary({ executive_summary: 'Short text.' })
    render(createElement(ExecutiveSummaryCard, { summary }))
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
})
