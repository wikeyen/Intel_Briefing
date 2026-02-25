// ABOUTME: Tests for x_posts sensor — twitter-scraper path (Apify reserved for trends only).
// ABOUTME: Also tests data mapping and auth-error handling.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings } from '../models'
import { defaultConfig } from '../models'

let fetchXPosts: (config: ConfigSettings, limit: number, onProgress?: (detail: string) => void) => Promise<import('../models').IntelItem[]>
let mapApifyTweet: typeof import('./x_posts').mapApifyTweet
let isCreditError: typeof import('./x_posts').isCreditError

// Use a recent fixed date so lookback filtering doesn't discard items
const NOW = new Date('2026-02-20T17:00:00Z').getTime()

function makeConfig(overrides?: Partial<ConfigSettings>): ConfigSettings {
  return { ...defaultConfig(), social_accounts_x: ['testuser'], ...overrides }
}

// Mock delay to avoid real waits in tests (preserves other utils exports)
function mockDelay() {
  vi.doMock('./utils', async () => {
    const actual = await vi.importActual<typeof import('./utils')>('./utils')
    return {
      ...actual,
      delay: vi.fn().mockResolvedValue(undefined),
    }
  })
}

// Mock child_process.execFile to prevent OpenClaw cookie detection in tests
function mockExecFileNotFound() {
  vi.doMock('child_process', () => ({
    __esModule: true,
    default: {},
    execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(new Error('openclaw not found'), '', '')
    }),
  }))
}

// ── Mock tweet data ──────────────────────────────────────────────────────────

const mockTweets = [
  {
    id: '111',
    text: 'Latest tweet from test user',
    timeParsed: new Date('2026-02-20T15:00:00Z'),
    timestamp: Math.floor(new Date('2026-02-20T15:00:00Z').getTime() / 1000),
    name: 'Test User',
    username: 'testuser',
    permanentUrl: 'https://x.com/testuser/status/111',
    likes: 5000,
    retweets: 200,
    views: 100000,
    isRetweet: false,
    isReply: false,
    isQuoted: false,
    quotedStatusId: undefined,
    hashtags: [],
    mentions: [],
    photos: [],
    videos: [],
    urls: [],
    thread: [],
  },
  {
    id: '222',
    text: 'Retweeted someone',
    timeParsed: new Date('2026-02-20T14:00:00Z'),
    timestamp: Math.floor(new Date('2026-02-20T14:00:00Z').getTime() / 1000),
    name: 'Test User',
    username: 'testuser',
    permanentUrl: 'https://x.com/testuser/status/222',
    likes: 0,
    retweets: 0,
    views: 0,
    isRetweet: true,
    isReply: false,
    isQuoted: false,
    quotedStatusId: undefined,
    hashtags: [],
    mentions: [],
    photos: [],
    videos: [],
    urls: [],
    thread: [],
  },
  {
    id: '333',
    text: '@someone I agree with you on this',
    timeParsed: new Date('2026-02-20T13:00:00Z'),
    timestamp: Math.floor(new Date('2026-02-20T13:00:00Z').getTime() / 1000),
    name: 'Test User',
    username: 'testuser',
    permanentUrl: 'https://x.com/testuser/status/333',
    likes: 10,
    retweets: 0,
    views: 500,
    isRetweet: false,
    isReply: true,
    isQuoted: false,
    quotedStatusId: undefined,
    hashtags: [],
    mentions: [],
    photos: [],
    videos: [],
    urls: [],
    thread: [],
  },
  {
    id: '444',
    text: 'Exactly',
    timeParsed: new Date('2026-02-20T12:00:00Z'),
    timestamp: Math.floor(new Date('2026-02-20T12:00:00Z').getTime() / 1000),
    name: 'Test User',
    username: 'testuser',
    permanentUrl: 'https://x.com/testuser/status/444',
    likes: 50000,
    retweets: 3000,
    views: 5000000,
    isRetweet: false,
    isReply: false,
    isQuoted: true,
    quotedStatusId: '999',
    hashtags: [],
    mentions: [],
    photos: [],
    videos: [],
    urls: [],
    thread: [],
  },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMockScraper(tweets: any[] = mockTweets) {
  return {
    isLoggedIn: vi.fn().mockResolvedValue(false),
    setCookies: vi.fn().mockResolvedValue(undefined),
    getTweets: vi.fn().mockImplementation(async function* () {
      for (const t of tweets) yield t
    }),
  }
}

// ── Twitter-scraper (authenticated) tests ────────────────────────────────────

describe('fetchXPosts (twitter-scraper)', () => {
  let mockScraper: ReturnType<typeof makeMockScraper>

  beforeEach(async () => {
    vi.resetModules()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    mockScraper = makeMockScraper()
    vi.doMock('@the-convocation/twitter-scraper', () => ({
      Scraper: vi.fn().mockImplementation(() => mockScraper),
    }))
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn(),
    }))
    mockExecFileNotFound()
    mockDelay()
    const mod = await import('./x_posts')
    fetchXPosts = mod.fetchXPosts
  })

  function authConfig(overrides?: Partial<ConfigSettings>): ConfigSettings {
    return makeConfig({
      twitter_auth_token: 'test-token',
      twitter_ct0: 'test-ct0',
      ...overrides,
    })
  }

  it('returns empty array when no X accounts configured', async () => {
    const items = await fetchXPosts(authConfig({ social_accounts_x: [] }), 10)
    expect(items).toEqual([])
  })

  it('uses scraper when auth cookies are configured', async () => {
    const items = await fetchXPosts(authConfig(), 10)
    expect(mockScraper.setCookies).toHaveBeenCalled()
    expect(mockScraper.getTweets).toHaveBeenCalledWith('testuser', expect.any(Number))
    expect(items).toHaveLength(1) // retweet, reply, and quote tweet excluded
    expect(items[0].id).toBe('x-111')
    expect(items[0].title).toBe('Latest tweet from test user')
    expect(items[0].heat).toContain('5.0K likes')
    expect(items[0].heat).toContain('100.0K views')
  })

  it('skips retweets, replies, and quote tweets — keeps only original posts', async () => {
    const items = await fetchXPosts(authConfig(), 10)
    const ids = items.map(i => i.id)
    expect(ids).not.toContain('x-222') // retweet
    expect(ids).not.toContain('x-333') // reply
    expect(ids).not.toContain('x-444') // quote tweet
    expect(ids).toEqual(['x-111'])     // only original
  })

  it('respects limit', async () => {
    const items = await fetchXPosts(authConfig(), 1)
    expect(items.length).toBeLessThanOrEqual(1)
  })

  it('strips @ from handles before calling getTweets', async () => {
    await fetchXPosts(authConfig({ social_accounts_x: ['@testuser'] }), 10)
    expect(mockScraper.getTweets).toHaveBeenCalledWith('testuser', expect.any(Number))
  })

  it('throws when no auth is available', async () => {
    await expect(fetchXPosts(makeConfig(), 10)).rejects.toThrow('requires authentication')
  })

  it('deduplicates tweets across accounts', async () => {
    const config = authConfig({ social_accounts_x: ['testuser', 'testuser'] })
    const items = await fetchXPosts(config, 10)
    expect(items).toHaveLength(1)
  })

  it('stitches first self-reply into parent tweet title', async () => {
    vi.resetModules()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const selfReplyTweets = [
      {
        id: '100',
        text: 'Thread opener',
        timeParsed: new Date('2026-02-20T16:00:00Z'),
        timestamp: Math.floor(new Date('2026-02-20T16:00:00Z').getTime() / 1000),
        name: 'Test User',
        username: 'testuser',
        permanentUrl: 'https://x.com/testuser/status/100',
        likes: 10, retweets: 0, views: 100,
        isRetweet: false, isReply: false, isQuoted: false,
        inReplyToStatusId: undefined,
        hashtags: [], mentions: [], photos: [], videos: [], urls: [], thread: [],
      },
      {
        id: '101',
        text: 'Continuing my thought here',
        timeParsed: new Date('2026-02-20T15:59:00Z'),
        timestamp: Math.floor(new Date('2026-02-20T15:59:00Z').getTime() / 1000),
        name: 'Test User',
        username: 'testuser',
        permanentUrl: 'https://x.com/testuser/status/101',
        likes: 2, retweets: 0, views: 50,
        isRetweet: false, isReply: true, isQuoted: false,
        inReplyToStatusId: '100',
        hashtags: [], mentions: [], photos: [], videos: [], urls: [], thread: [],
      },
    ]
    const scraper = makeMockScraper(selfReplyTweets)
    vi.doMock('@the-convocation/twitter-scraper', () => ({
      Scraper: vi.fn().mockImplementation(() => scraper),
    }))
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn(),
    }))
    mockExecFileNotFound()
    mockDelay()
    const mod = await import('./x_posts')

    const items = await mod.fetchXPosts(authConfig(), 10)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('x-100')
    expect(items[0].title).toContain('Thread opener')
    expect(items[0].title).toContain('Continuing my thought here')
  })

  it('does not stitch replies from different authors', async () => {
    vi.resetModules()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const mixedReplies = [
      {
        id: '200',
        text: 'Original post',
        timeParsed: new Date('2026-02-20T16:00:00Z'),
        timestamp: Math.floor(new Date('2026-02-20T16:00:00Z').getTime() / 1000),
        name: 'Test User',
        username: 'testuser',
        permanentUrl: 'https://x.com/testuser/status/200',
        likes: 5, retweets: 0, views: 100,
        isRetweet: false, isReply: false, isQuoted: false,
        inReplyToStatusId: undefined,
        hashtags: [], mentions: [], photos: [], videos: [], urls: [], thread: [],
      },
      {
        id: '201',
        text: 'Reply from someone else',
        timeParsed: new Date('2026-02-20T15:59:00Z'),
        timestamp: Math.floor(new Date('2026-02-20T15:59:00Z').getTime() / 1000),
        name: 'Other User',
        username: 'otheruser',
        permanentUrl: 'https://x.com/otheruser/status/201',
        likes: 1, retweets: 0, views: 20,
        isRetweet: false, isReply: true, isQuoted: false,
        inReplyToStatusId: '200',
        hashtags: [], mentions: [], photos: [], videos: [], urls: [], thread: [],
      },
    ]
    const scraper = makeMockScraper(mixedReplies)
    vi.doMock('@the-convocation/twitter-scraper', () => ({
      Scraper: vi.fn().mockImplementation(() => scraper),
    }))
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn(),
    }))
    mockExecFileNotFound()
    mockDelay()
    const mod = await import('./x_posts')

    const items = await mod.fetchXPosts(authConfig(), 10)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('x-200')
    expect(items[0].title).toBe('Original post')
    expect(items[0].title).not.toContain('someone else')
  })
})

// ── OpenClaw cookie extraction tests ─────────────────────────────────────────

describe('fetchXPosts (OpenClaw cookies)', () => {
  let mockScraper: ReturnType<typeof makeMockScraper>

  beforeEach(async () => {
    vi.resetModules()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    mockScraper = makeMockScraper()
    vi.doMock('@the-convocation/twitter-scraper', () => ({
      Scraper: vi.fn().mockImplementation(() => mockScraper),
    }))
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn(),
    }))
    mockDelay()
    // Mock execFile to return valid cookies
    vi.doMock('child_process', () => ({
      __esModule: true,
      default: {},
      execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        const json = JSON.stringify({
          cookies: [
            { name: 'auth_token', value: 'oc-auth-token' },
            { name: 'ct0', value: 'oc-ct0' },
          ],
        })
        cb(null, json, '')
      }),
    }))
    const mod = await import('./x_posts')
    fetchXPosts = mod.fetchXPosts
  })

  it('uses OpenClaw cookies when no config cookies are set', async () => {
    const config = makeConfig() // no twitter_auth_token or twitter_ct0
    const items = await fetchXPosts(config, 10)
    expect(mockScraper.setCookies).toHaveBeenCalled()
    expect(mockScraper.getTweets).toHaveBeenCalled()
    expect(items).toHaveLength(1)
  })
})

// ── mapApifyTweet tests ──────────────────────────────────────────────────────

describe('mapApifyTweet', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@the-convocation/twitter-scraper', () => ({
      Scraper: vi.fn(),
    }))
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn(),
    }))
    const mod = await import('./x_posts')
    mapApifyTweet = mod.mapApifyTweet
  })

  it('maps standard Apify tweet fields to IntelItem', () => {
    const item = mapApifyTweet({
      id_str: '999',
      full_text: 'Hello from Apify',
      permalink: '/testuser/status/999',
      user: { name: 'Test User', screen_name: 'testuser' },
      favorite_count: 100,
      retweet_count: 20,
      views: 5000,
      created_at: 'Thu Feb 20 15:00:00 +0000 2026',
    }, 'fallback')

    expect(item).not.toBeNull()
    expect(item!.id).toBe('x-999')
    expect(item!.source).toBe('x')
    expect(item!.title).toBe('Hello from Apify')
    expect(item!.url).toBe('https://x.com/testuser/status/999')
    expect(item!.account).toBe('Test User')
    expect(item!.handle).toBe('testuser')
    expect(item!.heat).toContain('100 likes')
    expect(item!.heat).toContain('20 retweets')
    expect(item!.heat).toContain('5.0K views')
    expect(item!.published_at).toBeTruthy()
  })

  it('handles fallback field names (tweetId, text, favorites, createdAt)', () => {
    const item = mapApifyTweet({
      tweetId: '888',
      text: 'Alt fields tweet',
      favorites: 50,
      retweetCount: 10,
      viewCount: 1000,
      createdAt: '2026-02-20T14:00:00Z',
      user: { name: 'Alt Author', username: 'altauthor' },
    }, 'fallback')

    expect(item).not.toBeNull()
    expect(item!.id).toBe('x-888')
    expect(item!.title).toBe('Alt fields tweet')
    expect(item!.account).toBe('Alt Author')
    expect(item!.handle).toBe('altauthor')
    expect(item!.heat).toContain('50 likes')
  })

  it('returns null for empty text', () => {
    const item = mapApifyTweet({ id_str: '777', text: '   ' }, 'fallback')
    expect(item).toBeNull()
  })

  it('uses fallback handle when user info is missing', () => {
    const item = mapApifyTweet({
      id_str: '666',
      text: 'No user info',
      created_at: 'Thu Feb 20 13:00:00 +0000 2026',
    }, 'myhandle')

    expect(item!.handle).toBe('myhandle')
    expect(item!.account).toBe('myhandle')
  })

  it('constructs URL from handle and id_str when permalink is missing', () => {
    const item = mapApifyTweet({
      id_str: '555',
      text: 'No URL field',
      user: { screen_name: 'theuser' },
    }, 'fallback')

    expect(item!.url).toBe('https://x.com/theuser/status/555')
  })

  it('prepends https://x.com to relative permalinks', () => {
    const item = mapApifyTweet({
      id_str: '444',
      text: 'Relative permalink',
      permalink: '/theuser/status/444',
      user: { screen_name: 'theuser' },
    }, 'fallback')

    expect(item!.url).toBe('https://x.com/theuser/status/444')
  })

  it('truncates title to 560 characters', () => {
    const longText = 'A'.repeat(600)
    const item = mapApifyTweet({ id_str: '444', text: longText }, 'fallback')
    expect(item!.title).toHaveLength(560)
  })
})

// ── Provider fallback tests ──────────────────────────────────────────────────

describe('fetchXPosts (provider fallback)', () => {
  function mockApifyClient(items: unknown[]) {
    return vi.fn().mockImplementation(() => ({
      actor: vi.fn().mockReturnValue({
        call: vi.fn().mockResolvedValue({ defaultDatasetId: 'ds-123' }),
      }),
      dataset: vi.fn().mockReturnValue({
        listItems: vi.fn().mockResolvedValue({ items }),
      }),
    }))
  }

  function mockFailingScraper(errorMessage: string) {
    return {
      isLoggedIn: vi.fn().mockResolvedValue(false),
      setCookies: vi.fn().mockResolvedValue(undefined),
      getTweets: vi.fn().mockImplementation(async function* () {
        throw new Error(errorMessage)
      }),
    }
  }

  it('propagates auth error from twitter-scraper (no Apify fallback for accounts)', async () => {
    vi.resetModules()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)

    const scraper = mockFailingScraper('Authentication required — unauthorized')
    vi.doMock('@the-convocation/twitter-scraper', () => ({
      Scraper: vi.fn().mockImplementation(() => scraper),
    }))
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn(),
    }))
    mockExecFileNotFound()
    mockDelay()

    const mod = await import('./x_posts')
    const config = makeConfig({
      twitter_auth_token: 'bad-token',
      twitter_ct0: 'bad-ct0',
      apify_token: 'valid-apify-token',
      x_scraper_provider: 'twitter-scraper',
    })

    await expect(mod.fetchXPosts(config, 10)).rejects.toThrow('unauthorized')
  })

  it('does not fall back on non-auth errors — absorbs per-account failures', async () => {
    vi.resetModules()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)

    const scraper = mockFailingScraper('Network timeout — connection refused')
    vi.doMock('@the-convocation/twitter-scraper', () => ({
      Scraper: vi.fn().mockImplementation(() => scraper),
    }))

    const apifyCallSpy = vi.fn().mockResolvedValue({ defaultDatasetId: 'ds-999' })
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn().mockImplementation(() => ({
        actor: vi.fn().mockReturnValue({ call: apifyCallSpy }),
        dataset: vi.fn().mockReturnValue({
          listItems: vi.fn().mockResolvedValue({ items: [] }),
        }),
      })),
    }))
    mockExecFileNotFound()
    mockDelay()

    const mod = await import('./x_posts')
    const config = makeConfig({
      twitter_auth_token: 'token',
      twitter_ct0: 'ct0',
      apify_token: 'valid-apify-token',
      x_scraper_provider: 'twitter-scraper',
    })

    // Non-auth errors are absorbed per account — returns empty, no fallback triggered
    const items = await mod.fetchXPosts(config, 10)
    expect(items).toEqual([])
    expect(apifyCallSpy).not.toHaveBeenCalled()
  })

  it('does not fall back when alternate provider has no credentials', async () => {
    vi.resetModules()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)

    const scraper = mockFailingScraper('Authentication required — unauthorized')
    vi.doMock('@the-convocation/twitter-scraper', () => ({
      Scraper: vi.fn().mockImplementation(() => scraper),
    }))
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn(),
    }))
    mockExecFileNotFound()
    mockDelay()

    const mod = await import('./x_posts')
    const config = makeConfig({
      twitter_auth_token: 'bad-token',
      twitter_ct0: 'bad-ct0',
      apify_token: null, // no Apify credentials
      x_scraper_provider: 'twitter-scraper',
    })

    await expect(mod.fetchXPosts(config, 10)).rejects.toThrow('unauthorized')
  })

})

// ── isCreditError tests ──────────────────────────────────────────────────────

describe('isCreditError', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@the-convocation/twitter-scraper', () => ({
      Scraper: vi.fn(),
    }))
    vi.doMock('apify-client', () => ({
      ApifyClient: vi.fn(),
    }))
    const mod = await import('./x_posts')
    isCreditError = mod.isCreditError
  })

  it('detects credit-related error messages', () => {
    expect(isCreditError(new Error('Insufficient credits remaining'))).toBe(true)
    expect(isCreditError(new Error('Billing limit exceeded'))).toBe(true)
    expect(isCreditError(new Error('Payment required'))).toBe(true)
    expect(isCreditError(new Error('Subscription expired'))).toBe(true)
    expect(isCreditError(new Error('Quota exceeded'))).toBe(true)
    expect(isCreditError(new Error('402 Payment Required'))).toBe(true)
  })

  it('rejects non-credit errors', () => {
    expect(isCreditError(new Error('Network timeout'))).toBe(false)
    expect(isCreditError(new Error('Internal server error'))).toBe(false)
  })
})


