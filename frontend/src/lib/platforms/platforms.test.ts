// ABOUTME: Unit tests for platform adapters (Bluesky, Mastodon).
// ABOUTME: Covers item conversion, engagement formatting, and error handling.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SensorConfigError } from '../sensors/errors'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

describe('Bluesky platform adapter', () => {
  it('extractPostId extracts rkey from AT URI', async () => {
    const { extractPostId } = await import('./bluesky')
    expect(extractPostId('at://did:plc:abc123/app.bsky.feed.post/xyz789')).toBe('xyz789')
  })

  it('buildPostUrl constructs correct URL', async () => {
    const { buildPostUrl } = await import('./bluesky')
    expect(buildPostUrl('alice.bsky.social', 'abc123')).toBe('https://bsky.app/profile/alice.bsky.social/post/abc123')
  })

  it('formatBlueskyHeat formats likes and reposts', async () => {
    const { formatBlueskyHeat } = await import('./bluesky')
    expect(formatBlueskyHeat(10, 3)).toBe('10 likes · 3 reposts')
    expect(formatBlueskyHeat(5, 0)).toBe('5 likes')
    expect(formatBlueskyHeat(0, 0)).toBeNull()
  })

  it('blueskyPostToItem converts post to IntelItem', async () => {
    const { blueskyPostToItem } = await import('./bluesky')
    const item = blueskyPostToItem({
      uri: 'at://did:plc:abc/app.bsky.feed.post/rk1',
      author: { handle: 'alice.bsky.social', displayName: 'Alice' },
      record: { text: 'Hello world', createdAt: '2026-02-19T10:00:00Z' },
      likeCount: 5,
      repostCount: 2,
    }, 'accounts')
    expect(item).not.toBeNull()
    expect(item!.source).toBe('bluesky')
    expect(item!.title).toBe('Hello world')
    expect(item!.account).toBe('Alice')
    expect(item!.handle).toBe('alice.bsky.social')
    expect(item!.heat).toBe('5 likes · 2 reposts')
    expect(item!.id).toBe('bluesky-accounts-rk1')
  })

  it('blueskyPostToItem returns null for missing author', async () => {
    const { blueskyPostToItem } = await import('./bluesky')
    expect(blueskyPostToItem({ record: { text: 'hi' } }, 'test')).toBeNull()
  })

  it('blueskyPostToItem returns null for empty text', async () => {
    const { blueskyPostToItem } = await import('./bluesky')
    expect(blueskyPostToItem({
      author: { handle: 'x' }, record: { text: '' },
    }, 'test')).toBeNull()
  })

  it('createBlueskyAgent throws on missing credentials', async () => {
    const { createBlueskyAgent } = await import('./bluesky')
    await expect(createBlueskyAgent('', '')).rejects.toThrow(SensorConfigError)
  })

  it('getBlueskyFollowing returns handles from paginated getFollows', async () => {
    const { getBlueskyFollowing } = await import('./bluesky')
    const mockAgent = {
      session: { did: 'did:plc:testuser' },
      getFollows: vi.fn()
        .mockResolvedValueOnce({
          data: {
            follows: [
              { handle: 'alice.bsky.social' },
              { handle: 'bob.bsky.social' },
            ],
            cursor: 'page2',
          },
        })
        .mockResolvedValueOnce({
          data: {
            follows: [{ handle: 'carol.bsky.social' }],
            cursor: undefined,
          },
        }),
    }
    const handles = await getBlueskyFollowing(mockAgent as never)
    expect(handles).toEqual(['alice.bsky.social', 'bob.bsky.social', 'carol.bsky.social'])
    expect(mockAgent.getFollows).toHaveBeenCalledTimes(2)
  })

  it('getBlueskyFollowing returns empty array when not following anyone', async () => {
    const { getBlueskyFollowing } = await import('./bluesky')
    const mockAgent = {
      session: { did: 'did:plc:testuser' },
      getFollows: vi.fn().mockResolvedValue({
        data: { follows: [], cursor: undefined },
      }),
    }
    const handles = await getBlueskyFollowing(mockAgent as never)
    expect(handles).toEqual([])
  })
})

describe('Mastodon platform adapter', () => {
  it('stripHtml removes HTML tags', async () => {
    const { stripHtml } = await import('./mastodon')
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world')
    expect(stripHtml('plain text')).toBe('plain text')
  })

  it('formatMastodonHeat formats counts', async () => {
    const { formatMastodonHeat } = await import('./mastodon')
    expect(formatMastodonHeat(5, 3)).toBe('5 favourites · 3 boosts')
    expect(formatMastodonHeat(7, 0)).toBe('7 favourites')
    expect(formatMastodonHeat(0, 0)).toBeNull()
  })

  it('mastodonStatusToItem converts status to IntelItem', async () => {
    const { mastodonStatusToItem } = await import('./mastodon')
    const item = mastodonStatusToItem({
      id: '12345',
      content: '<p>Hello from Mastodon!</p>',
      url: 'https://mastodon.social/@alice/12345',
      created_at: '2026-02-19T10:00:00Z',
      favourites_count: 8,
      reblogs_count: 2,
      account: { display_name: 'Alice', acct: 'alice' },
    }, 'trends')
    expect(item).not.toBeNull()
    expect(item!.source).toBe('mastodon')
    expect(item!.title).toBe('Hello from Mastodon!')
    expect(item!.account).toBe('Alice')
    expect(item!.handle).toBe('alice')
    expect(item!.heat).toBe('8 favourites · 2 boosts')
    expect(item!.id).toBe('mastodon-trends-12345')
  })

  it('mastodonStatusToItem returns null for missing account', async () => {
    const { mastodonStatusToItem } = await import('./mastodon')
    expect(mastodonStatusToItem({ id: '1', content: '<p>hi</p>' }, 'test')).toBeNull()
  })

  it('mastodonGet throws SensorConfigError without token', async () => {
    const { mastodonGet } = await import('./mastodon')
    await expect(mastodonGet('/test', '')).rejects.toThrow(SensorConfigError)
  })

  it('getMastodonFollowing returns acct strings from paginated following', async () => {
    const { getMastodonFollowing } = await import('./mastodon')
    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      // First call: verify_credentials
      if (url.includes('verify_credentials')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: '42' }),
        })
      }
      // Following pages
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { acct: 'alice@mastodon.social' },
            { acct: 'bob@mastodon.social' },
          ]),
          headers: new Headers({
            link: '<https://mastodon.social/api/v1/accounts/42/following?max_id=100>; rel="next"',
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
          { acct: 'carol@mastodon.social' },
        ]),
        headers: new Headers({}),
      })
    })
    const accts = await getMastodonFollowing('test-token')
    expect(accts).toEqual(['alice@mastodon.social', 'bob@mastodon.social', 'carol@mastodon.social'])
  })

  it('getMastodonFollowing returns empty array when not following anyone', async () => {
    const { getMastodonFollowing } = await import('./mastodon')
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('verify_credentials')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: '42' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Headers({}),
      })
    })
    const accts = await getMastodonFollowing('test-token')
    expect(accts).toEqual([])
  })
})
