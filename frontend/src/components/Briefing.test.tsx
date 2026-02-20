// ABOUTME: Tests for the Briefing component — the dedicated AI summary page.
// ABOUTME: Covers loading state, summary display, empty state, and section rendering.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the API client
vi.mock('@/api/client', () => ({
  api: {
    getSummary: vi.fn(),
    getSummaryStatus: vi.fn(),
  },
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { api } from '@/api/client'
import { Briefing } from './Briefing'

const mockGetSummary = api.getSummary as ReturnType<typeof vi.fn>
const mockGetSummaryStatus = api.getSummaryStatus as ReturnType<typeof vi.fn>

describe('Briefing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSummaryStatus.mockResolvedValue({
      running: false,
      started_at: null,
      completed_at: null,
      sensors: [],
    })
  })

  it('shows loading state initially', () => {
    mockGetSummary.mockReturnValue(new Promise(() => {})) // never resolves
    render(<Briefing />)
    expect(screen.getByText('Loading briefing…')).toBeInTheDocument()
  })

  it('shows empty state when no summary available', async () => {
    mockGetSummary.mockResolvedValue({ summary: null })
    render(<Briefing />)
    await waitFor(() => {
      expect(screen.getByText(/no briefing available/i)).toBeInTheDocument()
    })
  })

  it('renders the executive summary', async () => {
    mockGetSummary.mockResolvedValue({
      summary: {
        generated_at: '2026-02-19T08:00:00Z',
        report_fetched_at: '2026-02-19T07:55:00Z',
        overall: 'Major AI developments this week including new model releases.',
        sections: [],
      },
    })
    render(<Briefing />)
    await waitFor(() => {
      expect(screen.getByText('Major AI developments this week including new model releases.')).toBeInTheDocument()
    })
  })

  it('renders per-source section cards', async () => {
    mockGetSummary.mockResolvedValue({
      summary: {
        generated_at: '2026-02-19T08:00:00Z',
        report_fetched_at: '2026-02-19T07:55:00Z',
        overall: 'Executive overview text here.',
        sections: [
          { sensor_name: 'hacker_news', label: 'Hacker News', summary: 'HN had lots of AI discussion.', item_count: 10 },
          { sensor_name: 'arxiv', label: 'ArXiv AI', summary: 'New transformer papers published.', item_count: 5 },
        ],
      },
    })
    render(<Briefing />)
    await waitFor(() => {
      expect(screen.getByText('Hacker News')).toBeInTheDocument()
      expect(screen.getByText('HN had lots of AI discussion.')).toBeInTheDocument()
      expect(screen.getByText('ArXiv AI')).toBeInTheDocument()
      expect(screen.getByText('New transformer papers published.')).toBeInTheDocument()
      expect(screen.getByText('10 items')).toBeInTheDocument()
      expect(screen.getByText('5 items')).toBeInTheDocument()
    })
  })

  it('shows the generated timestamp', async () => {
    mockGetSummary.mockResolvedValue({
      summary: {
        generated_at: '2026-02-19T08:00:00Z',
        report_fetched_at: '2026-02-19T07:55:00Z',
        overall: 'Summary text.',
        sections: [],
      },
    })
    render(<Briefing />)
    await waitFor(() => {
      expect(screen.getByText(/2026-02-19/)).toBeInTheDocument()
    })
  })
})
