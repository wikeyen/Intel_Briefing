// ABOUTME: Integration tests for individual sensors using mocked fetch.
// ABOUTME: Verifies IntelItem shape and graceful degradation on errors.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ConfigSettings } from '../models'
import { defaultConfig } from '../models'

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

  it('returns empty on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const { fetchHackerNews } = await import('./hacker_news')
    const items = await fetchHackerNews(makeConfig(), 5)
    expect(items).toEqual([])
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

  it('returns empty on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    const { fetchV2ex } = await import('./v2ex')
    const items = await fetchV2ex(makeConfig(), 5)
    expect(items).toEqual([])
  })
})

describe('SensorProtocolCompliance', () => {
  it('grok sensor skips without API key', async () => {
    globalThis.fetch = vi.fn()
    const { fetchGrok } = await import('./grok')
    const items = await fetchGrok(makeConfig({ xai_api_key: null }), 5)
    expect(items).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('politics sensor skips without API key', async () => {
    globalThis.fetch = vi.fn()
    const { fetchPolitics } = await import('./politics')
    const items = await fetchPolitics(makeConfig({ xai_api_key: null, politics_accounts: ['@user1'] }), 5)
    expect(items).toEqual([])
  })

  it('politics sensor skips without accounts', async () => {
    globalThis.fetch = vi.fn()
    const { fetchPolitics } = await import('./politics')
    const items = await fetchPolitics(makeConfig({ xai_api_key: 'key123', politics_accounts: [] }), 5)
    expect(items).toEqual([])
  })

  it('topics sensor skips without API key', async () => {
    globalThis.fetch = vi.fn()
    const { fetchTopics } = await import('./topics')
    const items = await fetchTopics(makeConfig({ xai_api_key: null, topics_keywords: ['AI'] }), 5)
    expect(items).toEqual([])
  })

  it('topics sensor skips without keywords', async () => {
    globalThis.fetch = vi.fn()
    const { fetchTopics } = await import('./topics')
    const items = await fetchTopics(makeConfig({ xai_api_key: 'key', topics_keywords: [] }), 5)
    expect(items).toEqual([])
  })

  it('github sensor skips without token', async () => {
    globalThis.fetch = vi.fn()
    const { fetchGitHub } = await import('./github')
    const items = await fetchGitHub(makeConfig({ github_token: null }), 5)
    expect(items).toEqual([])
  })

  it('product hunt skips without token', async () => {
    globalThis.fetch = vi.fn()
    const { fetchProductHunt } = await import('./product_hunt')
    const items = await fetchProductHunt(makeConfig({ producthunt_token: null }), 5)
    expect(items).toEqual([])
  })

  it('sensor registry has all 11 sensors', async () => {
    const { SENSOR_REGISTRY } = await import('./index')
    expect(Object.keys(SENSOR_REGISTRY)).toHaveLength(11)
    const expected = [
      'hacker_news', 'arxiv', 'github', 'product_hunt', 'v2ex',
      'hn_blogs', 'grok', 'sources_36kr', 'wallstreetcn', 'politics', 'topics',
    ]
    for (const name of expected) {
      expect(SENSOR_REGISTRY[name]).toBeDefined()
      expect(typeof SENSOR_REGISTRY[name]).toBe('function')
    }
  })
})
