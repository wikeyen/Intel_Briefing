// ABOUTME: Tests for intelligence filtering helpers in SectionIntelligencePanel.
// ABOUTME: Verifies that key themes are filtered by item content relevance.

import { describe, it, expect } from 'vitest'
import {
  buildItemCorpus,
  isRelevantToCorpus,
  extractRelevantTags,
} from '../SectionIntelligencePanel'
import type { IntelItem, IntelligenceReport, IntelTag } from '@/api/client'

// ---------------------------------------------------------------------------
// Minimal item factory
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<IntelItem>): IntelItem {
  return {
    id: 'item-1',
    title: 'Default Title',
    url: 'https://example.com/1',
    source: 'test',
    timestamp: '2026-01-01T00:00:00Z',
    content: null,
    sentiment: null,
    velocity: null,
    signal_score: null,
    comments: null,
    metrics: null,
    ...overrides,
  } as IntelItem
}

function makeTag(text: string, weight: number): IntelTag {
  return { text, weight }
}

// ---------------------------------------------------------------------------
// buildItemCorpus
// ---------------------------------------------------------------------------

describe('buildItemCorpus', () => {
  it('combines titles and content into a single lowercase string', () => {
    const items = [
      makeItem({ title: 'Tesla Stock Surges', content: 'EV demand rises' }),
      makeItem({ title: 'Bitcoin Rally', content: null }),
    ]
    const corpus = buildItemCorpus(items)
    expect(corpus).toContain('tesla stock surges')
    expect(corpus).toContain('ev demand rises')
    expect(corpus).toContain('bitcoin rally')
  })

  it('returns empty string for no items', () => {
    expect(buildItemCorpus([])).toBe('')
  })
})

// ---------------------------------------------------------------------------
// isRelevantToCorpus
// ---------------------------------------------------------------------------

describe('isRelevantToCorpus', () => {
  const corpus = 'tesla announces new cybertruck pricing and bitcoin reaches all-time high'

  it('matches exact substring (case-insensitive)', () => {
    expect(isRelevantToCorpus('Tesla', corpus)).toBe(true)
    expect(isRelevantToCorpus('BITCOIN', corpus)).toBe(true)
    expect(isRelevantToCorpus('cybertruck pricing', corpus)).toBe(true)
  })

  it('matches multi-word phrase with >=50% word overlap', () => {
    // "bitcoin market high" — 2/3 words match ("bitcoin", "high")
    expect(isRelevantToCorpus('Bitcoin Market High', corpus)).toBe(true)
  })

  it('rejects phrase with insufficient word overlap', () => {
    // "quantum computing breakthrough" — 0/3 words match
    expect(isRelevantToCorpus('Quantum Computing Breakthrough', corpus)).toBe(false)
  })

  it('rejects single short word not in corpus', () => {
    expect(isRelevantToCorpus('AI', corpus)).toBe(false)
  })

  it('matches single long word present in corpus', () => {
    // single word >= 3 chars that IS a substring
    expect(isRelevantToCorpus('announces', corpus)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// extractRelevantTags
// ---------------------------------------------------------------------------

describe('extractRelevantTags', () => {
  const items = [
    makeItem({ title: 'Tesla Cybertruck price increase', content: 'EV market disruption' }),
    makeItem({ title: 'Bitcoin reaches new high', content: 'Crypto market surges' }),
  ]

  const intelligence: IntelligenceReport = {
    trend: {
      tags: [
        makeTag('Tesla', 10),
        makeTag('Middle East Conflict', 8),
        makeTag('Bitcoin', 7),
      ],
      topics: [],
      generated_at: '',
    },
    topics: {
      tags: [
        makeTag('Artificial Intelligence', 9),
        makeTag('EV Market', 6),
      ],
      topics: [],
      generated_at: '',
    },
    accounts: null,
  }

  it('only returns tags relevant to item content', () => {
    const tags = extractRelevantTags(intelligence, items)
    const texts = tags.map(t => t.text)

    expect(texts).toContain('Tesla')
    expect(texts).toContain('Bitcoin')
    expect(texts).toContain('EV Market')
    expect(texts).not.toContain('Middle East Conflict')
    expect(texts).not.toContain('Artificial Intelligence')
  })

  it('deduplicates tags (case-insensitive)', () => {
    const dupeIntel: IntelligenceReport = {
      trend: { tags: [makeTag('Tesla', 10)], topics: [], generated_at: '' },
      topics: { tags: [makeTag('tesla', 5)], topics: [], generated_at: '' },
      accounts: null,
    }
    const tags = extractRelevantTags(dupeIntel, items)
    const teslaCount = tags.filter(t => t.text.toLowerCase() === 'tesla').length
    expect(teslaCount).toBe(1)
  })

  it('returns sorted by weight descending', () => {
    const tags = extractRelevantTags(intelligence, items)
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i].weight).toBeLessThanOrEqual(tags[i - 1].weight)
    }
  })

  it('returns at most 12 tags', () => {
    const manyTags = Array.from({ length: 20 }, (_, i) =>
      makeTag(`tesla variant ${i}`, 20 - i),
    )
    const bigIntel: IntelligenceReport = {
      trend: { tags: manyTags, topics: [], generated_at: '' },
      topics: null,
      accounts: null,
    }
    const itemsWithTesla = [makeItem({ title: 'tesla variant 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19' })]
    const tags = extractRelevantTags(bigIntel, itemsWithTesla)
    expect(tags.length).toBeLessThanOrEqual(12)
  })

  it('returns empty array when no tags match items', () => {
    const unrelatedItems = [makeItem({ title: 'Cooking recipes for beginners' })]
    const tags = extractRelevantTags(intelligence, unrelatedItems)
    expect(tags).toHaveLength(0)
  })
})

