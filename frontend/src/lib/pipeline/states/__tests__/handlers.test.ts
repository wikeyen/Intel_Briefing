// ABOUTME: Unit tests for pipeline state machine handlers — paused, fetch-retry, summary-retry, intelligence, briefing.
// ABOUTME: Tests each handler in isolation with a mock PipelineContext and real PipelineProgressTracker.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigSettings, IntelReport, BriefingSummary, SummaryProgress } from '../../../models'
import { defaultConfig } from '../../../models'
import type { PipelineContext, PauseAction, FailureKind } from '../../types'
import { PipelineProgressTracker } from '../../progress'
import type { SummarizeOptions } from '../../../summary/summarizer'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockFetchSensor = vi.fn()
const mockRetryOneSensor = vi.fn()
const mockMergeRetryResult = vi.fn()
const mockMergeSensorSummary = vi.fn()
vi.mock('../../helpers', () => ({
  fetchSensor: (...args: unknown[]) => mockFetchSensor(...args),
  retryOneSensor: (...args: unknown[]) => mockRetryOneSensor(...args),
  mergeRetryResult: (...args: unknown[]) => mockMergeRetryResult(...args),
  mergeSensorSummary: (...args: unknown[]) => mockMergeSensorSummary(...args),
  MAX_AUTO_RETRIES: 3,
  runIntelligence: vi.fn(),
}))

const mockWriteReport = vi.fn().mockResolvedValue(undefined)
const mockWritePipelineStatus = vi.fn().mockResolvedValue(undefined)
vi.mock('../../cache', () => ({
  writeReport: (...args: unknown[]) => mockWriteReport(...args),
  writePipelineStatus: (...args: unknown[]) => mockWritePipelineStatus(...args),
}))

const mockWriteSummaryProgress = vi.fn().mockResolvedValue(undefined)
const mockWriteSummary = vi.fn().mockResolvedValue(undefined)
const mockInvalidateAllSensorSummaries = vi.fn().mockResolvedValue(undefined)
const mockInvalidateAllSummaries = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../summary/cache', () => ({
  writeSummaryProgress: (...args: unknown[]) => mockWriteSummaryProgress(...args),
  writeSummary: (...args: unknown[]) => mockWriteSummary(...args),
  invalidateAllSensorSummaries: (...args: unknown[]) => mockInvalidateAllSensorSummaries(...args),
  invalidateAllSummaries: (...args: unknown[]) => mockInvalidateAllSummaries(...args),
}))

const mockSummarizeReport = vi.fn()
const mockSummarizeSingleSensor = vi.fn()
const mockGenerateOverallBriefing = vi.fn()
vi.mock('../../../summary/summarizer', () => ({
  summarizeReport: (...args: unknown[]) => mockSummarizeReport(...args),
  summarizeSingleSensor: (...args: unknown[]) => mockSummarizeSingleSensor(...args),
  generateOverallBriefing: (...args: unknown[]) => mockGenerateOverallBriefing(...args),
}))

vi.mock('../../../summary/events', () => ({
  createBus: vi.fn(() => ({
    isActive: true,
    emitDone: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
}))

const mockRunIntelligenceFromHelpers = vi.fn().mockResolvedValue(undefined)
// Re-mock the runIntelligence specifically imported by the intelligence handler
vi.mock('../../helpers', async (importOriginal) => {
  return {
    fetchSensor: (...args: unknown[]) => mockFetchSensor(...args),
    retryOneSensor: (...args: unknown[]) => mockRetryOneSensor(...args),
    mergeRetryResult: (...args: unknown[]) => mockMergeRetryResult(...args),
    mergeSensorSummary: (...args: unknown[]) => mockMergeSensorSummary(...args),
    MAX_AUTO_RETRIES: 3,
    runIntelligence: (...args: unknown[]) => mockRunIntelligenceFromHelpers(...args),
  }
})

const mockRunIntelligenceAnalysis = vi.fn()
vi.mock('../../intelligence', () => ({
  runIntelligenceAnalysis: (...args: unknown[]) => mockRunIntelligenceAnalysis(...args),
}))

const mockWriteIntelligence = vi.fn().mockResolvedValue(undefined)
vi.mock('../../intelligence-cache', () => ({
  writeIntelligence: (...args: unknown[]) => mockWriteIntelligence(...args),
}))

const mockWritePipelineItem = vi.fn().mockResolvedValue(undefined)
const mockReadFreshPipelineItems = vi.fn().mockResolvedValue(new Map())
const mockClearRunItems = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../db', () => ({
  writePipelineItem: (...args: unknown[]) => mockWritePipelineItem(...args),
  readFreshPipelineItems: (...args: unknown[]) => mockReadFreshPipelineItems(...args),
  clearRunItems: (...args: unknown[]) => mockClearRunItems(...args),
}))

vi.mock('../../../sensors', () => ({
  SENSOR_REGISTRY: {},
}))

vi.mock('../../../sensors/taxonomy', () => ({
  SENSOR_LABELS: {},
}))

// ── Imports under test (after mocks) ──────────────────────────────────────────

const { handlePaused } = await import('../paused')
const { handleFetchRetry } = await import('../fetch-retry')
const { handleSummaryRetry } = await import('../summary-retry')
const { handleIntelligence } = await import('../intelligence')
const { handleBriefing } = await import('../briefing')

// ── Factories ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return { ...defaultConfig(), ...overrides }
}

function makeReport(overrides: Partial<IntelReport> = {}): IntelReport {
  return {
    date: '2026-02-26',
    fetched_at: '2026-02-26T08:00:00Z',
    stale: false,
    sources_ok: [],
    sources_failed: [],
    items: {},
    ...overrides,
  }
}

function makeSummary(overrides: Partial<BriefingSummary> = {}): BriefingSummary {
  return {
    generated_at: '2026-02-26T08:00:00Z',
    report_fetched_at: '2026-02-26T08:00:00Z',
    sections: [],
    overall: {
      executive_summary: 'Test summary',
      sections: [],
      sentiment: { overall: 'neutral', confidence: 0.5, distribution: { positive: 0, negative: 0, neutral: 1 } },
    },
    ...overrides,
  }
}

function makeSummarizeOpts(): SummarizeOptions {
  return {
    llmConfig: { base_url: 'https://test.api/v1', api_key: 'test-key', model: 'test-model' },
    concurrency: 1,
  }
}

function createMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const abortController = new AbortController()
  const sensorNames = overrides.allEnabledSensors ?? overrides.sensorsToFetch ?? ['sensor_a', 'sensor_b']
  const tracker = new PipelineProgressTracker(
    overrides.trackerSensorNames ?? sensorNames,
    overrides.mode ?? 'fetch_summarize',
    overrides.concurrency ?? 4,
    overrides.summaryConcurrency ?? 2,
  )

  return {
    config: makeConfig(),
    signal: abortController.signal,
    abortController,
    mode: 'fetch_summarize',
    allEnabledSensors: sensorNames,
    sensorsToFetch: sensorNames,
    trackerSensorNames: sensorNames,
    llmConfig: null,
    concurrency: 4,
    summaryConcurrency: 2,
    isIncrementalRun: false,

    tracker,
    report: makeReport({ sources_ok: [...sensorNames], sources_failed: [] }),
    summary: null,
    cachedReport: null,
    cachedSensorItems: new Map(),
    failures: new Set<string>(),
    failureKinds: new Map<string, FailureKind>(),
    skippedSensors: new Set<string>(),
    sensorSkips: new Map(),
    skipRetries: false,
    enabledSensors: new Set(sensorNames),

    summaryStatus: null,
    summaryBus: null,
    onProgress: null,
    baseSummarizeOpts: null,

    pauseResolve: null,
    ...overrides,
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ── handlePaused ───────────────────────────────────────────────────────────────

describe('handlePaused', () => {
  it('returns cancelled when cancel action received via abort signal', async () => {
    const ctx = createMockContext({
      failures: new Set(['sensor_a']),
      failureKinds: new Map([['sensor_a', 'api']]),
    })

    // The real cancel flow: aborting the signal triggers the abort listener in the pause
    // promise, which resolves with { type: 'cancel' }. The handler then breaks and checks
    // signal.aborted to return 'cancelled'.
    const resultPromise = handlePaused(ctx)
    await vi.waitFor(() => expect(ctx.pauseResolve).not.toBeNull())
    ctx.abortController.abort()

    const result = await resultPromise
    expect(result).toBe('cancelled')
  })

  it('returns briefing when generate_overall action received', async () => {
    const ctx = createMockContext({
      failures: new Set(['sensor_a']),
      failureKinds: new Map([['sensor_a', 'api']]),
    })

    const resultPromise = handlePaused(ctx)
    await vi.waitFor(() => expect(ctx.pauseResolve).not.toBeNull())
    ctx.pauseResolve!({ type: 'generate_overall' })

    const result = await resultPromise
    expect(result).toBe('briefing')
  })

  it('removes sensor from failures on skip_sensor action', async () => {
    const ctx = createMockContext({
      failures: new Set(['sensor_a', 'sensor_b']),
      failureKinds: new Map([['sensor_a', 'api'], ['sensor_b', 'api']]),
    })

    const resultPromise = handlePaused(ctx)

    // Skip sensor_a — sensor_b remains, so loop re-pauses
    await vi.waitFor(() => expect(ctx.pauseResolve).not.toBeNull())
    ctx.pauseResolve!({ type: 'skip_sensor', sensor: 'sensor_a' })

    // After skip_sensor, failures should no longer contain sensor_a
    // Loop re-pauses because sensor_b is still failed — send generate_overall to exit
    await vi.waitFor(() => expect(ctx.pauseResolve).not.toBeNull())
    expect(ctx.failures.has('sensor_a')).toBe(false)
    expect(ctx.failures.has('sensor_b')).toBe(true)

    ctx.pauseResolve!({ type: 'generate_overall' })
    const result = await resultPromise
    expect(result).toBe('briefing')
  })

  it('returns briefing when all failures are resolved via skip (loop exits naturally)', async () => {
    const ctx = createMockContext({
      failures: new Set(['sensor_a']),
      failureKinds: new Map([['sensor_a', 'api']]),
    })

    const resultPromise = handlePaused(ctx)
    await vi.waitFor(() => expect(ctx.pauseResolve).not.toBeNull())

    // Skip the only failed sensor — loop condition (failures.size > 0) becomes false
    ctx.pauseResolve!({ type: 'skip_sensor', sensor: 'sensor_a' })

    const result = await resultPromise
    expect(result).toBe('briefing')
    expect(ctx.failures.size).toBe(0)
  })
})

// ── handleFetchRetry ───────────────────────────────────────────────────────────

describe('handleFetchRetry', () => {
  it('returns summarizing when no failures exist (nothing to retry)', async () => {
    const ctx = createMockContext({
      failures: new Set(),
      failureKinds: new Map(),
    })

    const result = await handleFetchRetry(ctx)
    expect(result).toBe('summarizing')
    // fetchSensor should never be called when there are no failures
    expect(mockFetchSensor).not.toHaveBeenCalled()
  })

  it('retries failed sensors and returns summarizing when all recover', async () => {
    const ctx = createMockContext({
      failures: new Set(['sensor_a']),
      failureKinds: new Map([['sensor_a', 'api']]),
      report: makeReport({ sources_ok: ['sensor_b'], sources_failed: ['sensor_a'] }),
    })

    // First retry succeeds
    mockFetchSensor.mockResolvedValueOnce({
      sensor_name: 'sensor_a',
      items: [{ id: 'a1', source: 'sensor_a', title: 'Item A1', url: 'https://example.com/a1' }],
      error: null,
      error_kind: null,
    })

    const result = await handleFetchRetry(ctx)
    expect(result).toBe('summarizing')
    expect(ctx.failures.has('sensor_a')).toBe(false)
    expect(mockFetchSensor).toHaveBeenCalledTimes(1)
  })

  it('returns summarizing even with remaining failures', async () => {
    const ctx = createMockContext({
      failures: new Set(['sensor_a']),
      failureKinds: new Map([['sensor_a', 'api']]),
      report: makeReport({ sources_ok: ['sensor_b'], sources_failed: ['sensor_a'] }),
    })

    // All retries fail
    mockFetchSensor.mockResolvedValue({
      sensor_name: 'sensor_a',
      items: [],
      error: 'still failing',
      error_kind: 'api',
    })

    const result = await handleFetchRetry(ctx)
    expect(result).toBe('summarizing')
    // 3 retries (MAX_AUTO_RETRIES)
    expect(mockFetchSensor).toHaveBeenCalledTimes(3)
    expect(ctx.failures.has('sensor_a')).toBe(true)
  })
})

// ── handleSummaryRetry ─────────────────────────────────────────────────────────

describe('handleSummaryRetry', () => {
  it('returns paused when summary retries exhausted with persistent failures', async () => {
    const sensorNames = ['sensor_a', 'sensor_b']
    const ctx = createMockContext({
      allEnabledSensors: sensorNames,
      sensorsToFetch: sensorNames,
      trackerSensorNames: sensorNames,
      failures: new Set(),
      failureKinds: new Map(),
      report: makeReport({ sources_ok: sensorNames }),
      baseSummarizeOpts: makeSummarizeOpts(),
    })

    // Put sensor_a into 'failed' summary state in the tracker
    ctx.tracker.setSummaryState('sensor_a', 'failed', 'LLM error')

    // The handler resets failed sensors to 'queued' before each summarizeReport call.
    // To simulate persistent failure, the mock must set the sensor back to 'failed'
    // during the call — mimicking a real summarizeReport that fails for this sensor.
    mockSummarizeReport.mockImplementation(async () => {
      ctx.tracker.setSummaryState('sensor_a', 'failed', 'LLM error')
      return makeSummary()
    })

    const result = await handleSummaryRetry(ctx)
    expect(result).toBe('paused')
    // Should have attempted MAX_AUTO_RETRIES (3) times
    expect(mockSummarizeReport).toHaveBeenCalledTimes(3)
  })

  it('returns briefing when all summaries recover', async () => {
    const sensorNames = ['sensor_a', 'sensor_b']
    const ctx = createMockContext({
      allEnabledSensors: sensorNames,
      sensorsToFetch: sensorNames,
      trackerSensorNames: sensorNames,
      failures: new Set(),
      failureKinds: new Map(),
      report: makeReport({ sources_ok: sensorNames }),
      baseSummarizeOpts: makeSummarizeOpts(),
    })

    // Put sensor_a into 'failed' summary state
    ctx.tracker.setSummaryState('sensor_a', 'failed', 'LLM error')

    // On the first summarizeReport call, fix the tracker state to simulate recovery
    mockSummarizeReport.mockImplementationOnce(async () => {
      ctx.tracker.setSummaryState('sensor_a', 'ok')
      return makeSummary()
    })

    const result = await handleSummaryRetry(ctx)
    expect(result).toBe('briefing')
    // Only 1 attempt needed since recovery happened on first try
    expect(mockSummarizeReport).toHaveBeenCalledTimes(1)
  })
})

// ── handleIntelligence ─────────────────────────────────────────────────────────

describe('handleIntelligence', () => {
  it('returns complete always', async () => {
    const ctx = createMockContext()

    const result = await handleIntelligence(ctx)
    expect(result).toBe('complete')
  })

  it('calls runIntelligence when llmConfig is set', async () => {
    const llmConfig = { base_url: 'https://test.api/v1', api_key: 'test-key', model: 'test-model' }
    const report = makeReport({ sources_ok: ['sensor_a'] })
    const ctx = createMockContext({
      llmConfig,
      report,
      config: makeConfig({ summary_language: 'en' }),
    })

    await handleIntelligence(ctx)
    expect(mockRunIntelligenceFromHelpers).toHaveBeenCalledWith(
      report,
      llmConfig,
      ctx.signal,
      'en',
      ctx.tracker,
    )
  })
})

// ── handleBriefing ─────────────────────────────────────────────────────────────

describe('handleBriefing', () => {
  it('returns intelligence always', async () => {
    const ctx = createMockContext()

    const result = await handleBriefing(ctx)
    expect(result).toBe('intelligence')
  })

  it('skips briefing generation when no summary exists', async () => {
    const ctx = createMockContext({
      summary: null,
      failures: new Set(['sensor_a']),
    })

    const result = await handleBriefing(ctx)
    expect(result).toBe('intelligence')
    expect(mockGenerateOverallBriefing).not.toHaveBeenCalled()
    expect(mockWriteSummary).not.toHaveBeenCalled()
  })

  it('generates overall briefing when fetch failures exist and summary is present', async () => {
    const summary = makeSummary()
    const report = makeReport({ sources_ok: ['sensor_b'], sources_failed: ['sensor_a'] })
    const opts = makeSummarizeOpts()
    const overallResult = {
      executive_summary: 'Generated overall',
      sections: [],
      sentiment: { overall: 'neutral' as const, confidence: 0.5, distribution: { positive: 0, negative: 0, neutral: 1 } },
    }
    mockGenerateOverallBriefing.mockResolvedValueOnce(overallResult)

    const ctx = createMockContext({
      summary,
      report,
      failures: new Set(['sensor_a']),
      failureKinds: new Map([['sensor_a', 'api']]),
      baseSummarizeOpts: opts,
    })

    const result = await handleBriefing(ctx)
    expect(result).toBe('intelligence')
    expect(mockGenerateOverallBriefing).toHaveBeenCalledWith(report, summary.sections, opts)
    expect(ctx.summary!.overall).toBe(overallResult)
    expect(mockWriteSummary).toHaveBeenCalled()
  })

  it('writes summary without generating overall when no fetch failures', async () => {
    const summary = makeSummary()
    const ctx = createMockContext({
      summary,
      failures: new Set(),
    })

    const result = await handleBriefing(ctx)
    expect(result).toBe('intelligence')
    // No fetch failures → no overall generation needed (it was done in the summarize stage)
    expect(mockGenerateOverallBriefing).not.toHaveBeenCalled()
    // Summary should still be written
    expect(mockWriteSummary).toHaveBeenCalledWith(summary, ctx.config.summary_language)
  })
})
