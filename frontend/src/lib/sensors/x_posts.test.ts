// ABOUTME: Tests for x_posts sensor — xcancel.com HTML scraping.
// ABOUTME: Mocks fetch to return sample xcancel HTML and verifies IntelItem mapping.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings } from '../models'
import { defaultConfig } from '../models'

let fetchXPosts: (config: ConfigSettings, limit: number) => Promise<import('../models').IntelItem[]>

// Use a recent fixed date so lookback filtering doesn't discard items
const NOW = new Date('2026-02-20T17:00:00Z').getTime()

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

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn())
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  const mod = await import('./x_posts')
  fetchXPosts = mod.fetchXPosts
})

function makeConfig(overrides?: Partial<ConfigSettings>): ConfigSettings {
  return { ...defaultConfig(), social_accounts_x: ['testuser'], ...overrides }
}

describe('fetchXPosts', () => {
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
