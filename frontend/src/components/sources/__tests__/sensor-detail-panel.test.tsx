// ABOUTME: Tests for the SensorDetailPanel — the slide-in settings panel for complex sensors.
// ABOUTME: Verifies panel rendering, escape-to-close, and content for each sensor type.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SensorDetailPanel, type SensorDetailPanelProps } from '../SensorDetailPanel'

// Mock framer-motion — render children directly without animation
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...filterMotionProps(props)}>{children}</div>
    ),
  },
}))

/** Strip framer-motion-specific props that aren't valid HTML attributes. */
function filterMotionProps(props: Record<string, unknown>): Record<string, unknown> {
  const motionKeys = ['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'variants']
  const filtered: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (!motionKeys.includes(k)) filtered[k] = v
  }
  return filtered
}

// Mock i18n — return the key itself as the translation
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: 'en',
    setLocale: vi.fn(),
  }),
}))

// Mock child components that aren't under test
vi.mock('@/components/TagInput', () => ({
  TagInput: ({ tags, placeholder }: { tags: string[]; placeholder?: string }) => (
    <div data-testid="tag-input" data-tags={tags.join(',')} data-placeholder={placeholder} />
  ),
}))

vi.mock('@/components/sources/RssFeedList', () => ({
  RssFeedList: ({ feeds, filterType }: { feeds: unknown[]; filterType?: string[] }) => (
    <div data-testid="rss-feed-list" data-count={feeds.length} data-filter={filterType?.join(',')} />
  ),
}))

vi.mock('@/components/sources/PillInput', () => ({
  PillInput: ({ label, value }: { label: string; value: number }) => (
    <span data-testid="pill-input" data-label={label} data-value={value} />
  ),
}))

vi.mock('@/components/sources/SensorBadge', () => ({
  CategoryBadge: ({ category }: { category: string }) => (
    <span data-testid="category-badge">{category}</span>
  ),
}))

/** Build default props with optional overrides. */
function makeProps(overrides: Partial<SensorDetailPanelProps> = {}): SensorDetailPanelProps {
  return {
    sensorKey: 'x_accounts',
    onClose: vi.fn(),
    socialAccountsX: ['@testuser'],
    setSocialAccountsX: vi.fn(),
    xScraperProvider: 'twitter-scraper',
    setXScraperProvider: vi.fn(),
    socialAccountsBluesky: [],
    setSocialAccountsBluesky: vi.fn(),
    followingBluesky: false,
    setFollowingBluesky: vi.fn(),
    hasBlueskyCredentials: false,
    socialAccountsMastodon: [],
    setSocialAccountsMastodon: vi.fn(),
    followingMastodon: false,
    setFollowingMastodon: vi.fn(),
    hasMastodonCredentials: false,
    disabledAccounts: new Set<string>(),
    onToggleAccountDisabled: vi.fn(),
    onEnableAllAccounts: vi.fn(),
    onDisableAllAccounts: vi.fn(),
    socialTopicsKeywords: ['ai', 'blockchain'],
    setSocialTopicsKeywords: vi.fn(),
    topicLimits: {},
    defaultTopicLimit: 25,
    topicLookback: {},
    onUpdateTopicLimit: vi.fn(),
    onUpdateTopicLookback: vi.fn(),
    onRemoveTopicKeyword: vi.fn(),
    rssFeeds: [{ url: 'https://example.com/feed', type: 'news' as const }],
    setRssFeeds: vi.fn(),
    onAddRssFeed: vi.fn(),
    validateX: vi.fn(() => null),
    validateBsky: vi.fn(() => null),
    validateMasto: vi.fn(() => null),
    trigger: vi.fn(),
    ...overrides,
  }
}

describe('SensorDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset body overflow that the component sets
    document.body.style.overflow = ''
  })

  it('renders sensor label and close button', () => {
    const props = makeProps({ sensorKey: 'x_accounts' })
    render(<SensorDetailPanel {...props} />)

    expect(screen.getByText('X Accounts')).toBeInTheDocument()
    expect(screen.getByLabelText('Close panel')).toBeInTheDocument()
  })

  it('renders category badge', () => {
    const props = makeProps({ sensorKey: 'bluesky_accounts' })
    render(<SensorDetailPanel {...props} />)

    expect(screen.getByTestId('category-badge')).toHaveTextContent('social')
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    const props = makeProps({ onClose })
    render(<SensorDetailPanel {...props} />)

    fireEvent.click(screen.getByLabelText('Close panel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape key calls onClose', () => {
    const onClose = vi.fn()
    const props = makeProps({ onClose })
    render(<SensorDetailPanel {...props} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('locks body scroll on mount and unlocks on unmount', () => {
    const props = makeProps()
    const { unmount } = render(<SensorDetailPanel {...props} />)

    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  describe('X Accounts panel', () => {
    it('shows TagInput and scraper provider select', () => {
      const props = makeProps({ sensorKey: 'x_accounts' })
      render(<SensorDetailPanel {...props} />)

      expect(screen.getByTestId('tag-input')).toBeInTheDocument()
      expect(screen.getByTestId('tag-input')).toHaveAttribute('data-placeholder', 'sources.placeholder_twitter')
      // Scraper provider select
      const select = screen.getByRole('combobox')
      expect(select).toBeInTheDocument()
      expect(select).toHaveValue('twitter-scraper')
    })

    it('calls setXScraperProvider when select changes', () => {
      const setXScraperProvider = vi.fn()
      const trigger = vi.fn()
      const props = makeProps({ sensorKey: 'x_accounts', setXScraperProvider, trigger })
      render(<SensorDetailPanel {...props} />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'apify' } })
      expect(setXScraperProvider).toHaveBeenCalledWith('apify')
      expect(trigger).toHaveBeenCalled()
    })
  })

  describe('Bluesky Accounts panel', () => {
    it('shows TagInput and following checkbox', () => {
      const props = makeProps({ sensorKey: 'bluesky_accounts', hasBlueskyCredentials: true })
      render(<SensorDetailPanel {...props} />)

      expect(screen.getByTestId('tag-input')).toHaveAttribute('data-placeholder', 'sources.placeholder_bluesky')
      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeInTheDocument()
      expect(checkbox).not.toBeDisabled()
    })

    it('disables following checkbox without credentials', () => {
      const props = makeProps({ sensorKey: 'bluesky_accounts', hasBlueskyCredentials: false })
      render(<SensorDetailPanel {...props} />)

      expect(screen.getByRole('checkbox')).toBeDisabled()
    })
  })

  describe('Mastodon Accounts panel', () => {
    it('shows TagInput and following checkbox', () => {
      const props = makeProps({ sensorKey: 'mastodon_accounts', hasMastodonCredentials: true })
      render(<SensorDetailPanel {...props} />)

      expect(screen.getByTestId('tag-input')).toHaveAttribute('data-placeholder', 'sources.placeholder_mastodon')
      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeInTheDocument()
      expect(checkbox).not.toBeDisabled()
    })
  })

  describe('Topics panel', () => {
    it('renders keyword list with PillInputs for bluesky_topics', () => {
      const props = makeProps({ sensorKey: 'bluesky_topics', socialTopicsKeywords: ['ai', 'rust'] })
      render(<SensorDetailPanel {...props} />)

      expect(screen.getByText('ai')).toBeInTheDocument()
      expect(screen.getByText('rust')).toBeInTheDocument()
      // Each keyword gets an items PillInput and a lookback PillInput
      const pillInputs = screen.getAllByTestId('pill-input')
      expect(pillInputs.length).toBe(4) // 2 keywords × 2 pills each
    })

    it('renders keyword list for mastodon_topics', () => {
      const props = makeProps({ sensorKey: 'mastodon_topics', socialTopicsKeywords: ['tech'] })
      render(<SensorDetailPanel {...props} />)

      expect(screen.getByText('tech')).toBeInTheDocument()
    })

    it('calls onRemoveTopicKeyword when remove button clicked', () => {
      const onRemoveTopicKeyword = vi.fn()
      const props = makeProps({
        sensorKey: 'bluesky_topics',
        socialTopicsKeywords: ['ai'],
        onRemoveTopicKeyword,
      })
      render(<SensorDetailPanel {...props} />)

      // The × buttons: first one is the close panel button (has aria-label),
      // subsequent ones are keyword remove buttons.
      const allButtons = screen.getAllByRole('button')
      const removeButtons = allButtons.filter(
        b => b.textContent === '×' && b.getAttribute('aria-label') !== 'Close panel'
      )
      expect(removeButtons.length).toBe(1)
      fireEvent.click(removeButtons[0])
      expect(onRemoveTopicKeyword).toHaveBeenCalledWith('ai')
    })
  })

  describe('RSS panel', () => {
    it('renders RssFeedList for rss_news with news filter', () => {
      const props = makeProps({ sensorKey: 'rss_news' })
      render(<SensorDetailPanel {...props} />)

      const feedList = screen.getByTestId('rss-feed-list')
      expect(feedList).toBeInTheDocument()
      expect(feedList).toHaveAttribute('data-filter', 'news')
    })

    it('renders RssFeedList for rss_blogs with blog,other filter', () => {
      const props = makeProps({ sensorKey: 'rss_blogs' })
      render(<SensorDetailPanel {...props} />)

      const feedList = screen.getByTestId('rss-feed-list')
      expect(feedList).toHaveAttribute('data-filter', 'blog,other')
    })
  })
})
