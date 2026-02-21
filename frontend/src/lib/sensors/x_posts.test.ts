// ABOUTME: Tests for x_posts sensor — twitter-scraper primary path with auth cookie variants.
// ABOUTME: Mocks @the-convocation/twitter-scraper and child_process to verify all code paths.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings } from '../models'
import { defaultConfig } from '../models'

let fetchXPosts: (config: ConfigSettings, limit: number) => Promise<import('../models').IntelItem[]>

// Use a recent fixed date so lookback filtering doesn't discard items
const NOW = new Date('2026-02-20T17:00:00Z').getTime()

function makeConfig(overrides?: Partial<ConfigSettings>): ConfigSettings {
  return { ...defaultConfig(), social_accounts_x: ['testuser'], ...overrides }
}

// Mock delay to avoid real waits in tests
function mockDelay() {
  vi.doMock('./utils', () => ({
    delay: vi.fn().mockResolvedValue(undefined),
  }))
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
