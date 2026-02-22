// ABOUTME: Tests for the pipeline orchestrator — validates run modes, concurrency, and progress.
// ABOUTME: Uses mocked sensors and LLM to test fetch-only, summarize-only, and combined modes.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings, IntelItem, IntelReport } from '../models'
import { defaultConfig } from '../models'
import { SensorConfigError } from '../sensors/errors'

// Mock all external dependencies
const mockWriteReport = vi.fn().mockResolvedValue(undefined)
const mockReadReport = vi.fn<(...args: unknown[]) => Promise<IntelReport | null>>().mockResolvedValue(null)
const mockWritePipelineStatus = vi.fn().mockResolvedValue(undefined)
vi.mock('./cache', () => ({
  writeReport: (...args: unknown[]) => mockWriteReport(...args),
  readReport: (...args: unknown[]) => mockReadReport(...args),
  writePipelineStatus: (...args: unknown[]) => mockWritePipelineStatus(...args),
  readPipelineStatus: vi.fn(),
  isStale: vi.fn(),
}))

const mockWriteSummary = vi.fn().mockResolvedValue(undefined)
const mockInvalidateAllSensorSummaries = vi.fn().mockResolvedValue(undefined)
vi.mock('../summary/cache', () => ({
  writeSummary: (...args: unknown[]) => mockWriteSummary(...args),
  writeSummaryProgress: vi.fn().mockResolvedValue(undefined),
  readSummary: vi.fn(),
  readSummaryProgress: vi.fn(),
  readSensorSummary: vi.fn().mockResolvedValue(null),
  writeSensorSummary: vi.fn().mockResolvedValue(undefined),
  invalidateSensorSummary: vi.fn().mockResolvedValue(undefined),
  invalidateAllSensorSummaries: (...args: unknown[]) => mockInvalidateAllSensorSummaries(...args),
}))

const mockChatCompletion = vi.fn().mockResolvedValue('Summary text')
const mockChatCompletionStream = vi.fn().mockReturnValue({
  tokens: (async function* () { yield 'Summary text' })(),
  fullText: Promise.resolve('Summary text'),
})
vi.mock('../summary/llm', () => ({
  chatCompletion: (...args: unknown[]) => mockChatCompletion(...args),
  chatCompletionStream: (...args: unknown[]) => mockChatCompletionStream(...args),
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

const { runPipeline, cancelPipeline, isPipelineRunning, skipPipelineRetries } = await import('./orchestrator')

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

function makeItem(id: string, source: string): IntelItem {
  return { id, source, title: `Item ${id}`, url: `https://example.com/${id}` }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(mockSensorFns)) delete mockSensorFns[key]
  // Clear globalThis pipeline state to prevent leaks between tests
  const g = globalThis as unknown as {
    __pipelineAbortController?: unknown
    __pipelineTracker?: unknown
  }
  g.__pipelineAbortController = null
  g.__pipelineTracker = null
  ;(globalThis as unknown as { __pipelineSkipRetries?: boolean }).__pipelineSkipRetries = false
})

describe('runPipeline', () => {
  it('fetch mode: fetches sensors, builds report, skips summaries', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])
    mockSensorFns['arxiv'] = vi.fn().mockResolvedValue([makeItem('ax1', 'arxiv')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true, arxiv: true },
      default_concurrency: 2,
      local_summary_concurrency: 2,
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
      default_concurrency: 2,
      local_summary_concurrency: 2,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'summarize')
    expect(result.report).toBeNull()
    expect(result.summary).toBeDefined()
    // With onToken wired, the orchestrator uses chatCompletionStream via summarizeWithVerification
    expect(mockChatCompletionStream).toHaveBeenCalled()
  })

  it('fetch_summarize mode: fetches then summarizes', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      default_concurrency: 2,
      local_summary_concurrency: 2,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.report).toBeDefined()
    expect(result.summary).toBeDefined()
    // With onToken wired, the orchestrator uses chatCompletionStream via summarizeWithVerification
    expect(mockChatCompletionStream).toHaveBeenCalled()
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
      default_concurrency: 2,
      local_summary_concurrency: 2,
    })

    await runPipeline(config, 'fetch')
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('sensor failure does not block other sensors', async () => {
    mockSensorFns['good'] = vi.fn().mockResolvedValue([makeItem('g1', 'good')])
    mockSensorFns['bad'] = vi.fn().mockRejectedValue(new Error('boom'))

    const config = makeConfig({
      sensors_enabled: { good: true, bad: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
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
      default_concurrency: 4,
      local_summary_concurrency: 4,
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
      default_concurrency: 4,
      local_summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.summary).toBeDefined()
    // Map phase: 3 chunk extraction calls use chatCompletion directly
    expect(mockChatCompletion.mock.calls.length).toBe(3)
    // Reduce phase (sensor synthesis) + overall = 2 calls via chatCompletionStream
    expect(mockChatCompletionStream.mock.calls.length).toBe(2)
  })

  it('uses single-pass when items fit in one chunk', async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(`hn${i}`, 'hacker_news'))
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue(items)

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.summary).toBeDefined()
    // Single-pass: no chunk extractions via chatCompletion
    expect(mockChatCompletion.mock.calls.length).toBe(0)
    // Sensor synthesis + overall = 2 calls via chatCompletionStream
    expect(mockChatCompletionStream.mock.calls.length).toBe(2)
  })

  it('writes pipeline status on progress changes', async () => {
    mockSensorFns['hacker_news'] = vi.fn().mockResolvedValue([makeItem('hn1', 'hacker_news')])

    const config = makeConfig({
      sensors_enabled: { hacker_news: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
    })

    await runPipeline(config, 'fetch')
    expect(mockWritePipelineStatus.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('failed sensor is excluded from summary stage after auto-retries', async () => {
    mockSensorFns['good'] = vi.fn().mockResolvedValue([makeItem('g1', 'good')])
    mockSensorFns['bad'] = vi.fn().mockRejectedValue(new Error('timeout'))

    const config = makeConfig({
      sensors_enabled: { good: true, bad: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    // fetch_summarize with failures auto-retries then proceeds to summary
    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.report!.sources_failed).toContain('bad')

    // "bad" sensor: 1 initial + 3 auto-retries = 4 total calls
    expect(mockSensorFns['bad']).toHaveBeenCalledTimes(4)

    // Only "good" sensor should be summarized (1 sensor + 1 overall = 2 LLM calls via streaming)
    expect(mockChatCompletionStream.mock.calls.length).toBe(2)

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
      default_concurrency: 2,
      local_summary_concurrency: 3,
    })

    await runPipeline(config, 'fetch')
    expect(maxFetchActive).toBeLessThanOrEqual(2)

    // Verify status snapshot reflects both concurrency values
    const lastStatus = mockWritePipelineStatus.mock.calls.at(-1)?.[0]
    expect(lastStatus?.default_concurrency).toBe(2)
    expect(lastStatus?.local_summary_concurrency).toBe(3)
  })
})

describe('pipeline auto-retry', () => {
  it('auto-retries failed sensors and proceeds to summary', async () => {
    mockSensorFns['good'] = vi.fn().mockResolvedValue([makeItem('g1', 'good')])
    mockSensorFns['bad'] = vi.fn().mockRejectedValue(new Error('network timeout'))

    const config = makeConfig({
      sensors_enabled: { good: true, bad: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    // Pipeline auto-retries 3 times then proceeds to summary — no pause
    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.report).toBeDefined()
    expect(result.report!.sources_ok).toContain('good')
    expect(result.report!.sources_failed).toContain('bad')
    // Summary should have been generated (with 'good' sensor only)
    expect(result.summary).toBeDefined()
    // 'bad' sensor: 1 initial + 3 retries = 4 calls
    expect(mockSensorFns['bad']).toHaveBeenCalledTimes(4)
  })

  it('does not retry in fetch-only mode', async () => {
    mockSensorFns['good'] = vi.fn().mockResolvedValue([makeItem('g1', 'good')])
    mockSensorFns['bad'] = vi.fn().mockRejectedValue(new Error('timeout'))

    const config = makeConfig({
      sensors_enabled: { good: true, bad: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
    })

    const result = await runPipeline(config, 'fetch')
    expect(result.report).toBeDefined()
    // fetch-only mode: no retries (no summary stage to justify retrying)
    expect(mockSensorFns['bad']).toHaveBeenCalledTimes(1)
  })

  it('auto-retry recovers flaky sensor on second attempt', async () => {
    let callCount = 0
    mockSensorFns['flaky'] = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) throw new Error('first try fails')
      return [makeItem('f1', 'flaky')]
    })
    mockSensorFns['good'] = vi.fn().mockResolvedValue([makeItem('g1', 'good')])

    const config = makeConfig({
      sensors_enabled: { flaky: true, good: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.report).toBeDefined()
    expect(result.report!.sources_ok).toContain('flaky')
    expect(result.report!.sources_ok).toContain('good')
    // flaky sensor: 1 initial fail + 1 auto-retry success = 2 calls
    expect(callCount).toBe(2)
  })

  it('skip-retries flag causes auto-retry to stop early', async () => {
    let callCount = 0
    mockSensorFns['bad'] = vi.fn().mockImplementation(async () => {
      callCount++
      // During first retry (call #2), set the skip flag (simulates user clicking "Skip")
      if (callCount === 2) {
        ;(globalThis as unknown as { __pipelineSkipRetries: boolean }).__pipelineSkipRetries = true
      }
      throw new Error('always fails')
    })

    const config = makeConfig({
      sensors_enabled: { bad: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    expect(result.report).toBeDefined()
    // 1 initial + 1 retry (flag set during this one) = 2 calls
    // The flag is checked at the START of the next iteration, so attempt 2 is skipped
    expect(callCount).toBe(2)
  })

  it('does not retry config errors', async () => {
    mockSensorFns['misconfigured'] = vi.fn().mockRejectedValue(
      new SensorConfigError('Missing API key'),
    )
    mockSensorFns['good'] = vi.fn().mockResolvedValue([makeItem('g1', 'good')])

    const config = makeConfig({
      sensors_enabled: { misconfigured: true, good: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const result = await runPipeline(config, 'fetch_summarize')
    // Config errors are not retryable — only called once
    expect(mockSensorFns['misconfigured']).toHaveBeenCalledTimes(1)
    expect(result.report!.sources_failed).toContain('misconfigured')
    expect(result.summary).toBeDefined()
  })

  it('skipPipelineRetries returns false when not running', () => {
    expect(skipPipelineRetries()).toBe(false)
  })
})

describe('cancelPipeline', () => {
  it('returns false when no pipeline is running', () => {
    expect(cancelPipeline()).toBe(false)
  })

  it('returns true and aborts a running pipeline', async () => {
    // Use a slow sensor so we can cancel mid-flight
    let resolveSlowSensor: (() => void) | null = null
    mockSensorFns['slow'] = vi.fn().mockImplementation(() =>
      new Promise<IntelItem[]>(resolve => {
        resolveSlowSensor = () => resolve([makeItem('s1', 'slow')])
      }),
    )

    const config = makeConfig({
      sensors_enabled: { slow: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
    })

    // Start pipeline — don't await, it will block on the slow sensor
    const pipelinePromise = runPipeline(config, 'fetch')

    // Wait for the sensor to start
    await vi.waitFor(() => expect(resolveSlowSensor).not.toBeNull())

    // Verify pipeline is running
    expect(isPipelineRunning()).toBe(true)

    // Cancel it
    const cancelled = cancelPipeline()
    expect(cancelled).toBe(true)
    expect(isPipelineRunning()).toBe(false)

    // Resolve the slow sensor so the pipeline finishes
    resolveSlowSensor!()
    const result = await pipelinePromise

    // Pipeline should return partial results (the slow sensor resolved after abort,
    // but the report may or may not contain its results depending on timing)
    expect(result.summary).toBeNull()

    // Verify the final status was written with cancelled state
    const lastStatus = mockWritePipelineStatus.mock.calls.at(-1)?.[0]
    expect(lastStatus?.cancelled).toBe(true)
  })

  it('cancel during auto-retry aborts remaining retries', async () => {
    let callCount = 0
    // Slow sensor that always fails — gives us time to cancel
    mockSensorFns['slow_bad'] = vi.fn().mockImplementation(async () => {
      callCount++
      await new Promise(r => setTimeout(r, 50))
      throw new Error('always fails')
    })

    const config = makeConfig({
      sensors_enabled: { slow_bad: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
      summary_provider: 'openrouter',
      summary_api_key: 'key',
      summary_base_url: 'https://openrouter.ai/api/v1',
      summary_model: 'model',
    })

    const pipelinePromise = runPipeline(config, 'fetch_summarize')

    // Wait for first attempt to complete and retry to start
    await vi.waitFor(() => expect(callCount).toBeGreaterThanOrEqual(2))

    // Cancel mid-retry
    cancelPipeline()
    const result = await pipelinePromise
    expect(result.summary).toBeNull() // cancelled before summary

    // Should have fewer calls than the full 1+3=4 retries
    expect(callCount).toBeLessThan(4)
  })

  it('allows a new run after cancel', async () => {
    // First run: cancel it
    let resolveSensor: (() => void) | null = null
    mockSensorFns['s1'] = vi.fn().mockImplementation(() =>
      new Promise<IntelItem[]>(resolve => {
        resolveSensor = () => resolve([makeItem('1', 's1')])
      }),
    )

    const config = makeConfig({
      sensors_enabled: { s1: true },
      default_concurrency: 4,
      local_summary_concurrency: 4,
    })

    const firstRun = runPipeline(config, 'fetch')
    await vi.waitFor(() => expect(resolveSensor).not.toBeNull())
    cancelPipeline()
    resolveSensor!()
    await firstRun

    // Second run: should complete normally
    resolveSensor = null
    mockSensorFns['s1'] = vi.fn().mockResolvedValue([makeItem('1', 's1')])
    const result = await runPipeline(config, 'fetch')
    expect(result.report).toBeDefined()
    expect(result.report!.sources_ok).toContain('s1')
  })
})
