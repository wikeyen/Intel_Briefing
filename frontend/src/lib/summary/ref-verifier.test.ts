// ABOUTME: Tests for the URL hallucination checker / ref verifier.
// ABOUTME: Validates pool matching, HTTP fallback, concurrent verification, and result shape.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyRefs, buildUrlPool, buildSensorUrlPool } from './ref-verifier'
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

describe('buildSensorUrlPool', () => {
  it('creates a URL pool from sensor summaries', () => {
    const sensorSummaries = [
      {
        items: [
          { title: 'Article A', url: 'https://example.com/a', brief: 'Summary A', verified: true },
          { title: 'Article B', url: 'https://example.com/b', brief: 'Summary B', verified: true },
        ],
      },
      {
        items: [
          { title: 'Article C', url: 'https://example.com/c', brief: 'Summary C', verified: true },
        ],
      },
    ]
    const pool = buildSensorUrlPool(sensorSummaries)
    expect(pool.has('https://example.com/a')).toBe(true)
    expect(pool.has('https://example.com/b')).toBe(true)
    expect(pool.has('https://example.com/c')).toBe(true)
    expect(pool.size).toBe(3)
  })

  it('filters out items where verified is false', () => {
    const sensorSummaries = [
      {
        items: [
          { title: 'Good', url: 'https://example.com/good', brief: 'OK', verified: true },
          { title: 'Bad', url: 'https://example.com/bad', brief: 'Nope', verified: false },
          { title: 'Unset', url: 'https://example.com/unset', brief: 'No flag' },
          { title: 'Null', url: 'https://example.com/null', brief: 'Null flag', verified: null },
        ],
      },
    ]
    const pool = buildSensorUrlPool(sensorSummaries)
    expect(pool.has('https://example.com/good')).toBe(true)
    expect(pool.has('https://example.com/bad')).toBe(false)
    expect(pool.has('https://example.com/unset')).toBe(true)
    expect(pool.has('https://example.com/null')).toBe(true)
    expect(pool.size).toBe(3)
  })

  it('deduplicates across sensor sections', () => {
    const sensorSummaries = [
      {
        items: [
          { title: 'Shared', url: 'https://example.com/shared', brief: 'A', verified: true },
        ],
      },
      {
        items: [
          { title: 'Also shared', url: 'https://example.com/shared', brief: 'B', verified: true },
        ],
      },
    ]
    const pool = buildSensorUrlPool(sensorSummaries)
    expect(pool.size).toBe(1)
    expect(pool.has('https://example.com/shared')).toBe(true)
  })

  it('handles empty arrays', () => {
    expect(buildSensorUrlPool([]).size).toBe(0)
    expect(buildSensorUrlPool([{ items: [] }]).size).toBe(0)
    expect(buildSensorUrlPool([{ items: [] }, { items: [] }]).size).toBe(0)
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

  it('poolOnly mode rejects non-pool URLs without HTTP check', async () => {
    const pool = new Set(['https://example.com/real'])
    const refs: BriefingRef[] = [
      { title: 'In pool', url: 'https://example.com/real' },
      { title: 'Hallucinated', url: 'https://x.com' },
    ]
    globalThis.fetch = vi.fn()

    const result = await verifyRefs(refs, pool, { poolOnly: true })
    expect(result.verified).toHaveLength(1)
    expect(result.verified[0].title).toBe('In pool')
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].title).toBe('Hallucinated')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
