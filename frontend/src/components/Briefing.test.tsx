// ABOUTME: Tests for the collapsible AI Summary section within the Data (Feed) component.
// ABOUTME: Covers summary rendering, empty states, executive summary, and per-source section cards.
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the API client
vi.mock('@/api/client', () => ({
  api: {
    getLatest: vi.fn(),
    getConfig: vi.fn(),
    getSummary: vi.fn(),
    getSummaryStatus: vi.fn(),
    triggerSummary: vi.fn(),
    getPipelineStatus: vi.fn(),
  },
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { api } from '@/api/client'
import { Data } from './Data'

const mockGetLatest = api.getLatest as ReturnType<typeof vi.fn>
const mockGetConfig = api.getConfig as ReturnType<typeof vi.fn>
const mockGetSummary = api.getSummary as ReturnType<typeof vi.fn>
const mockGetSummaryStatus = api.getSummaryStatus as ReturnType<typeof vi.fn>
const mockGetPipelineStatus = api.getPipelineStatus as ReturnType<typeof vi.fn>

const EMPTY_REPORT = {
  date: '2026-02-19',
  fetched_at: '2026-02-19T08:00:00Z',
  stale: false,
  sources_ok: ['hacker_news'],
  sources_failed: [],
  items: { tech_trends: [{ id: 'hn-1', source: 'hacker_news', title: 'Test', url: 'https://example.com' }] },
}

describe('AI Summary section in Data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLatest.mockResolvedValue(EMPTY_REPORT)
    mockGetConfig.mockResolvedValue({ sensors_enabled: {} })
    mockGetSummaryStatus.mockResolvedValue({
      running: false,
      started_at: null,
      completed_at: null,
      sensors: [],
    })
    mockGetPipelineStatus.mockResolvedValue({
      running: false,
      mode: 'fetch',
      concurrency: 4,
      started_at: null,
      completed_at: null,
      sensors: [],
      overall_summary: 'skipped',
      total_items: 0,
    })
  })

  it('shows the AI Summary collapsible header', async () => {
    mockGetSummary.mockResolvedValue({ summary: null })
    render(<Data />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ai summary/i })).toBeInTheDocument()
    })
  })

  it('shows empty state when no provider configured and section is expanded', async () => {
    mockGetSummary.mockResolvedValue({ summary: null })
    mockGetConfig.mockResolvedValue({ sensors_enabled: {}, summary_provider: null })
    render(<Data />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ai summary/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /ai summary/i }))
    await waitFor(() => {
      expect(screen.getByText(/ai summary settings/i)).toBeInTheDocument()
    })
  })

  it('renders the executive summary when summary exists (auto-expanded)', async () => {
    mockGetSummary.mockResolvedValue({
      summary: {
        generated_at: '2026-02-19T08:00:00Z',
        report_fetched_at: '2026-02-19T07:55:00Z',
        overall: 'Major AI developments this week including new model releases.',
        sections: [],
      },
    })
    render(<Data />)
    await waitFor(() => {
      expect(screen.getByText('Major AI developments this week including new model releases.')).toBeInTheDocument()
    })
  })

  it('renders per-source section cards (auto-expanded)', async () => {
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
    render(<Data />)
    await waitFor(() => {
      expect(screen.getByText('Hacker News')).toBeInTheDocument()
      expect(screen.getByText('HN had lots of AI discussion.')).toBeInTheDocument()
      expect(screen.getByText('ArXiv AI')).toBeInTheDocument()
      expect(screen.getByText('New transformer papers published.')).toBeInTheDocument()
      expect(screen.getByText('10 items')).toBeInTheDocument()
      expect(screen.getByText('5 items')).toBeInTheDocument()
    })
  })

  it('shows the generated timestamp in the header', async () => {
    mockGetSummary.mockResolvedValue({
      summary: {
        generated_at: '2026-02-19T08:00:00Z',
        report_fetched_at: '2026-02-19T07:55:00Z',
        overall: 'Summary text.',
        sections: [],
      },
    })
    render(<Data />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ai summary/i })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText(/2026-02-19 08:00/)).toBeInTheDocument()
    })
  })
})
