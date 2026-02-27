// ABOUTME: Unit tests for TypeScript data models.
// ABOUTME: Covers IntelReport, ConfigSettings, SensorResult business logic.
import { describe, it, expect } from 'vitest'
import {
  type SensorResult,
  createReport,
  defaultConfig,
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
    expect(report.items).toEqual({})
  })

  it('should preserve provided items in createReport', () => {
    const report = createReport({
      date: '2026-01-01',
      fetched_at: '2026-01-01T07:00:00Z',
      items: { 'group-1': [] },
    })
    expect(Object.keys(report.items)).toEqual(['group-1'])
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

