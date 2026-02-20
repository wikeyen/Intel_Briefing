// ABOUTME: Tests for x_posts sensor — twitter-scraper primary path + xcancel fallback.
// ABOUTME: Mocks @the-convocation/twitter-scraper, child_process, and fetch to verify all code paths.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings } from '../models'
import { defaultConfig } from '../models'

let fetchXPosts: (config: ConfigSettings, limit: number) => Promise<import('../models').IntelItem[]>

// Use a recent fixed date so lookback filtering doesn't discard items
const NOW = new Date('2026-02-20T17:00:00Z').getTime()

// ── Xcancel sample HTML ──────────────────────────────────────────────────────
const SAMPLE_HTML = `
<html><body><div class="container">
<div class="timeline">
  <div class="timeline-item" data-username="testuser">
    <a class="tweet-link" href="/testuser/status/12345#m"></a>
    <div class="tweet-body">
      <div><div class="tweet-header">
        <div class="tweet-name-row">
          <div class="fullname-and-username">
            <a class="fullname" href="/testuser" title="Test User">Test User</a>
            <a class="username" href="/testuser" title="@testuser">@testuser</a>
          </div>
          <span class="tweet-date"><a href="/testuser/status/12345#m" title="Feb 20, 2026 · 10:33 AM UTC">6h</a></span>
        </div>
      </div></div>
      <div class="tweet-content media-body" dir="auto">Hello world this is a test tweet</div>
      <div class="tweet-stats">
        <span class="tweet-stat"><div class="icon-container"><span class="icon-comment" title=""></span> 42</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-retweet" title=""></span> 100</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-heart" title=""></span> 1,234</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-views" title=""></span> 50,000</div></span>
      </div>
    </div>
  </div>
  <div class="timeline-item" data-username="otheruser">
    <a class="tweet-link" href="/otheruser/status/67890#m"></a>
    <div class="tweet-body">
      <div>
        <div class="retweet-header"><span>Test User retweeted</span></div>
        <div class="tweet-header">
          <div class="tweet-name-row">
            <div class="fullname-and-username">
              <a class="fullname" href="/otheruser" title="Other User">Other User</a>
              <a class="username" href="/otheruser" title="@otheruser">@otheruser</a>
            </div>
            <span class="tweet-date"><a href="/otheruser/status/67890#m" title="Feb 20, 2026 · 8:00 AM UTC">8h</a></span>
          </div>
        </div>
      </div>
      <div class="tweet-content media-body" dir="auto">This is a retweet</div>
      <div class="tweet-stats">
        <span class="tweet-stat"><div class="icon-container"><span class="icon-comment" title=""></span> 10</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-retweet" title=""></span> 20</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-heart" title=""></span> 300</div></span>
        <span class="tweet-stat"><div class="icon-container"><span class="icon-views" title=""></span> 5,000</div></span>
      </div>
    </div>
  </div>
</div>
</div></body></html>`

function makeConfig(overrides?: Partial<ConfigSettings>): ConfigSettings {
  return { ...defaultConfig(), social_accounts_x: ['testuser'], ...overrides }
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

// ── Xcancel fallback tests (no Twitter cookies, no OpenClaw) ─────────────────

describe('fetchXPosts (xcancel fallback)', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    mockExecFileNotFound()
    const mod = await import('./x_posts')
    fetchXPosts = mod.fetchXPosts
  })

  it('returns empty array when no X accounts configured', async () => {
    const items = await fetchXPosts(makeConfig({ social_accounts_x: [] }), 10)
    expect(items).toEqual([])
  })

  it('parses tweets from xcancel HTML', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, text: () => Promise.resolve(SAMPLE_HTML),
    })
    const items = await fetchXPosts(makeConfig(), 10)
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('x_posts')
    expect(items[0].title).toBe('Hello world this is a test tweet')
    expect(items[0].url).toBe('https://x.com/testuser/status/12345')
    expect(items[0].handle).toBe('testuser')
    expect(items[0].account).toBe('Test User')
    expect(items[0].heat).toContain('1,234')
  })

  it('skips retweets', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, text: () => Promise.resolve(SAMPLE_HTML),
    })
    const items = await fetchXPosts(makeConfig(), 10)
    const ids = items.map(i => i.id)
    expect(ids).not.toContain('x-67890')
  })

  it('respects limit', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, text: () => Promise.resolve(SAMPLE_HTML),
    })
    const items = await fetchXPosts(makeConfig(), 1)
    expect(items.length).toBeLessThanOrEqual(1)
  })

  it('continues when one account fails', async () => {
    const config = makeConfig({ social_accounts_x: ['good', 'bad'] })
    let callCount = 0
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      if (callCount === 2) return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('') })
      return Promise.resolve({ ok: true, text: () => Promise.resolve(SAMPLE_HTML) })
    })
    const items = await fetchXPosts(config, 10)
    expect(items.length).toBeGreaterThan(0)
  })

  it('strips @ from handles in config', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, text: () => Promise.resolve(SAMPLE_HTML),
    })
    await fetchXPosts(makeConfig({ social_accounts_x: ['@testuser'] }), 10)
    expect(fetch).toHaveBeenCalledWith(
      'https://xcancel.com/testuser',
      expect.objectContaining({ headers: expect.any(Object) }),
    )
  })

  it('deduplicates tweets across accounts', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, text: () => Promise.resolve(SAMPLE_HTML),
    })
    const config = makeConfig({ social_accounts_x: ['testuser', 'testuser'] })
    const items = await fetchXPosts(config, 10)
    expect(items).toHaveLength(1)
  })

  it('retries on 429 and succeeds on next attempt', async () => {
    let callCount = 0
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve('') })
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(SAMPLE_HTML) })
    })
    const items = await fetchXPosts(makeConfig(), 10)
    expect(items).toHaveLength(1)
    expect(callCount).toBe(2)
  })
})

// ── Twitter-scraper (authenticated) tests ────────────────────────────────────

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
    hashtags: [],
    mentions: [],
    photos: [],
    videos: [],
    urls: [],
    thread: [],
  },
]

function makeMockScraper(tweets = mockTweets) {
  return {
    isLoggedIn: vi.fn().mockResolvedValue(false),
    setCookies: vi.fn().mockResolvedValue(undefined),
    getTweets: vi.fn().mockImplementation(async function* () {
      for (const t of tweets) yield t
    }),
  }
}

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

  it('uses scraper when auth cookies are configured', async () => {
    const items = await fetchXPosts(authConfig(), 10)
    expect(mockScraper.setCookies).toHaveBeenCalled()
    expect(mockScraper.getTweets).toHaveBeenCalledWith('testuser', expect.any(Number))
    expect(items).toHaveLength(1) // retweet excluded
    expect(items[0].id).toBe('x-111')
    expect(items[0].title).toBe('Latest tweet from test user')
    expect(items[0].heat).toContain('5.0K likes')
    expect(items[0].heat).toContain('100.0K views')
  })

  it('skips retweets and replies', async () => {
    const items = await fetchXPosts(authConfig(), 10)
    expect(items.every(i => i.id !== 'x-222')).toBe(true)
  })

  it('respects limit', async () => {
    const items = await fetchXPosts(authConfig(), 1)
    expect(items.length).toBeLessThanOrEqual(1)
  })

  it('strips @ from handles before calling getTweets', async () => {
    await fetchXPosts(authConfig({ social_accounts_x: ['@testuser'] }), 10)
    expect(mockScraper.getTweets).toHaveBeenCalledWith('testuser', expect.any(Number))
  })

  it('falls back to xcancel when scraper throws', async () => {
    mockScraper.setCookies.mockRejectedValue(new Error('auth failed'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(SAMPLE_HTML),
    }))
    const items = await fetchXPosts(authConfig(), 10)
    expect(items).toHaveLength(1)
    expect(items[0].url).toContain('x.com/testuser/status/12345')
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
