// ABOUTME: Tests for shared summarization utilities — formatItem, groupBySensor, chunkArray, computeContentHash.
// ABOUTME: Validates data transformation and deterministic hashing for per-sensor cache keys.
import { describe, it, expect } from 'vitest'
import { formatItem, groupBySensor, chunkArray, computeContentHash } from './shared'
import type { IntelItem, IntelReport } from '../models'
import { createReport } from '../models'

function makeItem(id: string, source: string, overrides?: Partial<IntelItem>): IntelItem {
  return { id, source, title: `Item ${id}`, url: `https://example.com/${id}`, ...overrides }
}

describe('formatItem', () => {
  it('formats basic item with title and URL', () => {
    const text = formatItem(makeItem('1', 'hn'))
    expect(text).toContain('- Item 1')
    expect(text).toContain('URL: https://example.com/1')
  })

  it('includes abstract when present', () => {
    const text = formatItem(makeItem('1', 'arxiv', { abstract: 'Research abstract here' }))
    expect(text).toContain('Abstract: Research abstract here')
  })

  it('truncates long abstracts to 400 chars', () => {
    const longAbstract = 'A'.repeat(500)
    const text = formatItem(makeItem('1', 'arxiv', { abstract: longAbstract }))
    expect(text).toContain('Abstract: ' + 'A'.repeat(400))
    expect(text).not.toContain('A'.repeat(401))
  })

  it('includes heat and account when present', () => {
    const text = formatItem(makeItem('1', 'hn', { heat: '42 points', account: 'user1' }))
    expect(text).toContain('Heat: 42 points')
    expect(text).toContain('Account: user1')
  })
})

describe('groupBySensor', () => {
  it('groups items from different sections by source', () => {
    const report = createReport({
      date: '2026-02-20',
      fetched_at: '2026-02-20T08:00:00Z',
      sources_ok: ['hacker_news', 'arxiv'],
      items: {
        tech: [makeItem('hn-1', 'hacker_news'), makeItem('hn-2', 'hacker_news')],
        research: [makeItem('ax-1', 'arxiv')],
        finance: [],
        products: [],
        community: [],
        social: [],
        insights: [],
        feeds: [],
      },
    })

    const groups = groupBySensor(report)
    expect(groups.get('hacker_news')).toHaveLength(2)
    expect(groups.get('arxiv')).toHaveLength(1)
    expect(groups.size).toBe(2)
  })

  it('returns empty map for report with no items', () => {
    const report = createReport({
      date: '2026-02-20',
      fetched_at: '2026-02-20T08:00:00Z',
      sources_ok: [],
      items: { tech: [], research: [], finance: [], products: [], community: [], social: [], insights: [], feeds: [] },
    })

    const groups = groupBySensor(report)
    expect(groups.size).toBe(0)
  })
})

describe('chunkArray', () => {
  it('splits array into chunks of specified size', () => {
    const chunks = chunkArray([1, 2, 3, 4, 5], 2)
    expect(chunks).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns single chunk when array fits', () => {
    const chunks = chunkArray([1, 2, 3], 5)
    expect(chunks).toEqual([[1, 2, 3]])
  })

  it('returns empty array for empty input', () => {
    expect(chunkArray([], 3)).toEqual([])
  })
})

describe('computeContentHash', () => {
  it('produces a 16-character hex string', () => {
    const hash = computeContentHash([makeItem('1', 'hn'), makeItem('2', 'hn')])
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is deterministic for same items', () => {
    const items = [makeItem('a', 'hn'), makeItem('b', 'hn')]
    expect(computeContentHash(items)).toBe(computeContentHash(items))
  })

  it('is stable regardless of item order', () => {
    const a = makeItem('a', 'hn')
    const b = makeItem('b', 'hn')
    expect(computeContentHash([a, b])).toBe(computeContentHash([b, a]))
  })

  it('changes when items change', () => {
    const hash1 = computeContentHash([makeItem('a', 'hn'), makeItem('b', 'hn')])
    const hash2 = computeContentHash([makeItem('a', 'hn'), makeItem('c', 'hn')])
    expect(hash1).not.toBe(hash2)
  })

  it('changes when items are added', () => {
    const hash1 = computeContentHash([makeItem('a', 'hn')])
    const hash2 = computeContentHash([makeItem('a', 'hn'), makeItem('b', 'hn')])
    expect(hash1).not.toBe(hash2)
  })
})
