// ABOUTME: Unit tests for deduplication logic in pipeline/dedup.ts.
// ABOUTME: Covers within-list title dedup and social section overlap removal.
import { describe, it, expect } from 'vitest'
import type { IntelItem } from '../models'
import { dedupItems, dedupAcrossSections } from './dedup'

function makeItem(id: string, title: string, source = 'hn'): IntelItem {
  return { id, source, title, url: `https://example.com/${id}` }
}

describe('dedupItems', () => {
  it('removes case-insensitive duplicates', () => {
    const items = [
      makeItem('1', 'Hello World'),
      makeItem('2', 'hello world'),
      makeItem('3', 'Different'),
    ]
    const result = dedupItems(items)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('1')
    expect(result[1].id).toBe('3')
  })

  it('keeps first occurrence', () => {
    const items = [makeItem('a', 'Same Title'), makeItem('b', 'Same Title')]
    const result = dedupItems(items)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('returns empty for empty list', () => {
    expect(dedupItems([])).toEqual([])
  })

  it('returns single item unchanged', () => {
    const items = [makeItem('1', 'Solo')]
    expect(dedupItems(items)).toEqual(items)
  })

  it('keeps items with empty titles', () => {
    const items: IntelItem[] = [
      { id: 'a', source: 's', title: '', url: 'u1' },
      { id: 'b', source: 's', title: '', url: 'u2' },
    ]
    const result = dedupItems(items)
    expect(result).toHaveLength(2)
  })

  it('treats whitespace-only title as empty (kept)', () => {
    const items: IntelItem[] = [
      { id: 'a', source: 's', title: '   ', url: 'u1' },
      { id: 'b', source: 's', title: '  ', url: 'u2' },
    ]
    const result = dedupItems(items)
    expect(result).toHaveLength(2)
  })

  it('preserves order', () => {
    const titles = ['Alpha', 'Beta', 'Gamma', 'Delta']
    const items = titles.map((t, i) => makeItem(String(i), t))
    const result = dedupItems(items)
    expect(result.map((r) => r.title)).toEqual(titles)
  })
})

describe('dedupAcrossSections', () => {
  it('removes topics items whose URL matches an accounts item in social', () => {
    const accItem: IntelItem = { id: 'x-accounts-2026-02-19-0', source: 'x', title: 'Post by user', url: 'https://x.com/post/1' }
    const topItem: IntelItem = { id: 'x-topics-2026-02-19-0', source: 'x', title: 'Same post', url: 'https://x.com/post/1' }
    const other: IntelItem = { id: 'x-topics-2026-02-19-1', source: 'x', title: 'Unique', url: 'https://x.com/post/2' }
    const sections = { social: [accItem, topItem, other] }
    const result = dedupAcrossSections(sections)
    expect(result.social).toHaveLength(2)
    expect(result.social[0].id).toBe('x-accounts-2026-02-19-0')
    expect(result.social[1].id).toBe('x-topics-2026-02-19-1')
  })

  it('returns unchanged when no overlap', () => {
    const sections = {
      social: [
        { id: 'x-accounts-2026-02-19-0', source: 'x', title: 'Account post', url: 'https://x.com/1' } as IntelItem,
        { id: 'x-topics-2026-02-19-0', source: 'x', title: 'Topic post', url: 'https://x.com/2' } as IntelItem,
      ],
    }
    const result = dedupAcrossSections(sections)
    expect(result.social).toHaveLength(2)
  })

  it('returns unchanged when social is empty', () => {
    const sections = { social: [] as IntelItem[] }
    const result = dedupAcrossSections(sections)
    expect(result.social).toEqual([])
  })

  it('handles missing sections', () => {
    const sections: Record<string, IntelItem[]> = {}
    const result = dedupAcrossSections(sections)
    expect(result).toEqual({})
  })

  it('handles only accounts, no topics', () => {
    const sections = {
      social: [{ id: 'x-accounts-2026-02-19-0', source: 'x', title: 'Post', url: 'https://x.com/1' } as IntelItem],
    }
    const result = dedupAcrossSections(sections)
    expect(result.social).toHaveLength(1)
  })
})
