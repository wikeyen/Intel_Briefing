// ABOUTME: Unit tests for the Redis-backed cache in pipeline/cache.ts.
// ABOUTME: Covers write/read round-trip, staleness detection, and pipeline status.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IntelReport, PipelineStatus } from '../models'
import { createReport } from '../models'
import { isStale } from './cache'

// Mock @upstash/redis
const mockSet = vi.fn()
const mockGet = vi.fn()
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockSet,
    get: mockGet,
  })),
}))

// Import after mock setup
const { writeReport, readReport, writePipelineStatus, readPipelineStatus } = await import('./cache')

function makeReport(fetchedAt = '2026-01-01T07:00:00+00:00'): IntelReport {
  return createReport({ date: '2026-01-01', fetched_at: fetchedAt })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('writeReport', () => {
  it('writes to Redis with TTL', async () => {
    const report = makeReport()
    await writeReport(report)
    expect(mockSet).toHaveBeenCalledWith(
      'intel:latest',
      report,
      { ex: 48 * 60 * 60 },
    )
  })
})

describe('readReport', () => {
  it('returns report when data exists', async () => {
    const report = makeReport()
    mockGet.mockResolvedValue(report)
    const result = await readReport()
    expect(result).toEqual(report)
  })

  it('returns null when no data', async () => {
    mockGet.mockResolvedValue(null)
    const result = await readReport()
    expect(result).toBeNull()
  })

  it('returns null on error', async () => {
    mockGet.mockRejectedValue(new Error('connection failed'))
    const result = await readReport()
    expect(result).toBeNull()
  })
})

describe('isStale', () => {
  it('fresh report is not stale', () => {
    const now = new Date().toISOString()
    const report = makeReport(now)
    expect(isStale(report, 6)).toBe(false)
  })

  it('old report is stale', () => {
    const old = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString()
    const report = makeReport(old)
    expect(isStale(report, 6)).toBe(true)
  })

  it('boundary case exactly at TTL', () => {
    const atTtl = new Date(Date.now() - (6 * 60 * 60 + 1) * 1000).toISOString()
    const report = makeReport(atTtl)
    expect(isStale(report, 6)).toBe(true)
  })

  it('invalid fetched_at returns true', () => {
    const report = makeReport('not-a-timestamp')
    expect(isStale(report)).toBe(true)
  })

  it('custom TTL works', () => {
    const oneHourAgo = new Date(Date.now() - 65 * 60 * 1000).toISOString()
    const report = makeReport(oneHourAgo)
    expect(isStale(report, 1)).toBe(true)
    expect(isStale(report, 2)).toBe(false)
  })
})

describe('writePipelineStatus', () => {
  it('writes status to Redis with 1h TTL', async () => {
    const status: PipelineStatus = {
      running: true,
      started_at: '2026-01-01T07:00:00Z',
      completed_at: null,
      sensors: [],
      total_items: 0,
    }
    await writePipelineStatus(status)
    expect(mockSet).toHaveBeenCalledWith(
      'intel:pipeline_status',
      status,
      { ex: 60 * 60 },
    )
  })
})

describe('readPipelineStatus', () => {
  it('returns status when data exists', async () => {
    const status: PipelineStatus = {
      running: false,
      started_at: '2026-01-01T07:00:00Z',
      completed_at: '2026-01-01T07:01:00Z',
      sensors: [],
      total_items: 5,
    }
    mockGet.mockResolvedValue(status)
    const result = await readPipelineStatus()
    expect(result).toEqual(status)
  })

  it('returns null when no data', async () => {
    mockGet.mockResolvedValue(null)
    const result = await readPipelineStatus()
    expect(result).toBeNull()
  })
})
