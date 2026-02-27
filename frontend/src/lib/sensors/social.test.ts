// ABOUTME: Unit tests for multi-platform social sensors (accounts, topics, trends).
// ABOUTME: Verifies SensorConfigError on missing config and correct item source tagging.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { defaultConfig } from '../models'
import type { ConfigSettings } from '../models'
import { SensorConfigError } from './errors'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

describe('social_accounts sensor', () => {
  it('throws SensorConfigError when no platform is configured', async () => {
    const { fetchSocialAccounts } = await import('./social_accounts')
    await expect(fetchSocialAccounts(makeConfig(), 5)).rejects.toThrow(SensorConfigError)
  })
})

describe('social_accounts sensor — following merge', () => {
  it('does not include following when toggle is off', async () => {
    vi.doMock('../platforms/bluesky', async () => {
      const actual = await vi.importActual<typeof import('../platforms/bluesky')>('../platforms/bluesky')
      const mockGetFollowing = vi.fn()
      return {
        ...actual,
        createBlueskyAgent: vi.fn().mockResolvedValue({
          session: { did: 'did:plc:test' },
          getAuthorFeed: vi.fn().mockResolvedValue({ data: { feed: [] } }),
        }),
        getBlueskyFollowing: mockGetFollowing,
      }
    })
    const { fetchSocialAccounts } = await import('./social_accounts')
    const { getBlueskyFollowing } = await import('../platforms/bluesky')
    const config = makeConfig({
      bluesky_handle: 'me.bsky.social',
      bluesky_app_password: 'pass',
      social_accounts_bluesky: ['manual.bsky.social'],
      social_following_bluesky: false,
    })
    await fetchSocialAccounts(config, 10)
    expect(getBlueskyFollowing).not.toHaveBeenCalled()
    vi.doUnmock('../platforms/bluesky')
  })

})

describe('social_topics sensor', () => {
  it('throws SensorConfigError when no keywords configured', async () => {
    const { fetchSocialTopics } = await import('./social_topics')
    await expect(fetchSocialTopics(makeConfig(), 5)).rejects.toThrow(SensorConfigError)
  })
})

describe('social_trends sensor', () => {
  it('attempts Mastodon public trends even without credentials', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{
          id: '999',
          content: '<p>Trending on Mastodon!</p>',
          url: 'https://mastodon.social/@user/999',
          created_at: '2026-02-19T10:00:00Z',
          favourites_count: 50,
          reblogs_count: 20,
          account: { display_name: 'Popular User', acct: 'popuser' },
        }]),
      })
    })
    const { fetchSocialTrends } = await import('./social_trends')
    // No bluesky — only Mastodon trends (public) should work
    const items = await fetchSocialTrends(makeConfig(), 5)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].source).toBe('mastodon')
  })
})

function makeTrendsDataset(trends: Array<{ rank: number; name: string; link: string; tweet_count: string }>) {
  return [{
    scraped_at: '2026-02-21T12:00:00Z',
    country_input: 'Worldwide',
    timeline: [{
      datetime: '2026-02-21 12:00',
      timestamp: 1740132000,
      trends,
    }],
  }]
}

function mockApifyTrends(items: unknown[]) {
  return vi.fn().mockImplementation(() => ({
    actor: () => ({
      call: vi.fn().mockResolvedValue({ defaultDatasetId: 'ds-1' }),
    }),
    dataset: () => ({
      listItems: vi.fn().mockResolvedValue({ items }),
    }),
  }))
}

describe('social_trends sensor — X via Apify', () => {
  beforeEach(() => { vi.resetModules() })

  it('fetches X trends when apify_token is set', async () => {
    vi.doMock('apify-client', () => ({
      ApifyClient: mockApifyTrends(makeTrendsDataset([
        { rank: 1, name: '#TestTrend', link: 'https://x.com/search?q=%23TestTrend', tweet_count: '150000' },
        { rank: 2, name: 'Breaking News', link: 'https://x.com/search?q=Breaking+News', tweet_count: '50000' },
      ])),
    }))
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const { fetchSocialTrends } = await import('./social_trends')
    const items = await fetchSocialTrends(makeConfig({ apify_token: 'test-token' }), 10)
    expect(items.some(i => i.source === 'x')).toBe(true)
    const xItem = items.find(i => i.id === 'x-trend--testtrend')!
    expect(xItem.title).toBe('#TestTrend')
    expect(xItem.heat).toBe('150K posts')
    expect(xItem.url).toBe('https://x.com/search?q=%23TestTrend')
    vi.doUnmock('apify-client')
  })

  it('returns empty when no apify_token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const { fetchSocialTrends } = await import('./social_trends')
    const items = await fetchSocialTrends(makeConfig({ apify_token: null }), 10)
    expect(items.every(i => i.source !== 'x')).toBe(true)
  })

  it('formats volume correctly', async () => {
    vi.doMock('apify-client', () => ({
      ApifyClient: mockApifyTrends(makeTrendsDataset([
        { rank: 1, name: 'Millions', link: '', tweet_count: '2500000' },
        { rank: 2, name: 'Thousands', link: '', tweet_count: '1500' },
        { rank: 3, name: 'Small', link: '', tweet_count: '42' },
        { rank: 4, name: 'Zero', link: '', tweet_count: '0' },
      ])),
    }))
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const { fetchSocialTrends } = await import('./social_trends')
    const items = await fetchSocialTrends(makeConfig({ apify_token: 'tok' }), 10)
    const x = items.filter(i => i.source === 'x')
    expect(x.find(i => i.title === 'Millions')?.heat).toBe('2.5M posts')
    expect(x.find(i => i.title === 'Thousands')?.heat).toBe('1.5K posts')
    expect(x.find(i => i.title === 'Small')?.heat).toBe('42 posts')
    expect(x.find(i => i.title === 'Zero')?.heat).toBeNull()
    vi.doUnmock('apify-client')
  })
})
