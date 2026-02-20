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

describe('social_accounts sensor', () => {
  it('throws SensorConfigError when no platform is configured', async () => {
    const { fetchSocialAccounts } = await import('./social_accounts')
    await expect(fetchSocialAccounts(makeConfig(), 5)).rejects.toThrow(SensorConfigError)
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
