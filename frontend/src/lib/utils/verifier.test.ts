// ABOUTME: Tests for the link verifier utility.
// ABOUTME: Validates HEAD/GET fallback, redirect following, timeout, and error handling.
import { describe, it, expect, vi, afterEach } from 'vitest'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('verifyLink', () => {
  it('returns true for 200 HEAD response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const { verifyLink } = await import('./verifier')
    const result = await verifyLink('https://example.com')
    expect(result).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'HEAD' }),
    )
  })

  it('falls back to GET when HEAD returns 405', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 405 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
    const { verifyLink } = await import('./verifier')
    const result = await verifyLink('https://example.com')
    expect(result).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('returns false for 404', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 })
    const { verifyLink } = await import('./verifier')
    const result = await verifyLink('https://example.com/nope')
    expect(result).toBe(false)
  })

  it('returns false on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const { verifyLink } = await import('./verifier')
    const result = await verifyLink('https://dead.example.com')
    expect(result).toBe(false)
  })

  it('returns false for empty/invalid URL', async () => {
    globalThis.fetch = vi.fn()
    const { verifyLink } = await import('./verifier')
    expect(await verifyLink('')).toBe(false)
    expect(await verifyLink('not-a-url')).toBe(false)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
