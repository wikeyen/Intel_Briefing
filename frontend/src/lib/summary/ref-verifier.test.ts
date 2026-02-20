// ABOUTME: Tests for the URL hallucination checker / ref verifier.
// ABOUTME: Validates pool matching, HTTP fallback, concurrent verification, and result shape.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyRefs, buildUrlPool } from './ref-verifier'
import type { BriefingRef } from '../models'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('buildUrlPool', () => {
  it('creates a Set from IntelItem URLs', () => {
    const items = [
      { id: '1', source: 's', title: 't', url: 'https://example.com/1' },
      { id: '2', source: 's', title: 't', url: 'https://example.com/2' },
    ]
    const pool = buildUrlPool(items)
    expect(pool.has('https://example.com/1')).toBe(true)
    expect(pool.has('https://example.com/2')).toBe(true)
    expect(pool.size).toBe(2)
  })

  it('deduplicates identical URLs', () => {
    const items = [
      { id: '1', source: 's', title: 't', url: 'https://example.com/1' },
      { id: '2', source: 's', title: 't', url: 'https://example.com/1' },
    ]
    const pool = buildUrlPool(items)
    expect(pool.size).toBe(1)
  })

  it('ignores empty URLs', () => {
    const items = [
      { id: '1', source: 's', title: 't', url: '' },
      { id: '2', source: 's', title: 't', url: 'https://example.com/1' },
    ]
    const pool = buildUrlPool(items)
    expect(pool.size).toBe(1)
  })
})

describe('verifyRefs', () => {
  it('marks refs as verified when URL is in pool', async () => {
    const pool = new Set(['https://example.com/1', 'https://example.com/2'])
    const refs: BriefingRef[] = [
      { title: 'Article 1', url: 'https://example.com/1' },
      { title: 'Article 2', url: 'https://example.com/2' },
    ]
    globalThis.fetch = vi.fn()

    const result = await verifyRefs(refs, pool)
    expect(result.verified).toHaveLength(2)
    expect(result.failures).toHaveLength(0)
    expect(result.verified[0].verified).toBe(true)
    expect(result.verified[1].verified).toBe(true)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('falls back to HTTP check for URLs not in pool', async () => {
    const pool = new Set(['https://example.com/1'])
    const refs: BriefingRef[] = [
      { title: 'In pool', url: 'https://example.com/1' },
      { title: 'Not in pool', url: 'https://other.com/article' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })

    const result = await verifyRefs(refs, pool)
    expect(result.verified).toHaveLength(2)
    expect(result.failures).toHaveLength(0)
    expect(result.verified[0].verified).toBe(true)
    expect(result.verified[1].verified).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('reports failures for URLs that fail HTTP check', async () => {
    const pool = new Set<string>()
    const refs: BriefingRef[] = [
      { title: 'Bad link', url: 'https://fake-domain.example/nope' },
    ]
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await verifyRefs(refs, pool)
    expect(result.verified).toHaveLength(0)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].title).toBe('Bad link')
  })

  it('handles mixed pool matches and HTTP failures', async () => {
    const pool = new Set(['https://example.com/real'])
    const refs: BriefingRef[] = [
      { title: 'Real', url: 'https://example.com/real' },
      { title: 'Fake', url: 'https://hallucinated.example/nope' },
    ]
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await verifyRefs(refs, pool)
    expect(result.verified).toHaveLength(1)
    expect(result.failures).toHaveLength(1)
    expect(result.verified[0].title).toBe('Real')
    expect(result.failures[0].title).toBe('Fake')
  })

  it('handles empty refs array', async () => {
    const pool = new Set<string>()
    const result = await verifyRefs([], pool)
    expect(result.verified).toHaveLength(0)
    expect(result.failures).toHaveLength(0)
  })

  it('marks refs with invalid URLs as failures without HTTP', async () => {
    const pool = new Set<string>()
    const refs: BriefingRef[] = [
      { title: 'Bad URL', url: 'not-a-url' },
    ]
    globalThis.fetch = vi.fn()

    const result = await verifyRefs(refs, pool)
    expect(result.failures).toHaveLength(1)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
