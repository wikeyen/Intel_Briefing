// ABOUTME: Tests for keyword-based item filtering (boost and suppress).
// ABOUTME: Verifies suppress removes matching items, boost reorders them, and case-insensitive matching.
import { describe, it, expect } from 'vitest'
import type { IntelItem } from '../models'
import { suppressItems, boostItems } from './keyword-filter'

function makeItem(overrides: Partial<IntelItem>): IntelItem {
  return {
    id: 'test-1',
    source: 'hacker_news',
    title: 'Default Title',
    url: 'https://example.com',
    ...overrides,
  }
}

describe('suppressItems', () => {
  it('removes items whose title matches a suppress keyword', () => {
    const items = [
      makeItem({ id: '1', title: 'React hooks deep dive' }),
      makeItem({ id: '2', title: 'Crypto scam warning' }),
      makeItem({ id: '3', title: 'New TypeScript features' }),
    ]
    const result = suppressItems(items, ['crypto'])
    expect(result.map(i => i.id)).toEqual(['1', '3'])
  })

  it('removes items whose content matches a suppress keyword', () => {
    const items = [
      makeItem({ id: '1', title: 'Market update', content: 'Bitcoin prices soared today in crypto markets' }),
      makeItem({ id: '2', title: 'Tech news', content: 'New AI model released' }),
    ]
    const result = suppressItems(items, ['crypto'])
    expect(result.map(i => i.id)).toEqual(['2'])
  })

  it('removes items whose abstract matches a suppress keyword', () => {
    const items = [
      makeItem({ id: '1', title: 'Paper A', abstract: 'We study blockchain consensus mechanisms' }),
      makeItem({ id: '2', title: 'Paper B', abstract: 'We study transformer architectures' }),
    ]
    const result = suppressItems(items, ['blockchain'])
    expect(result.map(i => i.id)).toEqual(['2'])
  })

  it('is case-insensitive', () => {
    const items = [
      makeItem({ id: '1', title: 'CRYPTO Trading Bot' }),
      makeItem({ id: '2', title: 'Good article' }),
    ]
    const result = suppressItems(items, ['Crypto'])
    expect(result.map(i => i.id)).toEqual(['2'])
  })

  it('matches multiple keywords (any match suppresses)', () => {
    const items = [
      makeItem({ id: '1', title: 'Crypto news' }),
      makeItem({ id: '2', title: 'NFT marketplace' }),
      makeItem({ id: '3', title: 'Rust compiler update' }),
    ]
    const result = suppressItems(items, ['crypto', 'nft'])
    expect(result.map(i => i.id)).toEqual(['3'])
  })

  it('returns all items when suppress list is empty', () => {
    const items = [
      makeItem({ id: '1', title: 'Article one' }),
      makeItem({ id: '2', title: 'Article two' }),
    ]
    const result = suppressItems(items, [])
    expect(result).toHaveLength(2)
  })

  it('matches whole words only to avoid false positives', () => {
    const items = [
      makeItem({ id: '1', title: 'React is great' }),
      makeItem({ id: '2', title: 'Reactive programming' }),
    ]
    const result = suppressItems(items, ['react'])
    // "React" matches, "Reactive" should NOT match (word boundary)
    expect(result.map(i => i.id)).toEqual(['2'])
  })
})

describe('boostItems', () => {
  it('moves items matching boost keywords to the top', () => {
    const items = [
      makeItem({ id: '1', title: 'Regular article' }),
      makeItem({ id: '2', title: 'AI safety research' }),
      makeItem({ id: '3', title: 'Another regular article' }),
    ]
    const result = boostItems(items, ['AI'])
    expect(result[0].id).toBe('2')
  })

  it('preserves relative order among boosted items', () => {
    const items = [
      makeItem({ id: '1', title: 'Regular article' }),
      makeItem({ id: '2', title: 'First AI paper' }),
      makeItem({ id: '3', title: 'Second AI paper' }),
    ]
    const result = boostItems(items, ['AI'])
    expect(result.map(i => i.id)).toEqual(['2', '3', '1'])
  })

  it('preserves relative order among non-boosted items', () => {
    const items = [
      makeItem({ id: '1', title: 'First regular' }),
      makeItem({ id: '2', title: 'AI paper' }),
      makeItem({ id: '3', title: 'Second regular' }),
    ]
    const result = boostItems(items, ['AI'])
    expect(result.map(i => i.id)).toEqual(['2', '1', '3'])
  })

  it('is case-insensitive', () => {
    const items = [
      makeItem({ id: '1', title: 'Regular article' }),
      makeItem({ id: '2', title: 'rust compiler improvements' }),
    ]
    const result = boostItems(items, ['Rust'])
    expect(result[0].id).toBe('2')
  })

  it('boosts based on content match too', () => {
    const items = [
      makeItem({ id: '1', title: 'Generic title', content: 'Some boring content' }),
      makeItem({ id: '2', title: 'Another title', content: 'This mentions Rust internals' }),
    ]
    const result = boostItems(items, ['rust'])
    expect(result[0].id).toBe('2')
  })

  it('returns items unchanged when boost list is empty', () => {
    const items = [
      makeItem({ id: '1', title: 'First' }),
      makeItem({ id: '2', title: 'Second' }),
    ]
    const result = boostItems(items, [])
    expect(result.map(i => i.id)).toEqual(['1', '2'])
  })
})
