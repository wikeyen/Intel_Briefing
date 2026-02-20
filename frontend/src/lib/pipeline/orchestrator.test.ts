// ABOUTME: Tests for the pipeline orchestrator — validates run modes, concurrency, and progress.
// ABOUTME: Uses mocked sensors and LLM to test fetch-only, summarize-only, and combined modes.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings, IntelItem, IntelReport } from '../models'
import { defaultConfig } from '../models'
import { SensorConfigError } from '../sensors/errors'

// Mock all external dependencies
const mockWriteReport = vi.fn().mockResolvedValue(undefined)
const mockReadReport = vi.fn<() => Promise<IntelReport | null>>().mockResolvedValue(null)
const mockWritePipelineStatus = vi.fn().mockResolvedValue(undefined)
vi.mock('./cache', () => ({
  writeReport: (...args: unknown[]) => mockWriteReport(...args),
  readReport: (...args: unknown[]) => mockReadReport(...args),
  writePipelineStatus: (...args: unknown[]) => mockWritePipelineStatus(...args),
  readPipelineStatus: vi.fn(),
  isStale: vi.fn(),
}))

const mockWriteSummary = vi.fn().mockResolvedValue(undefined)
vi.mock('../summary/cache', () => ({
  writeSummary: (...args: unknown[]) => mockWriteSummary(...args),
  writeSummaryProgress: vi.fn(),
  readSummary: vi.fn(),
  readSummaryProgress: vi.fn(),
}))

const mockChatCompletion = vi.fn().mockResolvedValue('Summary text')
vi.mock('../summary/llm', () => ({
  chatCompletion: (...args: unknown[]) => mockChatCompletion(...args),
}))

vi.mock('../utils/verifier', () => ({
  verifyLink: vi.fn().mockResolvedValue(true),
}))
vi.mock('../utils/jina-reader', () => ({
  fetchContent: vi.fn().mockResolvedValue(null),
}))

// Mock sensor registry with a Proxy to allow dynamic sensor functions
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

const { runPipeline } = await import('./orchestrator')

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

function makeItem(id: string, source: string): IntelItem {
  return { id, source, title: `Item ${id}`, url: `https://example.com/${id}` }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(mockSensorFns)) delete mockSensorFns[key]
})

describe('runPipeline', () => {
  it('fetch mode: fetches sensors, builds report, skips summaries', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])
    mockSensorFns['arxiv'] = vi.fn().mockResolvedValue([makeItem('ax1', 'arxiv')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true, arxiv: true },
      fetch_concurrency: 2,
      summary_concurrency: 2,
    })

    const result = await runPipeline(config, 'fetch')
    expect(result.report).toBeDefined()
    expect(result.report!.sources_ok).toContain('hacker_news')
    expect(result.summary).toBeNull()
    expect(mockChatCompletion).not.toHaveBeenCalled()
  })

  it('summarize mode: skips fetching, summarizes cached report', async () => {
    const cachedReport: IntelReport = {
      date: '2026-02-20',
      fetched_at: '2026-02-20T08:00:00Z',
      stale: false,
      sources_ok: ['hacker_news'],
      sources_failed: [],
      items: {
        tech: [makeItem('hn1', 'hacker_news')],
        research: [], finance: [], products: [],
        community: [], social: [], insights: [], feeds: [],
      },
    }
    mockReadReport.mockResolvedValue(cachedReport)

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      fetch_concurrency: 2,
      summary_concurrency: 2,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'summarize')
    expect(result.report).toBeNull()
    expect(result.summary).toBeDefined()
    expect(mockChatCompletion).toHaveBeenCalled()
  })

  it('fetch_summarize mode: fetches then summarizes', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      fetch_concurrency: 2,
      summary_concurrency: 2,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.report).toBeDefined()
    expect(result.summary).toBeDefined()
    expect(mockChatCompletion).toHaveBeenCalled()
  })

  it('respects concurrency limit', async () => {
    let active = 0
    let maxActive = 0

    const slowSensor = vi.fn().mockImplementation(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 30))
      active--
      return [makeItem('1', 'slow')]
    })

    mockSensorFns['s1'] = slowSensor
    mockSensorFns['s2'] = slowSensor
    mockSensorFns['s3'] = slowSensor
    mockSensorFns['s4'] = slowSensor
    mockSensorFns['s5'] = slowSensor

    const config = makeConfig({
      sensors_enabled: { s1: true, s2: true, s3: true, s4: true, s5: true },
      fetch_concurrency: 2,
      summary_concurrency: 2,
    })

    await runPipeline(config, 'fetch')
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('sensor failure does not block other sensors', async () => {
    mockSensorFns['good'] = vi.fn().mockResolvedValue([makeItem('g1', 'good')])
    mockSensorFns['bad'] = vi.fn().mockRejectedValue(new Error('boom'))

    const config = makeConfig({
      sensors_enabled: { good: true, bad: true },
      fetch_concurrency: 4,
      summary_concurrency: 4,
    })

    const result = await runPipeline(config, 'fetch')
    expect(result.report!.sources_ok).toContain('good')
    expect(result.report!.sources_failed).toContain('bad')
  })

  it('SensorConfigError sets error_kind to config', async () => {
    mockSensorFns['broken'] = vi.fn().mockRejectedValue(
      new SensorConfigError('Missing API key'),
    )

    const config = makeConfig({
      sensors_enabled: { broken: true },
      fetch_concurrency: 4,
      summary_concurrency: 4,
    })

    const result = await runPipeline(config, 'fetch')
    const lastStatus = mockWritePipelineStatus.mock.calls.at(-1)?.[0]
    const sensor = lastStatus?.sensors.find((s: { name: string }) => s.name === 'broken')
    expect(sensor?.fetch_error_kind).toBe('config')
  })

  it('uses map-reduce when sensor has more items than CHUNK_SIZE', async () => {
    // Create 25 items — should trigger map-reduce (CHUNK_SIZE=12 → 3 chunks)
    const items = Array.from({ length: 25 }, (_, i) => makeItem(`hn${i}`, 'hacker_news'))
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue(items)

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      fetch_concurrency: 4,
      summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.summary).toBeDefined()
    // Map phase: 3 chunk extraction calls + reduce phase: 1 merge call + overall: 1 = 5
    expect(mockChatCompletion.mock.calls.length).toBe(5)
  })

  it('uses single-pass when items fit in one chunk', async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(`hn${i}`, 'hacker_news'))
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue(items)

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      fetch_concurrency: 4,
      summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.summary).toBeDefined()
    // Single-pass: 1 sensor summary + 1 overall = 2
    expect(mockChatCompletion.mock.calls.length).toBe(2)
  })

  it('writes pipeline status on progress changes', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      fetch_concurrency: 4,
      summary_concurrency: 4,
    })

    await runPipeline(config, 'fetch')
    expect(mockWritePipelineStatus.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('failed sensor is excluded from summary stage', async () => {
    mockSensorFns['good'] = vi.fn().mockResolvedValue([makeItem('g1', 'good')])
    mockSensorFns['bad'] = vi.fn().mockRejectedValue(new Error('timeout'))

    const config = makeConfig({
      sensors_enabled: { good: true, bad: true },
      fetch_concurrency: 4,
      summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.report!.sources_failed).toContain('bad')

    // Only "good" sensor should be summarized (1 sensor + 1 overall = 2 LLM calls)
    expect(mockChatCompletion.mock.calls.length).toBe(2)

    // Verify failed sensor is marked as 'skipped' in summary progress
    const lastStatus = mockWritePipelineStatus.mock.calls.at(-1)?.[0]
    const badSensor = lastStatus?.sensors.find((s: { name: string }) => s.name === 'bad')
    expect(badSensor?.summary).toBe('skipped')
    expect(badSensor?.fetch).toBe('failed')
  })

  it('uses separate concurrency for fetch and summary stages', async () => {
    let fetchActive = 0
    let maxFetchActive = 0
    const slowFetch = vi.fn().mockImplementation(async () => {
      fetchActive++
      maxFetchActive = Math.max(maxFetchActive, fetchActive)
      await new Promise(r => setTimeout(r, 20))
      fetchActive--
      return [makeItem('1', 'slow')]
    })

    mockSensorFns['s1'] = slowFetch
    mockSensorFns['s2'] = slowFetch
    mockSensorFns['s3'] = slowFetch
    mockSensorFns['s4'] = slowFetch

    const config = makeConfig({
      sensors_enabled: { s1: true, s2: true, s3: true, s4: true },
      fetch_concurrency: 2,
      summary_concurrency: 3,
    })

    await runPipeline(config, 'fetch')
    expect(maxFetchActive).toBeLessThanOrEqual(2)

    // Verify status snapshot reflects both concurrency values
    const lastStatus = mockWritePipelineStatus.mock.calls.at(-1)?.[0]
    expect(lastStatus?.fetch_concurrency).toBe(2)
    expect(lastStatus?.summary_concurrency).toBe(3)
  })
})
