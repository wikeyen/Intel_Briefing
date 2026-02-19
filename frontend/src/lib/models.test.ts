// ABOUTME: Unit tests for TypeScript data models.
// ABOUTME: Covers IntelItem, IntelReport, ConfigSettings, SensorResult, HealthResponse.
import { describe, it, expect } from 'vitest'
import {
  type HealthResponse,
  type IntelItem,
  type IntelReport,
  type SensorResult,
  createReport,
  defaultConfig,
  emptyItemsMap,
  ensureAllSections,
  sensorLimit,
  sensorResultSucceeded,
} from './models'

describe('IntelItem', () => {
  it('should have required fields', () => {
    const item: IntelItem = { id: 'x', source: 'hn', title: 'Hello', url: 'https://example.com' }
    expect(item.id).toBe('x')
    expect(item.source).toBe('hn')
    expect(item.title).toBe('Hello')
    expect(item.url).toBe('https://example.com')
  })

  it('should have optional fields default to undefined', () => {
    const item: IntelItem = { id: 'x', source: 'hn', title: 'T', url: 'u' }
    expect(item.heat).toBeUndefined()
    expect(item.published_at).toBeUndefined()
    expect(item.authors).toBeUndefined()
    expect(item.categories).toBeUndefined()
    expect(item.abstract).toBeUndefined()
    expect(item.account).toBeUndefined()
    expect(item.handle).toBeUndefined()
    expect(item.topic).toBeUndefined()
    expect(item.content).toBeUndefined()
  })

  it('should serialize and deserialize via JSON', () => {
    const item: IntelItem = {
      id: '1',
      source: 'arxiv',
      title: 'Paper',
      url: 'https://arxiv.org/abs/1234',
      abstract: 'Short abstract',
      authors: ['Author A', 'Author B'],
    }
    const json = JSON.stringify(item)
    const restored: IntelItem = JSON.parse(json)
    expect(restored).toEqual(item)
  })

  it('IntelItem accepts verified field', () => {
    const item: IntelItem = {
      id: 'test-1',
      source: 'grok',
      title: 'Test',
      url: 'https://example.com',
      verified: false,
    }
    expect(item.verified).toBe(false)

    const unverified: IntelItem = {
      id: 'test-2',
      source: 'grok',
      title: 'Test 2',
      url: 'https://example.com',
      verified: null,
    }
    expect(unverified.verified).toBeNull()
  })
})

describe('IntelReport', () => {
  it('should have correct defaults via createReport', () => {
    const report = createReport({ date: '2026-01-01', fetched_at: '2026-01-01T07:00:00Z' })
    expect(report.stale).toBe(false)
    expect(report.sources_ok).toEqual([])
    expect(report.sources_failed).toEqual([])
    expect(report.items.tech_trends).toBeDefined()
    expect(report.items.research).toBeDefined()
    expect(report.items.social).toBeDefined()
  })

  it('should have all 8 sections present by default', () => {
    const report = createReport({ date: '2026-01-01', fetched_at: '2026-01-01T07:00:00Z' })
    const expected = new Set([
      'tech_trends', 'research', 'capital_flow', 'products',
      'community', 'social', 'insights', 'feeds',
    ])
    expect(new Set(Object.keys(report.items))).toEqual(expected)
  })

  it('should fill missing sections via ensureAllSections', () => {
    const partial = { tech_trends: [] as IntelItem[] }
    const result = ensureAllSections(partial)
    expect(result.research).toBeDefined()
    expect(result.social).toBeDefined()
  })

  it('should serialize and deserialize via JSON', () => {
    const item: IntelItem = { id: '1', source: 'hn', title: 'T', url: 'u' }
    const report = createReport({
      date: '2026-01-01',
      fetched_at: '2026-01-01T07:00:00Z',
      stale: true,
      sources_ok: ['hn'],
      items: { ...emptyItemsMap(), tech_trends: [item] },
    })
    const json = JSON.stringify(report)
    const restored: IntelReport = JSON.parse(json)
    expect(restored.stale).toBe(true)
    expect(restored.items.tech_trends).toHaveLength(1)
  })
})

describe('ConfigSettings', () => {
  it('should have safe defaults', () => {
    const cfg = defaultConfig()
    expect(cfg.xai_api_key).toBeNull()
    expect(cfg.xai_base_url).toBe('https://api.x.ai/v1/chat/completions')
    expect(cfg.xai_model).toBe('grok-3')
    expect(cfg.default_limit).toBe(10)
    expect(cfg.cache_ttl_hours).toBe(6)
  })

  it('should have all sensors enabled by default', () => {
    const cfg = defaultConfig()
    expect(cfg.sensors_enabled.hacker_news).toBe(true)
    expect(cfg.sensors_enabled.arxiv).toBe(true)
    expect(cfg.sensors_enabled.social_accounts).toBe(true)
    expect(cfg.sensors_enabled.social_topics).toBe(true)
    expect(cfg.sensors_enabled.social_trends).toBe(true)
  })

  it('should have Bluesky and Mastodon credential defaults', () => {
    const cfg = defaultConfig()
    expect(cfg.bluesky_handle).toBeNull()
    expect(cfg.bluesky_app_password).toBeNull()
    expect(cfg.mastodon_token).toBeNull()
    expect(cfg.social_accounts_x).toEqual([])
    expect(cfg.social_accounts_bluesky).toEqual([])
    expect(cfg.social_accounts_mastodon).toEqual([])
    expect(cfg.social_topics_keywords).toEqual([])
  })

  it('should default social following toggles to false', () => {
    const cfg = defaultConfig()
    expect(cfg.social_following_bluesky).toBe(false)
    expect(cfg.social_following_mastodon).toBe(false)
  })

  it('should default rss_feed_urls to empty array', () => {
    const cfg = defaultConfig()
    expect(cfg.rss_feed_urls).toEqual([])
  })

  it('defaultConfig includes summary fields', () => {
    const cfg = defaultConfig()
    expect(cfg.summary_provider).toBeNull()
    expect(cfg.summary_api_key).toBeNull()
    expect(cfg.summary_base_url).toBe('https://openrouter.ai/api/v1')
    expect(cfg.summary_model).toBe('anthropic/claude-sonnet-4')
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

describe('HealthResponse', () => {
  it('should construct with ok status', () => {
    const h: HealthResponse = { status: 'ok', last_fetch: '2026-01-01T07:00:00Z' }
    expect(h.status).toBe('ok')
    expect(h.last_fetch).toBe('2026-01-01T07:00:00Z')
  })

  it('should construct with no_data status', () => {
    const h: HealthResponse = { status: 'no_data', last_fetch: null }
    expect(h.last_fetch).toBeNull()
  })
})
