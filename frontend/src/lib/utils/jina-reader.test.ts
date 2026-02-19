// ABOUTME: Tests for the Jina Reader content fetcher.
// ABOUTME: Validates markdown fetching, truncation, and error handling.
import { describe, it, expect, vi, afterEach } from 'vitest'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('fetchContent', () => {
  it('returns markdown content from Jina', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Hello World\n\nSome content here.'),
    })
    const { fetchContent } = await import('./jina-reader')
    const result = await fetchContent('https://example.com/article')
    expect(result).toBe('# Hello World\n\nSome content here.')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://r.jina.ai/https://example.com/article',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('truncates content to maxChars', async () => {
    const longContent = 'A'.repeat(5000)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(longContent),
    })
    const { fetchContent } = await import('./jina-reader')
    const result = await fetchContent('https://example.com', 100)
    expect(result).toHaveLength(100)
  })

  it('returns null on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    const { fetchContent } = await import('./jina-reader')
    const result = await fetchContent('https://example.com')
    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'))
    const { fetchContent } = await import('./jina-reader')
    const result = await fetchContent('https://example.com')
    expect(result).toBeNull()
  })

  it('returns null for empty response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('   '),
    })
    const { fetchContent } = await import('./jina-reader')
    const result = await fetchContent('https://example.com')
    expect(result).toBeNull()
  })
})
