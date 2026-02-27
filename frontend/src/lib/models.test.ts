// ABOUTME: Unit tests for TypeScript data models.
// ABOUTME: Covers IntelReport, ConfigSettings, SensorResult business logic.
import { describe, it, expect } from 'vitest'
import {
  type IntelItem,
  type SensorResult,
  createReport,
  defaultConfig,
  ensureAllSections,
  normalizeRssFeeds,
  sensorLimit,
  sensorResultSucceeded,
} from './models'

describe('IntelReport', () => {
  it('should have correct defaults via createReport', () => {
    const report = createReport({ date: '2026-01-01', fetched_at: '2026-01-01T07:00:00Z' })
    expect(report.stale).toBe(false)
    expect(report.sources_ok).toEqual([])
    expect(report.sources_failed).toEqual([])
    expect(report.items.tech).toBeDefined()
    expect(report.items.research).toBeDefined()
    expect(report.items.social).toBeDefined()
  })

  it('should have all 9 sections present by default', () => {
    const report = createReport({ date: '2026-01-01', fetched_at: '2026-01-01T07:00:00Z' })
    const expected = new Set([
      'tech', 'research', 'finance', 'products',
      'community', 'social', 'trend', 'insights', 'feeds',
    ])
    expect(new Set(Object.keys(report.items))).toEqual(expected)
  })

  it('should fill missing sections via ensureAllSections', () => {
    const partial = { tech: [] as IntelItem[] }
    const result = ensureAllSections(partial)
    expect(result.research).toBeDefined()
    expect(result.social).toBeDefined()
  })

})

describe('ConfigSettings', () => {
  it('should have safe defaults', () => {
    const cfg = defaultConfig()
    expect(cfg.default_limit).toBe(50)
    expect(cfg.cache_ttl_hours).toBe(6)
  })

  it('should fall back to default_limit for sensorLimit', () => {
    const cfg = defaultConfig()
    expect(sensorLimit(cfg, 'hacker_news')).toBe(50)
    expect(sensorLimit(cfg, 'nonexistent')).toBe(50)
  })

  it('should use sensor override in sensorLimit', () => {
    const cfg = { ...defaultConfig(), sensor_limits: { arxiv: 5 } }
    expect(sensorLimit(cfg, 'arxiv')).toBe(5)
    expect(sensorLimit(cfg, 'hacker_news')).toBe(50)
  })
})

describe('IntelItem NLP fields', () => {
  it('accepts nlp_keywords and nlp_entities when present', () => {
    const item: IntelItem = {
      id: 'test-1',
      source: 'hacker_news',
      title: 'Test',
      url: 'https://example.com',
      nlp_keywords: [{ text: 'AI', weight: 0.9 }, { text: 'ML', weight: 0.7 }],
      nlp_entities: { people: ['Hinton'], orgs: ['Google'], places: ['Toronto'] },
    }
    expect(item.nlp_keywords).toHaveLength(2)
    expect(item.nlp_keywords![0].text).toBe('AI')
    expect(item.nlp_entities!.people).toContain('Hinton')
  })

  it('allows nlp fields to be omitted', () => {
    const item: IntelItem = {
      id: 'test-2',
      source: 'arxiv',
      title: 'Test',
      url: 'https://example.com',
    }
    expect(item.nlp_keywords).toBeUndefined()
    expect(item.nlp_entities).toBeUndefined()
  })
})

describe('normalizeRssFeeds', () => {
  it('converts bare URL strings to RssFeedEntry with type other', () => {
    const result = normalizeRssFeeds(['https://example.com/feed.xml'])
    expect(result).toEqual([{ url: 'https://example.com/feed.xml', type: 'other' }])
  })

  it('passes through RssFeedEntry objects unchanged', () => {
    const entry = { url: 'https://example.com/news.xml', type: 'news' as const }
    const result = normalizeRssFeeds([entry])
    expect(result).toEqual([entry])
  })

  it('handles mixed array of strings and RssFeedEntry objects', () => {
    const result = normalizeRssFeeds([
      'https://example.com/bare.xml',
      { url: 'https://example.com/typed.xml', type: 'blog' },
    ])
    expect(result).toEqual([
      { url: 'https://example.com/bare.xml', type: 'other' },
      { url: 'https://example.com/typed.xml', type: 'blog' },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(normalizeRssFeeds([])).toEqual([])
  })
})

describe('SensorResult', () => {
  it('should be succeeded when no error', () => {
    const result: SensorResult = { sensor_name: 'hn', items: [], error: null }
    expect(sensorResultSucceeded(result)).toBe(true)
  })

  it('should not be succeeded when error is set', () => {
    const result: SensorResult = { sensor_name: 'hn', items: [], error: 'timeout' }
    expect(sensorResultSucceeded(result)).toBe(false)
  })
})

