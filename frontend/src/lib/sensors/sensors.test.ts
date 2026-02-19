// ABOUTME: Integration tests for individual sensors using mocked fetch.
// ABOUTME: Verifies IntelItem shape, SensorConfigError on missing config, and Error on API failures.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ConfigSettings } from '../models'
import { defaultConfig } from '../models'
import { SensorConfigError } from './errors'

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

// Store original fetch
const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('HackerNewsSensor', () => {
  it('returns intel items', async () => {
    const storyIds = [1, 2, 3]
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('topstories.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(storyIds) })
      }
      const id = parseInt(url.split('/').pop()!.replace('.json', ''))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id, type: 'story', title: `Story ${id}`,
          url: `https://example.com/${id}`, score: 100, descendants: 20,
        }),
      })
    })

    const { fetchHackerNews } = await import('./hacker_news')
    const items = await fetchHackerNews(makeConfig(), 5)
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.source).toBe('hacker_news')
      expect(item.id).toMatch(/^hn-/)
    }
  })

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const { fetchHackerNews } = await import('./hacker_news')
    await expect(fetchHackerNews(makeConfig(), 5)).rejects.toThrow('HTTP 500')
  })

  it('skips non-story type', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('topstories.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([1, 2]) })
      }
      const id = parseInt(url.split('/').pop()!.replace('.json', ''))
      if (id === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 1, type: 'job', title: 'Job Post', url: 'https://example.com/job', score: 1, descendants: 0 }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 2, type: 'story', title: 'Normal post', url: 'https://example.com', score: 100, descendants: 5 }),
      })
    })
    const { fetchHackerNews } = await import('./hacker_news')
    const items = await fetchHackerNews(makeConfig(), 5)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('hn-2')
  })

  it('populates published_at from time field', async () => {
    const storyIds = [1]
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('topstories.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(storyIds) })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 1, type: 'story', title: 'Story 1',
          url: 'https://example.com/1', score: 100, descendants: 20,
          time: 1700000000, kids: [],
        }),
      })
    })

    const { fetchHackerNews } = await import('./hacker_news')
    const items = await fetchHackerNews(makeConfig(), 5)
    expect(items[0].published_at).toBe('2023-11-14T22:13:20.000Z')
  })

  it('fetches top-level comments into content', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('topstories.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([1]) })
      }
      if (url.includes('/item/1.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 1, type: 'story', title: 'Story',
            url: 'https://example.com', score: 50, descendants: 10,
            time: 1700000000, kids: [10, 20, 30],
          }),
        })
      }
      if (url.includes('/item/10.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 10, by: 'user1', text: 'Great article!' }),
        })
      }
      if (url.includes('/item/20.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 20, by: 'user2', text: 'I disagree with this take.' }),
        })
      }
      if (url.includes('/item/30.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 30, by: 'user3', text: '<p>HTML <b>comment</b> here</p>' }),
        })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })

    const { fetchHackerNews } = await import('./hacker_news')
    const items = await fetchHackerNews(makeConfig(), 5)
    expect(items[0].content).toContain('@user1: Great article!')
    expect(items[0].content).toContain('@user2: I disagree with this take.')
    expect(items[0].content).toContain('@user3: HTML comment here')
    expect(items[0].content).toContain('Top comments:')
  })
})

describe('V2EXSensor', () => {
  it('returns intel items', async () => {
    const topics = [
      { id: 1, title: 'V2EX Topic 1', url: 'https://v2ex.com/t/1', replies: 10 },
      { id: 2, title: 'V2EX Topic 2', url: 'https://v2ex.com/t/2', replies: 5 },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(topics),
    })

    const { fetchV2ex } = await import('./v2ex')
    const items = await fetchV2ex(makeConfig(), 5)
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.source).toBe('v2ex')
      expect(item.url).toMatch(/^https:\/\/v2ex.com/)
    }
  })

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    const { fetchV2ex } = await import('./v2ex')
    await expect(fetchV2ex(makeConfig(), 5)).rejects.toThrow('HTTP 503')
  })
})

describe('ChromeRadarSensor', () => {
  it('returns items with source chrome_radar', async () => {
    const categoryHtml = `
      <div class="webstore-test-wall-tile">
        <a href="https://chromewebstore.google.com/detail/test-ext/abc123">
          <span>Bad Extension</span>
        </a>
        <span class="Y30PE">3.2</span>
      </div>
      <div class="webstore-test-wall-tile">
        <a href="https://chromewebstore.google.com/detail/good-ext/def456">
          <span>Good Extension</span>
        </a>
        <span class="Y30PE">4.5</span>
      </div>
    `
    const detailHtml = `<span class="F9iKBc">10,000+ users</span>`

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/category/')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(categoryHtml) })
      }
      if (url.includes('/detail/')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(detailHtml) })
      }
      return Promise.resolve({ ok: false, status: 404 })
    })

    const { fetchChromeRadar } = await import('./chrome_radar')
    const items = await fetchChromeRadar(makeConfig(), 10)
    for (const item of items) {
      expect(item.source).toBe('chrome_radar')
      expect(item.id).toMatch(/^chrome-/)
    }
  })

  it('filters out extensions with rating >= 3.8', async () => {
    const categoryHtml = `
      <div class="webstore-test-wall-tile">
        <a href="https://chromewebstore.google.com/detail/good-ext/abc123">
          <span>High Rated</span>
        </a>
        <span class="Y30PE">4.2</span>
      </div>
    `
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(categoryHtml),
    })

    const { fetchChromeRadar } = await import('./chrome_radar')
    const items = await fetchChromeRadar(makeConfig(), 10)
    expect(items).toHaveLength(0)
  })

  it('filters out extensions with fewer than 5000 users', async () => {
    const categoryHtml = `
      <div class="webstore-test-wall-tile">
        <a href="https://chromewebstore.google.com/detail/small-ext/abc123">
          <span>Small Extension</span>
        </a>
        <span class="Y30PE">2.0</span>
      </div>
    `
    const detailHtml = `<span class="F9iKBc">100 users</span>`

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/category/')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(categoryHtml) })
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve(detailHtml) })
    })

    const { fetchChromeRadar } = await import('./chrome_radar')
    const items = await fetchChromeRadar(makeConfig(), 10)
    expect(items).toHaveLength(0)
  })
})

describe('SensorProtocolCompliance', () => {
  it('github sensor throws SensorConfigError without token', async () => {
    globalThis.fetch = vi.fn()
    const { fetchGitHub } = await import('./github')
    await expect(fetchGitHub(makeConfig({ github_token: null }), 5)).rejects.toThrow(SensorConfigError)
  })

  it('product hunt throws SensorConfigError without token', async () => {
    globalThis.fetch = vi.fn()
    const { fetchProductHunt } = await import('./product_hunt')
    await expect(fetchProductHunt(makeConfig({ producthunt_token: null }), 5)).rejects.toThrow(SensorConfigError)
  })

  it('sensor registry has all 13 sensors', async () => {
    const { SENSOR_REGISTRY } = await import('./index')
    expect(Object.keys(SENSOR_REGISTRY)).toHaveLength(13)
    const expected = [
      'hacker_news', 'arxiv', 'github', 'product_hunt', 'v2ex',
      'hn_blogs', 'social_accounts', 'social_topics', 'social_trends',
      'sources_36kr', 'wallstreetcn', 'chrome_radar', 'rss_feeds',
    ]
    for (const name of expected) {
      expect(SENSOR_REGISTRY[name]).toBeDefined()
      expect(typeof SENSOR_REGISTRY[name]).toBe('function')
    }
  })
})
