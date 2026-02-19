// ABOUTME: Tests for the RSS feeds sensor — validates XML parsing, resilience, scraping fallback, and limit.
// ABOUTME: Uses mocked fetch to simulate RSS 2.0, Atom feeds, and article scraping.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ConfigSettings } from '../models'
import { defaultConfig } from '../models'
import { SensorConfigError } from './errors'

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <item>
      <title>Post One</title>
      <link>https://example.com/post-1</link>
      <pubDate>Thu, 19 Feb 2026 12:00:00 GMT</pubDate>
      <description>Summary of post one.</description>
    </item>
    <item>
      <title>Post Two</title>
      <link>https://example.com/post-2</link>
      <pubDate>Thu, 19 Feb 2026 10:00:00 GMT</pubDate>
      <description>Summary of post two.</description>
    </item>
  </channel>
</rss>`

const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <entry>
    <title>Atom Post</title>
    <link rel="alternate" href="https://example.com/atom-1" />
    <published>2026-02-19T11:00:00Z</published>
    <summary>Atom summary text.</summary>
  </entry>
</feed>`

const ARTICLE_HTML = `<html><body><article><p>Full article content here that is long enough.</p><p>Multiple paragraphs needed.</p><p>Readability needs substantial content to parse.</p></article></body></html>`

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('RSS Feeds Sensor', () => {
  it('throws SensorConfigError when no feed URLs configured', async () => {
    const config = makeConfig({ rss_feed_urls: [] })
    const { fetchRssFeeds } = await import('./rss_feeds')
    const { SensorConfigError: ImportedError } = await import('./errors')
    await expect(fetchRssFeeds(config, 10)).rejects.toThrow(ImportedError)
    await expect(fetchRssFeeds(config, 10)).rejects.toThrow('No RSS feed URLs configured')
  })

  it('parses RSS 2.0 feeds correctly', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/feed.xml') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(RSS_XML),
        })
      }
      // Article scrape returns HTML
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(ARTICLE_HTML),
        headers: new Headers({ 'content-type': 'text/html' }),
      })
    })

    const config = makeConfig({ rss_feed_urls: ['https://example.com/feed.xml'] })
    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(config, 10)

    expect(items.length).toBe(2)
    expect(items[0].source).toBe('rss_feeds')
    expect(items[0].title).toBe('Post One')
    expect(items[0].url).toBe('https://example.com/post-1')
    expect(items[0].account).toBe('Test Blog')
    expect(items[0].id).toMatch(/^rss-/)
    // Post One is at 12:00, Post Two at 10:00 => Post One first
    expect(items[0].published_at).toBe('2026-02-19')
    expect(items[1].title).toBe('Post Two')
  })

  it('parses Atom feeds correctly', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/atom.xml') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(ATOM_XML),
        })
      }
      // Article scrape returns HTML
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(ARTICLE_HTML),
        headers: new Headers({ 'content-type': 'text/html' }),
      })
    })

    const config = makeConfig({ rss_feed_urls: ['https://example.com/atom.xml'] })
    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(config, 10)

    expect(items.length).toBe(1)
    expect(items[0].source).toBe('rss_feeds')
    expect(items[0].title).toBe('Atom Post')
    expect(items[0].url).toBe('https://example.com/atom-1')
    expect(items[0].account).toBe('Atom Blog')
    expect(items[0].published_at).toBe('2026-02-19')
  })

  it('is resilient — one bad feed + one good feed still returns items', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://bad.example.com/feed.xml') {
        return Promise.resolve({ ok: false, status: 500 })
      }
      if (url === 'https://good.example.com/feed.xml') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(RSS_XML),
        })
      }
      // Article scrape
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(ARTICLE_HTML),
        headers: new Headers({ 'content-type': 'text/html' }),
      })
    })

    const config = makeConfig({
      rss_feed_urls: [
        'https://bad.example.com/feed.xml',
        'https://good.example.com/feed.xml',
      ],
    })
    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(config, 10)

    expect(items.length).toBe(2)
    expect(items[0].source).toBe('rss_feeds')
  })

  it('falls back to RSS description when article scraping fails', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/feed.xml') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(RSS_XML),
        })
      }
      // Article scrape fails with 403
      return Promise.resolve({
        ok: false,
        status: 403,
      })
    })

    const config = makeConfig({ rss_feed_urls: ['https://example.com/feed.xml'] })
    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(config, 10)

    expect(items.length).toBe(2)
    // Should fall back to RSS description since scraping failed
    expect(items[0].content).toBe('Summary of post one.')
    expect(items[1].content).toBe('Summary of post two.')
  })

  it('excludes items without published dates when lookback is active', async () => {
    const RSS_NO_DATE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Mixed Blog</title>
    <item>
      <title>Dated Post</title>
      <link>https://example.com/dated</link>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <description>Has a date.</description>
    </item>
    <item>
      <title>Undated Post</title>
      <link>https://example.com/undated</link>
      <description>No pubDate element at all.</description>
    </item>
  </channel>
</rss>`

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/feed.xml') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(RSS_NO_DATE),
        })
      }
      return Promise.resolve({ ok: false, status: 403 })
    })

    const config = makeConfig({
      rss_feed_urls: ['https://example.com/feed.xml'],
      sensor_lookback_hours: { rss_feeds: 72 },
    })
    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(config, 10)

    expect(items.length).toBe(1)
    expect(items[0].title).toBe('Dated Post')
  })

  it('includes items without published dates when no lookback is set', async () => {
    const RSS_NO_DATE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Mixed Blog</title>
    <item>
      <title>Dated Post</title>
      <link>https://example.com/dated</link>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <description>Has a date.</description>
    </item>
    <item>
      <title>Undated Post</title>
      <link>https://example.com/undated</link>
      <description>No pubDate element at all.</description>
    </item>
  </channel>
</rss>`

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/feed.xml') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(RSS_NO_DATE),
        })
      }
      return Promise.resolve({ ok: false, status: 403 })
    })

    const config = makeConfig({
      rss_feed_urls: ['https://example.com/feed.xml'],
    })
    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(config, 10)

    expect(items.length).toBe(2)
  })

  it('respects the limit parameter', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.com/feed.xml') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(RSS_XML),
        })
      }
      // Article scrape fails so we use fallback
      return Promise.resolve({ ok: false, status: 403 })
    })

    const config = makeConfig({ rss_feed_urls: ['https://example.com/feed.xml'] })
    const { fetchRssFeeds } = await import('./rss_feeds')
    const items = await fetchRssFeeds(config, 1)

    expect(items.length).toBe(1)
    // Should be the newest item (Post One at 12:00)
    expect(items[0].title).toBe('Post One')
  })
})
