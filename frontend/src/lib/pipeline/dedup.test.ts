// ABOUTME: Unit tests for deduplication logic in pipeline/dedup.ts.
// ABOUTME: Covers within-list title dedup and cross-section politics/topics overlap removal.
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
  it('removes politics ids from topics', () => {
    const polItem = makeItem('shared-1', 'Political post', 'politics')
    const topItem = makeItem('shared-1', 'Same post', 'topics')
    const other = makeItem('unique-2', 'Unrelated', 'topics')
    const sections = { politics: [polItem], topics: [topItem, other] }
    const result = dedupAcrossSections(sections)
    expect(result.politics).toHaveLength(1)
    expect(result.topics).toHaveLength(1)
    expect(result.topics[0].id).toBe('unique-2')
  })

  it('returns unchanged when no overlap', () => {
    const sections = {
      politics: [makeItem('p1', 'Politics post')],
      topics: [makeItem('t1', 'Topics post')],
    }
    const result = dedupAcrossSections(sections)
    expect(result.politics).toHaveLength(1)
    expect(result.topics).toHaveLength(1)
  })

  it('returns unchanged when politics is empty', () => {
    const sections = {
      politics: [] as IntelItem[],
      topics: [makeItem('t1', 'Topics post')],
    }
    const result = dedupAcrossSections(sections)
    expect(result.topics).toHaveLength(1)
  })

  it('handles missing sections', () => {
    const sections: Record<string, IntelItem[]> = {}
    const result = dedupAcrossSections(sections)
    expect(result).toEqual({})
  })

  it('handles only politics, no topics', () => {
    const sections = { politics: [makeItem('p1', 'Post')] }
    const result = dedupAcrossSections(sections)
    expect(result.politics).toHaveLength(1)
  })
})
