// ABOUTME: Tests for RSS feed auto-discovery — validates XML detection, HTML link discovery, and error handling.
// ABOUTME: Uses mocked fetch to simulate feed URLs, HTML pages with alternate links, and failure cases.
import { describe, it, expect, vi, afterEach } from 'vitest'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('discoverFeed', () => {
  it('detects XML content-type as a feed', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (h: string) => h === 'content-type' ? 'application/xml; charset=utf-8' : null },
      text: () => Promise.resolve('<?xml version="1.0"?><rss><channel><title>Blog</title></channel></rss>'),
    })

    const { discoverFeed } = await import('./rss-discovery')
    const result = await discoverFeed('https://example.com/feed.xml')
    expect(result.type).toBe('feed')
    expect(result.feedUrl).toBe('https://example.com/feed.xml')
  })

  it('detects feed from URL pattern with XML body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: () => Promise.resolve('<?xml version="1.0"?><rss><channel><title>Blog</title></channel></rss>'),
    })

    const { discoverFeed } = await import('./rss-discovery')
    const result = await discoverFeed('https://example.com/rss')
    expect(result.type).toBe('feed')
    expect(result.feedUrl).toBe('https://example.com/rss')
  })

  it('discovers feed from HTML <link rel="alternate"> tags', async () => {
    const html = `
      <html><head>
        <title>My Blog</title>
        <link rel="alternate" type="application/rss+xml" title="My RSS Feed" href="/feed.xml" />
      </head><body><p>Hello</p></body></html>
    `
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: () => Promise.resolve(html),
    })

    const { discoverFeed } = await import('./rss-discovery')
    const result = await discoverFeed('https://example.com')
    expect(result.type).toBe('discovered')
    expect(result.feedUrl).toBe('https://example.com/feed.xml')
    expect(result.feedTitle).toBe('My RSS Feed')
  })

  it('resolves relative feed URLs against page URL', async () => {
    const html = `
      <html><head>
        <link rel="alternate" type="application/atom+xml" href="blog/atom.xml" />
      </head><body></body></html>
    `
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: () => Promise.resolve(html),
    })

    const { discoverFeed } = await import('./rss-discovery')
    const result = await discoverFeed('https://example.com/site/')
    expect(result.type).toBe('discovered')
    expect(result.feedUrl).toBe('https://example.com/site/blog/atom.xml')
  })

  it('returns not_found when no feed links in HTML', async () => {
    const html = `<html><head><title>No feeds</title></head><body><p>Plain page</p></body></html>`
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: () => Promise.resolve(html),
    })

    const { discoverFeed } = await import('./rss-discovery')
    const result = await discoverFeed('https://example.com')
    expect(result.type).toBe('not_found')
  })

  it('returns error on HTTP failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    const { discoverFeed } = await import('./rss-discovery')
    const result = await discoverFeed('https://example.com/broken')
    expect(result.type).toBe('error')
    expect(result.message).toBeTruthy()
  })

  it('returns error on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))

    const { discoverFeed } = await import('./rss-discovery')
    const result = await discoverFeed('https://nonexistent.invalid')
    expect(result.type).toBe('error')
    expect(result.message).toBeTruthy()
  })
})
