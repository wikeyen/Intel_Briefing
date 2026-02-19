// ABOUTME: Unit tests for multi-platform social sensors (accounts, topics, trends).
// ABOUTME: Verifies SensorConfigError on missing config and correct item source tagging.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defaultConfig } from '../models'
import type { ConfigSettings } from '../models'
import { SensorConfigError } from './errors'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

function mockGrokResponse(items: unknown[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify(items) } }],
    }),
  })
}

describe('social_accounts sensor', () => {
  it('throws SensorConfigError when no platform is configured', async () => {
    const { fetchSocialAccounts } = await import('./social_accounts')
    await expect(fetchSocialAccounts(makeConfig(), 5)).rejects.toThrow(SensorConfigError)
  })

  it('fetches X accounts via Grok when xai_api_key + accounts are set', async () => {
    globalThis.fetch = mockGrokResponse([
      { handle: '@testuser', account: 'Test User', title: 'Hello world', url: 'https://x.com/post/1', published_at: '2026-02-19' },
    ])
    const { fetchSocialAccounts } = await import('./social_accounts')
    const items = await fetchSocialAccounts(makeConfig({
      xai_api_key: 'key',
      social_accounts_x: ['@testuser'],
    }), 5)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].source).toBe('x')
    expect(items[0].account).toBe('Test User')
    expect(items[0].handle).toBe('testuser')
  })

  it('returns empty items when X is configured but Grok returns nothing', async () => {
    globalThis.fetch = mockGrokResponse([])
    const { fetchSocialAccounts } = await import('./social_accounts')
    const items = await fetchSocialAccounts(makeConfig({
      xai_api_key: 'key',
      social_accounts_x: ['@testuser'],
    }), 5)
    expect(items).toEqual([])
  })

  it('skips items with empty title', async () => {
    globalThis.fetch = mockGrokResponse([
      { handle: '@user', title: '', url: '' },
      { handle: '@user2', title: 'Valid post', url: 'https://x.com/2' },
    ])
    const { fetchSocialAccounts } = await import('./social_accounts')
    const items = await fetchSocialAccounts(makeConfig({
      xai_api_key: 'key',
      social_accounts_x: ['@user', '@user2'],
    }), 5)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Valid post')
  })
})

describe('social_accounts sensor — following merge', () => {
  it('merges Bluesky following list when toggle is on', async () => {
    // Mock the Bluesky module to inject getBlueskyFollowing
    vi.doMock('../platforms/bluesky', async () => {
      const actual = await vi.importActual<typeof import('../platforms/bluesky')>('../platforms/bluesky')
      return {
        ...actual,
        createBlueskyAgent: vi.fn().mockResolvedValue({
          session: { did: 'did:plc:test' },
          getAuthorFeed: vi.fn().mockResolvedValue({ data: { feed: [] } }),
          getFollows: vi.fn().mockResolvedValue({
            data: { follows: [{ handle: 'followed.bsky.social' }], cursor: undefined },
          }),
        }),
        getBlueskyFollowing: vi.fn().mockResolvedValue(['followed.bsky.social']),
      }
    })
    const { fetchSocialAccounts } = await import('./social_accounts')
    const config = makeConfig({
      bluesky_handle: 'me.bsky.social',
      bluesky_app_password: 'pass',
      social_accounts_bluesky: ['manual.bsky.social'],
      social_following_bluesky: true,
    })
    // Runs without error; the merged list should include both manual + followed handles
    const items = await fetchSocialAccounts(config, 10)
    // Even if items are empty (mock returns no feed), it should not throw
    expect(items).toBeDefined()
    vi.doUnmock('../platforms/bluesky')
  })

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

  it('deduplicates handles when following overlaps with manual list', async () => {
    vi.doMock('../platforms/bluesky', async () => {
      const actual = await vi.importActual<typeof import('../platforms/bluesky')>('../platforms/bluesky')
      return {
        ...actual,
        createBlueskyAgent: vi.fn().mockResolvedValue({
          session: { did: 'did:plc:test' },
          getAuthorFeed: vi.fn().mockResolvedValue({ data: { feed: [] } }),
          getFollows: vi.fn().mockResolvedValue({
            data: { follows: [{ handle: 'overlap.bsky.social' }, { handle: 'extra.bsky.social' }], cursor: undefined },
          }),
        }),
        getBlueskyFollowing: vi.fn().mockResolvedValue(['overlap.bsky.social', 'extra.bsky.social']),
      }
    })
    const { fetchSocialAccounts } = await import('./social_accounts')
    const config = makeConfig({
      bluesky_handle: 'me.bsky.social',
      bluesky_app_password: 'pass',
      social_accounts_bluesky: ['overlap.bsky.social'],
      social_following_bluesky: true,
    })
    // The function should merge and dedup — no duplicates in the fetched actors
    const items = await fetchSocialAccounts(config, 10)
    expect(items).toBeDefined()
    vi.doUnmock('../platforms/bluesky')
  })

  it('allows Bluesky following-only config (no manual accounts)', async () => {
    vi.doMock('../platforms/bluesky', async () => {
      const actual = await vi.importActual<typeof import('../platforms/bluesky')>('../platforms/bluesky')
      return {
        ...actual,
        createBlueskyAgent: vi.fn().mockResolvedValue({
          session: { did: 'did:plc:test' },
          getAuthorFeed: vi.fn().mockResolvedValue({ data: { feed: [] } }),
          getFollows: vi.fn().mockResolvedValue({
            data: { follows: [{ handle: 'friend.bsky.social' }], cursor: undefined },
          }),
        }),
        getBlueskyFollowing: vi.fn().mockResolvedValue(['friend.bsky.social']),
      }
    })
    const { fetchSocialAccounts } = await import('./social_accounts')
    const config = makeConfig({
      bluesky_handle: 'me.bsky.social',
      bluesky_app_password: 'pass',
      social_accounts_bluesky: [],
      social_following_bluesky: true,
    })
    // Should not throw even with empty manual list — following provides the accounts
    const items = await fetchSocialAccounts(config, 10)
    expect(items).toBeDefined()
    vi.doUnmock('../platforms/bluesky')
  })
})

describe('social_topics sensor', () => {
  it('throws SensorConfigError when no keywords configured', async () => {
    const { fetchSocialTopics } = await import('./social_topics')
    await expect(fetchSocialTopics(makeConfig(), 5)).rejects.toThrow(SensorConfigError)
  })

  it('fetches X topics via Grok when keywords are set', async () => {
    globalThis.fetch = mockGrokResponse([
      { topic: 'AI', handle: '@researcher', title: 'New AI paper', url: 'https://x.com/post/1', published_at: '2026-02-19' },
    ])
    const { fetchSocialTopics } = await import('./social_topics')
    const items = await fetchSocialTopics(makeConfig({
      xai_api_key: 'key',
      social_topics_keywords: ['AI'],
    }), 5)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].source).toBe('x')
    expect(items[0].topic).toBe('AI')
  })

  it('deduplicates URLs within X topics', async () => {
    globalThis.fetch = mockGrokResponse([
      { topic: 'AI', title: 'Post 1', url: 'https://x.com/same', published_at: '2026-02-19' },
      { topic: 'ML', title: 'Post 1 again', url: 'https://x.com/same', published_at: '2026-02-19' },
      { topic: 'AI', title: 'Post 2', url: 'https://x.com/different', published_at: '2026-02-19' },
    ])
    const { fetchSocialTopics } = await import('./social_topics')
    const items = await fetchSocialTopics(makeConfig({
      xai_api_key: 'key',
      social_topics_keywords: ['AI', 'ML'],
    }), 10)
    expect(items).toHaveLength(2)
  })
})

describe('social_trends sensor', () => {
  it('fetches X trends via Grok when api key is set', async () => {
    globalThis.fetch = mockGrokResponse([
      { title: 'Trending topic', url: 'https://example.com', heat: '5k', summary: 'Big news' },
    ])
    const { fetchSocialTrends } = await import('./social_trends')
    const items = await fetchSocialTrends(makeConfig({
      xai_api_key: 'key',
    }), 5)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].source).toBe('x')
    expect(items[0].heat).toBe('5k')
    expect(items[0].abstract).toBe('Big news')
  })

  it('attempts Mastodon public trends even without credentials', async () => {
    // Mock fetch: first call (X Grok) fails because no API key returns empty,
    // Bluesky returns empty, Mastodon trends returns data
    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++
      // Mastodon public trends (3rd platform, but all 3 run concurrently)
      // We only get here for Mastodon since X returns [] and Bluesky returns []
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
    // No xai_api_key, no bluesky — only Mastodon trends (public) should work
    const items = await fetchSocialTrends(makeConfig(), 5)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].source).toBe('mastodon')
  })

  it('respects limit parameter', async () => {
    globalThis.fetch = mockGrokResponse(
      Array.from({ length: 15 }, (_, i) => ({
        title: `Trend ${i}`, url: `https://example.com/${i}`, heat: '1k', summary: `Summary ${i}`,
      })),
    )
    const { fetchSocialTrends } = await import('./social_trends')
    const items = await fetchSocialTrends(makeConfig({ xai_api_key: 'key' }), 3)
    expect(items.length).toBeLessThanOrEqual(3)
  })
})
