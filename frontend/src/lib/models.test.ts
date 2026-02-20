// ABOUTME: Unit tests for TypeScript data models.
// ABOUTME: Covers IntelReport, ConfigSettings, SensorResult business logic.
import { describe, it, expect } from 'vitest'
import {
  type IntelItem,
  type SensorResult,
  createReport,
  defaultConfig,
  ensureAllSections,
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

  it('should have all 8 sections present by default', () => {
    const report = createReport({ date: '2026-01-01', fetched_at: '2026-01-01T07:00:00Z' })
    const expected = new Set([
      'tech', 'research', 'finance', 'products',
      'community', 'social', 'insights', 'feeds',
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
    expect(cfg.default_limit).toBe(10)
    expect(cfg.cache_ttl_hours).toBe(6)
  })

  it('should fall back to default_limit for sensorLimit', () => {
    const cfg = defaultConfig()
    expect(sensorLimit(cfg, 'hacker_news')).toBe(10)
    expect(sensorLimit(cfg, 'nonexistent')).toBe(10)
  })

  it('should use sensor override in sensorLimit', () => {
    const cfg = { ...defaultConfig(), sensor_limits: { arxiv: 5 } }
    expect(sensorLimit(cfg, 'arxiv')).toBe(5)
    expect(sensorLimit(cfg, 'hacker_news')).toBe(10)
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

