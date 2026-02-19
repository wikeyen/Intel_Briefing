// ABOUTME: Integration tests for the collect() pipeline with mocked sensors.
// ABOUTME: Validates IntelReport structure, sensor failure isolation, error_kind propagation, and cache write.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings, IntelItem } from '../models'
import { defaultConfig } from '../models'
import { SensorConfigError } from '../sensors/errors'

const mockVerifyLink = vi.fn()
const mockFetchContent = vi.fn()
vi.mock('../utils/verifier', () => ({
  verifyLink: (...args: unknown[]) => mockVerifyLink(...args),
}))
vi.mock('../utils/jina-reader', () => ({
  fetchContent: (...args: unknown[]) => mockFetchContent(...args),
}))

// Mock SQLite cache adapter
const mockWriteReport = vi.fn()
vi.mock('./cache', () => ({
  writeReport: (...args: unknown[]) => mockWriteReport(...args),
  writePipelineStatus: vi.fn(),
  readPipelineStatus: vi.fn(),
  readReport: vi.fn(),
  isStale: vi.fn(),
}))

// Mock sensors
const mockSensorFns: Record<string, ReturnType<typeof vi.fn>> = {}
vi.mock('../sensors', () => ({
  SENSOR_REGISTRY: new Proxy({}, {
    get: (_target, prop: string) => mockSensorFns[prop],
    ownKeys: () => Object.keys(mockSensorFns),
    getOwnPropertyDescriptor: (_target, prop: string) => {
      if (prop in mockSensorFns) {
        return { configurable: true, enumerable: true, value: mockSensorFns[prop] }
      }
      return undefined
    },
  }),
}))

const { collect } = await import('./collector')

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

function makeItem(id: string, source = 'hn'): IntelItem {
  return { id, source, title: `Item ${id}`, url: `https://example.com/${id}` }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerifyLink.mockReset()
  mockFetchContent.mockReset()
  // Clear all sensor mocks
  for (const key of Object.keys(mockSensorFns)) {
    delete mockSensorFns[key]
  }
})

describe('collect', () => {
  it('returns valid report with no sensors', async () => {
    const config = makeConfig({ sensors_enabled: {} })
    const report = await collect(config)
    expect(report).toBeDefined()
    expect(report.date).toBeTruthy()
    expect(report.fetched_at).toBeTruthy()
    expect(report.items.tech_trends).toBeDefined()
    expect(mockWriteReport).toHaveBeenCalled()
  })

  it('failed sensor goes to sources_failed', async () => {
    mockSensorFns['failing_sensor'] = vi.fn().mockRejectedValue(new Error('Connection refused'))
    mockSensorFns['ok_sensor'] = vi.fn().mockResolvedValue([makeItem('1', 'ok_sensor')])

    const config = makeConfig({
      sensors_enabled: { failing_sensor: true, ok_sensor: true },
    })
    const report = await collect(config)
    expect(report.sources_failed).toContain('failing_sensor')
    expect(report.sources_ok).toContain('ok_sensor')
  })

  it('disabled sensor not called', async () => {
    const spyFn = vi.fn().mockResolvedValue([])
    mockSensorFns['my_sensor'] = spyFn

    const config = makeConfig({ sensors_enabled: { my_sensor: false } })
    await collect(config)
    expect(spyFn).not.toHaveBeenCalled()
  })

  it('cache is written after collect', async () => {
    const config = makeConfig({ sensors_enabled: {} })
    await collect(config)
    expect(mockWriteReport).toHaveBeenCalled()
  })

  it('items routed to correct sections', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])
    mockSensorFns['arxiv'] = vi.fn().mockResolvedValue([makeItem('arxiv1', 'arxiv')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true, arxiv: true },
    })
    const report = await collect(config)
    expect(report.items.tech_trends.some((i) => i.id === 'hn1')).toBe(true)
    expect(report.items.research.some((i) => i.id === 'arxiv1')).toBe(true)
  })

  it('dedup within section applied', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([
      makeItem('1', 'hacker_news'),
      { id: '2', source: 'hacker_news', title: 'Item 1', url: 'https://example.com/dup' },
    ])

    const config = makeConfig({ sensors_enabled: { hacker_news: true } })
    const report = await collect(config)
    expect(report.items.tech_trends).toHaveLength(1)
  })

  it('SensorConfigError produces error_kind config in progress callback', async () => {
    mockSensorFns['broken_sensor'] = vi.fn().mockRejectedValue(
      new SensorConfigError('API key not configured'),
    )

    const progressCalls: Array<{ name: string; state: string; errorKind: string | null }> = []
    const onProgress = vi.fn(async (
      name: string,
      state: string,
      _count: number,
      _error: string | null,
      errorKind: 'config' | 'api' | null,
    ) => {
      progressCalls.push({ name, state, errorKind })
    })

    const config = makeConfig({ sensors_enabled: { broken_sensor: true } })
    const report = await collect(config, onProgress)
    expect(report.sources_failed).toContain('broken_sensor')

    const failCall = progressCalls.find(c => c.name === 'broken_sensor' && c.state === 'failed')
    expect(failCall).toBeDefined()
    expect(failCall!.errorKind).toBe('config')
  })

  it('regular Error produces error_kind api in progress callback', async () => {
    mockSensorFns['api_sensor'] = vi.fn().mockRejectedValue(
      new Error('HTTP 500 from source'),
    )

    const progressCalls: Array<{ name: string; state: string; errorKind: string | null }> = []
    const onProgress = vi.fn(async (
      name: string,
      state: string,
      _count: number,
      _error: string | null,
      errorKind: 'config' | 'api' | null,
    ) => {
      progressCalls.push({ name, state, errorKind })
    })

    const config = makeConfig({ sensors_enabled: { api_sensor: true } })
    const report = await collect(config, onProgress)
    expect(report.sources_failed).toContain('api_sensor')

    const failCall = progressCalls.find(c => c.name === 'api_sensor' && c.state === 'failed')
    expect(failCall).toBeDefined()
    expect(failCall!.errorKind).toBe('api')
  })

  it('successful sensor produces error_kind null in progress callback', async () => {
    mockSensorFns['good_sensor'] = vi.fn().mockResolvedValue([makeItem('1', 'good_sensor')])

    const progressCalls: Array<{ name: string; state: string; errorKind: string | null }> = []
    const onProgress = vi.fn(async (
      name: string,
      state: string,
      _count: number,
      _error: string | null,
      errorKind: 'config' | 'api' | null,
    ) => {
      progressCalls.push({ name, state, errorKind })
    })

    const config = makeConfig({ sensors_enabled: { good_sensor: true } })
    await collect(config, onProgress)

    const okCall = progressCalls.find(c => c.name === 'good_sensor' && c.state === 'ok')
    expect(okCall).toBeDefined()
    expect(okCall!.errorKind).toBeNull()
  })

  it('verifies links for X-sourced items after dedup', async () => {
    mockVerifyLink.mockResolvedValue(true)
    mockSensorFns['social_accounts'] = vi.fn().mockResolvedValue([
      { id: 'x-accounts-2026-02-19-0', source: 'x', title: 'X Post', url: 'https://x.com/post/1' },
    ])

    const config = makeConfig({ sensors_enabled: { social_accounts: true }, xai_api_key: 'key' })
    const report = await collect(config)
    expect(mockVerifyLink).toHaveBeenCalledWith('https://x.com/post/1')
    expect(report.items.social[0].verified).toBe(true)
  })

  it('sets verified=false for bad X links', async () => {
    mockVerifyLink.mockResolvedValue(false)
    mockSensorFns['social_accounts'] = vi.fn().mockResolvedValue([
      { id: 'x-accounts-2026-02-19-0', source: 'x', title: 'Bad Link', url: 'https://x.com/dead' },
    ])

    const config = makeConfig({ sensors_enabled: { social_accounts: true }, xai_api_key: 'key' })
    const report = await collect(config)
    expect(report.items.social[0].verified).toBe(false)
  })

  it('does not verify links for non-X items', async () => {
    mockVerifyLink.mockResolvedValue(true)
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([
      { id: 'hn-1', source: 'hacker_news', title: 'HN', url: 'https://example.com' },
    ])

    const config = makeConfig({ sensors_enabled: { hacker_news: true } })
    const report = await collect(config)
    expect(mockVerifyLink).not.toHaveBeenCalled()
    expect(report.items.tech_trends[0].verified).toBeUndefined()
  })

  it('enriches hn_blogs items with Jina content', async () => {
    mockFetchContent.mockResolvedValue('Full article text here')
    mockSensorFns['hn_blogs'] = vi.fn().mockResolvedValue([
      { id: 'blog-1', source: 'hn_blogs', title: 'Blog Post', url: 'https://blog.example.com/post', content: 'RSS summary' },
    ])

    const config = makeConfig({ sensors_enabled: { hn_blogs: true } })
    const report = await collect(config)
    expect(mockFetchContent).toHaveBeenCalledWith('https://blog.example.com/post')
    expect(report.items.insights[0].content).toBe('Full article text here')
  })

  it('keeps original content when Jina returns null', async () => {
    mockFetchContent.mockResolvedValue(null)
    mockSensorFns['hn_blogs'] = vi.fn().mockResolvedValue([
      { id: 'blog-1', source: 'hn_blogs', title: 'Blog Post', url: 'https://blog.example.com/post', content: 'RSS summary' },
    ])

    const config = makeConfig({ sensors_enabled: { hn_blogs: true } })
    const report = await collect(config)
    expect(report.items.insights[0].content).toBe('RSS summary')
  })
})
