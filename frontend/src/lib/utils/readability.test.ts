// ABOUTME: Tests for the article content extraction helper using @mozilla/readability.
// ABOUTME: Verifies HTML parsing, content extraction, and fallback on failure.
import { describe, it, expect, vi, afterEach } from 'vitest'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('extractArticle', () => {
  it('extracts article content from HTML', async () => {
    const html = `
      <html><head><title>Test Article</title></head>
      <body>
        <article>
          <h1>Test Article</h1>
          <p>This is the main article content that should be extracted by readability.</p>
          <p>It has multiple paragraphs to make the content substantial enough for the algorithm.</p>
          <p>The readability algorithm needs enough text to identify the main content area.</p>
        </article>
      </body></html>
    `
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: () => Promise.resolve(html),
    })

    const { extractArticle } = await import('./readability')
    const result = await extractArticle('https://example.com/article')
    expect(result).not.toBeNull()
    expect(result).toContain('main article content')
  })

  it('returns content as markdown with formatting preserved', async () => {
    const html = `
      <html><head><title>Formatted Article</title></head>
      <body>
        <article>
          <h1>Formatted Article</h1>
          <p>This article has <strong>bold text</strong> and a <a href="https://example.com">link</a>.</p>
          <p>It has multiple paragraphs to make the content substantial enough for the algorithm.</p>
          <p>The readability algorithm needs enough text to identify the main content area reliably.</p>
        </article>
      </body></html>
    `
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: () => Promise.resolve(html),
    })

    const { extractArticle } = await import('./readability')
    const result = await extractArticle('https://example.com/formatted')
    expect(result).not.toBeNull()
    expect(result).toContain('**bold text**')
    expect(result).toMatch(/\[link\]\(https:\/\/example\.com\/?/)
  })

  it('returns null when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

    const { extractArticle } = await import('./readability')
    const result = await extractArticle('https://example.com/missing')
    expect(result).toBeNull()
  })

  it('returns null for non-HTML content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      text: () => Promise.resolve('%PDF-1.4'),
    })

    const { extractArticle } = await import('./readability')
    const result = await extractArticle('https://example.com/doc.pdf')
    expect(result).toBeNull()
  })

  it('returns null on timeout / network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'))

    const { extractArticle } = await import('./readability')
    const result = await extractArticle('https://example.com/slow')
    expect(result).toBeNull()
  })
})
