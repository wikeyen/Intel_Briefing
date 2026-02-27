// ABOUTME: Tests for the Data page component with group-based dynamic tabs.
// ABOUTME: Validates group tab rendering, item grouping by sensor membership, and filter key logic.
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SourceGroupTree } from '@/lib/groups/types'

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { layoutId: _l, variants: _v, custom: _c, initial: _i, animate: _a, exit: _e, transition: _t, ...rest } = props
      return <div {...rest}>{children as React.ReactNode}</div>
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LayoutGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const map: Record<string, string> = {
        'feed.title': 'Data Feed',
        'feed.desc': `${params?.count ?? 0} items from ${params?.sources ?? 0} sources (${params?.date ?? ''})`,
        'feed.desc_empty': 'No data yet',
        'feed.source': 'Source',
        'feed.feed': 'Feed',
        'feed.search': 'Search...',
        'feed.all': 'All',
        'feed.no_items': 'No items in this section',
        'feed.no_items_key': 'API key needed',
        'nav.status': 'Status',
        'nav.credentials': 'API Keys',
      }
      return map[key] ?? key
    },
  }),
}))

vi.mock('@/lib/toast-context', () => ({
  useToast: () => vi.fn(),
}))

// Mock complex sub-components to isolate Data tab logic
vi.mock('./data/ItemCard', () => ({
  ItemCard: ({ item }: { item: { title: string } }) => <div data-testid="item-card">{item.title}</div>,
  LINE_CLAMP_CSS: '',
}))

vi.mock('./StaleProcessBanner', () => ({
  StaleProcessBanner: () => null,
  detectStale: () => null,
}))

vi.mock('./Skeleton', () => ({
  FeedSkeleton: () => <div>Loading...</div>,
}))

vi.mock('./EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('./Pagination', () => ({
  Pagination: () => null,
}))

/** Workflow field defaults for test fixtures (all analysis off). */
const WORKFLOW_DEFAULTS = {
  trend_enabled: false,
  topic_enabled: false,
  social_enabled: false,
  sentiment_enabled: false,
  summary_prompt: null,
  trend_prompt: null,
  topic_prompt: null,
  social_prompt: null,
  suppress_keywords: [] as string[],
  boost_keywords: [] as string[],
} as const

const mockGroups: SourceGroupTree[] = [
  {
    id: 'research',
    parent_id: null,
    name: 'Research & Reports',
    color: '#2E7D9A',
    icon: null,
    ...WORKFLOW_DEFAULTS,
    sentiment_enabled: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    sensors: ['arxiv'],
    children: [],
  },
  {
    id: 'news',
    parent_id: null,
    name: 'News',
    color: '#C4851C',
    icon: null,
    ...WORKFLOW_DEFAULTS,
    trend_enabled: true,
    sort_order: 1,
    created_at: '',
    updated_at: '',
    sensors: ['hacker_news', 'rss_news'],
    children: [],
  },
  {
    id: 'opinions',
    parent_id: null,
    name: 'Opinions',
    color: '#8B5CF6',
    icon: null,
    ...WORKFLOW_DEFAULTS,
    social_enabled: true,
    sort_order: 2,
    created_at: '',
    updated_at: '',
    sensors: ['rss_feeds', 'hn_blogs'],
    children: [],
  },
]

const mockReport = {
  date: '2026-02-27',
  fetched_at: '2026-02-27T10:00:00Z',
  stale: false,
  sources_ok: ['arxiv', 'hacker_news', 'rss_feeds'],
  sources_failed: [],
  items: {
    research: [
      { id: '1', source: 'arxiv', title: 'ML Paper', url: 'https://arxiv.org/1' },
    ],
    tech: [
      { id: '2', source: 'hacker_news', title: 'HN Story', url: 'https://hn.com/1' },
    ],
    feeds: [
      { id: '3', source: 'rss_feeds', title: 'Blog Post', url: 'https://blog.com/1', account: 'Tech Blog' },
      { id: '4', source: 'rss_news', title: 'News Article', url: 'https://news.com/1', account: 'Reuters' },
    ],
    insights: [
      { id: '5', source: 'hn_blogs', title: 'HN Blog Entry', url: 'https://blog.hn.com/1' },
    ],
  },
}

const mockConfig = {
  sensors_enabled: {
    arxiv: true,
    hacker_news: true,
    rss_feeds: true,
    rss_news: true,
    hn_blogs: true,
  },
}

const mockPipelineStatus = {
  running: false,
  cancelled: false,
  paused: false,
  paused_stage: null,
  retry_attempt: 0,
  retry_max: 0,
  mode: 'fetch_summarize' as const,
  default_concurrency: 4,
  local_summary_concurrency: 1,
  started_at: null,
  completed_at: null,
  sensors: [],
  overall_summary: 'queued' as const,
  total_items: 0,
  alive: true,
  events: [],
}

// Mock the API module
vi.mock('@/api/client', () => ({
  api: {
    getConfig: vi.fn(),
    getLatest: vi.fn(),
    getGroups: vi.fn(),
    getPipelineStatus: vi.fn(),
    stopPipeline: vi.fn(),
    triggerFetch: vi.fn(),
  },
}))

// Import after mocks
import { api } from '@/api/client'
import { Data } from './Data'

const mockedApi = vi.mocked(api)

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.getConfig.mockResolvedValue(mockConfig as never)
  mockedApi.getLatest.mockResolvedValue(mockReport as never)
  mockedApi.getGroups.mockResolvedValue(mockGroups as never)
  mockedApi.getPipelineStatus.mockResolvedValue(mockPipelineStatus as never)
})

describe('Data - group-based tabs', () => {
  it('fetches groups on mount alongside config and report', async () => {
    render(<Data />)
    await waitFor(() => {
      expect(mockedApi.getGroups).toHaveBeenCalledOnce()
      expect(mockedApi.getConfig).toHaveBeenCalledOnce()
      expect(mockedApi.getLatest).toHaveBeenCalledOnce()
    })
  })

  it('renders tabs from source groups', async () => {
    render(<Data />)
    await waitFor(() => {
      expect(screen.getByText('Research & Reports')).toBeDefined()
      expect(screen.getByText('News')).toBeDefined()
      expect(screen.getByText('Opinions')).toBeDefined()
    })
  })

  it('defaults to the first group tab and shows its items', async () => {
    render(<Data />)
    await waitFor(() => {
      // The first tab (Research & Reports) should show the arxiv item
      expect(screen.getByText('ML Paper')).toBeDefined()
    })
  })

  it('switches tabs and shows correct items for that group', async () => {
    render(<Data />)
    await waitFor(() => {
      expect(screen.getByText('News')).toBeDefined()
    })
    fireEvent.click(screen.getByText('News'))
    await waitFor(() => {
      expect(screen.getByText('HN Story')).toBeDefined()
      expect(screen.getByText('News Article')).toBeDefined()
    })
  })

  it('groups items by sensor membership including child groups', async () => {
    const groupsWithChildren: SourceGroupTree[] = [
      {
        ...mockGroups[0],
        children: [{
          id: 'child1',
          parent_id: 'research',
          name: 'Child',
          color: '#000',
          icon: null,
          ...WORKFLOW_DEFAULTS,
          sort_order: 0,
          created_at: '',
          updated_at: '',
          sensors: ['hacker_news'],
          children: [],
        }],
      },
      mockGroups[1],
      mockGroups[2],
    ]
    mockedApi.getGroups.mockResolvedValue(groupsWithChildren as never)

    render(<Data />)
    await waitFor(() => {
      // Research tab should now include hacker_news items via child group
      expect(screen.getByText('ML Paper')).toBeDefined()
      expect(screen.getByText('HN Story')).toBeDefined()
    })
  })

  it('shows Feed label for groups containing rss_feeds', async () => {
    render(<Data />)
    await waitFor(() => {
      expect(screen.getByText('Opinions')).toBeDefined()
    })
    fireEvent.click(screen.getByText('Opinions'))
    await waitFor(() => {
      expect(screen.getByText('Feed')).toBeDefined()
    })
  })

  it('shows Source label for non-RSS groups', async () => {
    render(<Data />)
    await waitFor(() => {
      // First tab (Research) should show "Source" label
      expect(screen.getByText('Source')).toBeDefined()
    })
  })

  it('uses account name as filter key for groups with rss_news', async () => {
    render(<Data />)
    await waitFor(() => {
      expect(screen.getByText('News')).toBeDefined()
    })
    fireEvent.click(screen.getByText('News'))
    await waitFor(() => {
      // News group contains rss_news, so its items should show account names as filter tags
      expect(screen.getByText('Reuters')).toBeDefined()
    })
  })

  it('handles empty groups response gracefully', async () => {
    mockedApi.getGroups.mockResolvedValue([] as never)
    render(<Data />)
    await waitFor(() => {
      // Should still render header but no tabs
      expect(screen.getByText('Data Feed')).toBeDefined()
    })
  })

  it('handles groups API failure gracefully', async () => {
    mockedApi.getGroups.mockRejectedValue(new Error('Network error'))
    render(<Data />)
    await waitFor(() => {
      // Should render without crashing
      expect(screen.getByText('Data Feed')).toBeDefined()
    })
  })
})
