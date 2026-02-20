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
  // Helper to build a CWS category page with AF_initDataCallback data
  function makeCategoryHtml(extensions: Array<[string, string, number, number]>): string {
    // Each extension: [id, name, rating, users]
    const extList = extensions.map(([id, name, rating, users]) => {
      const ext = new Array(20).fill(null)
      ext[0] = id
      ext[2] = name
      ext[3] = rating
      ext[4] = 100 // rating count (unused by sensor)
      ext[6] = `Description of ${name}`
      ext[14] = users
      return [ext]
    })
    // Wrap in the nested structure: data[0][0][0][13][0][0] = extList
    const inner = new Array(14).fill(null)
    inner[13] = [[extList]]
    const data = [[[[...inner]]]]
    return `AF_initDataCallback({key: 'ds:1', hash: '2', data:${JSON.stringify(data)}, sideChannel: {}})`
  }

  it('returns items with source chrome_radar', async () => {
    const html = makeCategoryHtml([
      ['abc123', 'Bad Extension', 3.2, 10000],
      ['def456', 'Good Extension', 4.5, 50000],
    ])

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(html),
    })

    const { fetchChromeRadar } = await import('./chrome_radar')
    const items = await fetchChromeRadar(makeConfig(), 10)
    // Only the low-rated one should appear
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('chrome_radar')
    expect(items[0].id).toBe('chrome-abc123')
    expect(items[0].title).toBe('Bad Extension')
    expect(items[0].heat).toContain('3.2 stars')
  })

  it('filters out extensions with rating >= 3.8', async () => {
    const html = makeCategoryHtml([
      ['abc123', 'High Rated', 4.2, 50000],
    ])
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(html),
    })

    const { fetchChromeRadar } = await import('./chrome_radar')
    const items = await fetchChromeRadar(makeConfig(), 10)
    expect(items).toHaveLength(0)
  })

  it('filters out extensions with fewer than 5000 users', async () => {
    const html = makeCategoryHtml([
      ['abc123', 'Small Extension', 2.0, 100],
    ])
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(html),
    })

    const { fetchChromeRadar } = await import('./chrome_radar')
    const items = await fetchChromeRadar(makeConfig(), 10)
    expect(items).toHaveLength(0)
  })

  it('parseExtensionsFromHtml returns empty array for invalid HTML', async () => {
    const { parseExtensionsFromHtml } = await import('./chrome_radar')
    expect(parseExtensionsFromHtml('<html>no data here</html>')).toEqual([])
    expect(parseExtensionsFromHtml('')).toEqual([])
  })

  it('deduplicates extensions across categories', async () => {
    const html = makeCategoryHtml([
      ['abc123', 'Duplicate Ext', 2.5, 20000],
      ['abc123', 'Duplicate Ext', 2.5, 20000],
    ])
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve(html),
    })

    const { fetchChromeRadar } = await import('./chrome_radar')
    const items = await fetchChromeRadar(makeConfig(), 10)
    expect(items).toHaveLength(1)
  })
})

describe('WeiboSensor', () => {
  it('returns intel items from hot search', async () => {
    const mockData = {
      ok: 1,
      data: {
        realtime: [
          { mid: '1001', word: 'test topic', num: 50000, label_name: 'Hot', word_scheme: '#test topic' },
          { mid: '1002', word: 'another topic', num: 30000, label_name: '', word_scheme: '' },
        ],
      },
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockData),
    })
    const { fetchWeibo } = await import('./weibo')
    const items = await fetchWeibo(makeConfig(), 5)
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.source).toBe('weibo')
      expect(item.id).toMatch(/^weibo-/)
      expect(item.url).toContain('s.weibo.com')
    }
    expect(items[0].heat).toBe('50000')
  })

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const { fetchWeibo } = await import('./weibo')
    await expect(fetchWeibo(makeConfig(), 5)).rejects.toThrow('HTTP 500')
  })

  it('returns empty array when ok !== 1', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: 0, data: {} }),
    })
    const { fetchWeibo } = await import('./weibo')
    const items = await fetchWeibo(makeConfig(), 5)
    expect(items).toHaveLength(0)
  })
})

describe('ZhihuSensor', () => {
  it('returns intel items from hot list', async () => {
    const mockData = {
      data: [
        {
          id: 'z1',
          target: { title: 'Zhihu Question 1' },
          detail_text: '500 万热度',
          card_id: 'Q_12345',
          children: [{ thumbnail: 'https://pic.zhimg.com/thumb.jpg' }],
        },
      ],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockData),
    })
    const { fetchZhihu } = await import('./zhihu')
    const items = await fetchZhihu(makeConfig(), 5)
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('zhihu')
    expect(items[0].id).toMatch(/^zhihu-/)
    expect(items[0].url).toContain('zhihu.com/question/12345')
    expect(items[0].heat).toBe('5000000')
  })

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    const { fetchZhihu } = await import('./zhihu')
    await expect(fetchZhihu(makeConfig(), 5)).rejects.toThrow('HTTP 403')
  })
})

describe('XiaohongshuSensor', () => {
  it('returns intel items from hot list', async () => {
    const mockData = {
      success: true,
      data: {
        items: [
          { id: 'xhs1', title: 'XHS Topic 1', score: 99000, word_type: 'Hot' },
          { id: 'xhs2', title: 'XHS Topic 2', score: 50000, word_type: '无' },
        ],
      },
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockData),
    })
    const { fetchXiaohongshu } = await import('./xiaohongshu')
    const items = await fetchXiaohongshu(makeConfig(), 5)
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.source).toBe('xiaohongshu')
      expect(item.id).toMatch(/^xhs-/)
      expect(item.url).toContain('xiaohongshu.com')
    }
    expect(items[0].heat).toBe('99000')
  })

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const { fetchXiaohongshu } = await import('./xiaohongshu')
    await expect(fetchXiaohongshu(makeConfig(), 5)).rejects.toThrow('HTTP 500')
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

  it('sensor registry has all 17 sensors', async () => {
    const { SENSOR_REGISTRY } = await import('./index')
    expect(Object.keys(SENSOR_REGISTRY)).toHaveLength(17)
    const expected = [
      'hacker_news', 'arxiv', 'github', 'product_hunt', 'v2ex',
      'hn_blogs', 'social_accounts', 'social_topics', 'social_trends',
      'sources_36kr', 'wallstreetcn', 'chrome_radar', 'rss_feeds',
      'weibo', 'zhihu', 'xiaohongshu', 'x_posts',
    ]
    for (const name of expected) {
      expect(SENSOR_REGISTRY[name]).toBeDefined()
      expect(typeof SENSOR_REGISTRY[name]).toBe('function')
    }
  })
})

describe('Taxonomy', () => {
  it('ALL_CATEGORIES has 8 category keys', async () => {
    const { ALL_CATEGORIES } = await import('./taxonomy')
    expect(ALL_CATEGORIES).toHaveLength(8)
    const expected = ['tech', 'research', 'finance', 'products', 'community', 'social', 'insights', 'feeds']
    expect([...ALL_CATEGORIES]).toEqual(expected)
  })

  it('SENSOR_CATEGORY_MAP maps every sensor to a valid category', async () => {
    const { SENSOR_CATEGORY_MAP, ALL_CATEGORIES, SENSORS } = await import('./taxonomy')
    for (const sensor of SENSORS) {
      expect(SENSOR_CATEGORY_MAP[sensor.key]).toBeDefined()
      expect(ALL_CATEGORIES).toContain(SENSOR_CATEGORY_MAP[sensor.key])
    }
  })

  it('SENSOR_LABELS has an entry for every sensor in the registry', async () => {
    const { SENSOR_LABELS } = await import('./taxonomy')
    const { SENSOR_REGISTRY } = await import('./index')
    for (const key of Object.keys(SENSOR_REGISTRY)) {
      expect(SENSOR_LABELS[key]).toBeDefined()
      expect(typeof SENSOR_LABELS[key]).toBe('string')
    }
  })

  it('every sensor in SENSORS has a language of cn or row', async () => {
    const { SENSORS } = await import('./taxonomy')
    for (const sensor of SENSORS) {
      expect(['cn', 'row']).toContain(sensor.language)
    }
  })

  it('sensorsByLanguageAndCategory returns 2 groups (row and cn) with categorized sensors', async () => {
    const { sensorsByLanguageAndCategory } = await import('./taxonomy')
    const groups = sensorsByLanguageAndCategory()
    expect(groups).toHaveLength(2)

    // ROW comes first
    expect(groups[0].language).toBe('row')
    expect(groups[0].label).toBe('ROW')
    expect(groups[0].categories.length).toBeGreaterThan(0)
    for (const cat of groups[0].categories) {
      expect(cat.sensors.length).toBeGreaterThan(0)
      for (const sensor of cat.sensors) {
        expect(sensor.language).toBe('row')
      }
    }

    // CN comes second
    expect(groups[1].language).toBe('cn')
    expect(groups[1].label).toBe('CN')
    expect(groups[1].categories.length).toBeGreaterThan(0)
    for (const cat of groups[1].categories) {
      expect(cat.sensors.length).toBeGreaterThan(0)
      for (const sensor of cat.sensors) {
        expect(sensor.language).toBe('cn')
      }
    }
  })
})
