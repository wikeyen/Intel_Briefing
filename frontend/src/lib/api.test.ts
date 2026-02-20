// ABOUTME: Integration tests for Next.js API route handlers.
// ABOUTME: Covers all endpoints: health, fetch, intel/latest, intel/{section}, briefing, config, cron.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { IntelItem, IntelReport, ConfigSettings, PipelineStatus } from './models'
import { createReport, defaultConfig, emptyItemsMap } from './models'

// Mock SQLite cache modules
const mockReadReport = vi.fn()
const mockWriteReport = vi.fn()
const mockIsStale = vi.fn()
const mockReadPipelineStatus = vi.fn()
const mockWritePipelineStatus = vi.fn()
const mockLoadConfig = vi.fn()
const mockSaveConfig = vi.fn()
const mockMaskConfig = vi.fn()
const mockRunPipeline = vi.fn()

vi.mock('./pipeline/cache', () => ({
  readReport: (...args: unknown[]) => mockReadReport(...args),
  writeReport: (...args: unknown[]) => mockWriteReport(...args),
  isStale: (...args: unknown[]) => mockIsStale(...args),
  readPipelineStatus: (...args: unknown[]) => mockReadPipelineStatus(...args),
  writePipelineStatus: (...args: unknown[]) => mockWritePipelineStatus(...args),
}))

vi.mock('./config', () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
  saveConfig: (...args: unknown[]) => mockSaveConfig(...args),
  maskConfig: (...args: unknown[]) => mockMaskConfig(...args),
}))

vi.mock('./pipeline/orchestrator', () => ({
  runPipeline: (...args: unknown[]) => mockRunPipeline(...args),
}))

function makeReport(overrides: Partial<IntelReport> = {}): IntelReport {
  return createReport({
    date: '2026-01-01',
    fetched_at: '2026-01-01T07:00:00+00:00',
    ...overrides,
  })
}

function makeItem(id: string, title: string): IntelItem {
  return { id, source: 'hn', title, url: `https://example.com/${id}` }
}

const freshConfig = defaultConfig()

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadConfig.mockResolvedValue(freshConfig)
  mockMaskConfig.mockImplementation((c: ConfigSettings) => ({ ...c }))
})

describe('GET /api/health', () => {
  it('returns no_data when cache missing', async () => {
    mockReadReport.mockResolvedValue(null)
    const { GET } = await import('@/app/api/health/route')
    const resp = await GET()
    const data = await resp.json()
    expect(resp.status).toBe(200)
    expect(data.status).toBe('no_data')
    expect(data.last_fetch).toBeNull()
  })

  it('returns ok with fresh cache', async () => {
    const report = makeReport({ fetched_at: new Date().toISOString() })
    mockReadReport.mockResolvedValue(report)
    mockIsStale.mockReturnValue(false)
    const { GET } = await import('@/app/api/health/route')
    const resp = await GET()
    const data = await resp.json()
    expect(data.status).toBe('ok')
  })

  it('returns stale when cache old', async () => {
    mockReadReport.mockResolvedValue(makeReport())
    mockIsStale.mockReturnValue(true)
    const { GET } = await import('@/app/api/health/route')
    const resp = await GET()
    const data = await resp.json()
    expect(data.status).toBe('stale')
  })
})

describe('POST /api/fetch', () => {
  it('returns 202 accepted with default mode', async () => {
    mockRunPipeline.mockResolvedValue({ report: makeReport(), summary: null })
    const { POST } = await import('@/app/api/fetch/route')
    const req = new NextRequest('http://localhost/api/fetch', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const resp = await POST(req)
    expect(resp.status).toBe(202)
    const data = await resp.json()
    expect(data.status).toBe('accepted')
    expect(data.mode).toBe('fetch_summarize')
  })

  it('accepts explicit mode in body', async () => {
    mockRunPipeline.mockResolvedValue({ report: makeReport(), summary: null })
    const { POST } = await import('@/app/api/fetch/route')
    const req = new NextRequest('http://localhost/api/fetch', {
      method: 'POST',
      body: JSON.stringify({ mode: 'fetch' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const resp = await POST(req)
    expect(resp.status).toBe(202)
    const data = await resp.json()
    expect(data.mode).toBe('fetch')
  })
})

describe('GET /api/fetch/status', () => {
  it('returns empty status when no data', async () => {
    mockReadPipelineStatus.mockResolvedValue(null)
    const { GET } = await import('@/app/api/fetch/status/route')
    const resp = await GET()
    const data = await resp.json()
    expect(data.running).toBe(false)
    expect(data.mode).toBe('fetch_summarize')
    expect(data.concurrency).toBe(4)
    expect(data.overall_summary).toBe('skipped')
    expect(data.sensors).toEqual([])
  })

  it('returns pipeline status when available', async () => {
    const status: PipelineStatus = {
      running: true,
      mode: 'fetch_summarize',
      concurrency: 4,
      started_at: '2026-01-01T07:00:00Z',
      completed_at: null,
      sensors: [{
        name: 'hn',
        fetch: 'running',
        fetch_error: null,
        fetch_error_kind: null,
        summary: 'queued',
        summary_error: null,
        item_count: 0,
      }],
      overall_summary: 'queued',
      total_items: 0,
    }
    mockReadPipelineStatus.mockResolvedValue(status)
    const { GET } = await import('@/app/api/fetch/status/route')
    const resp = await GET()
    const data = await resp.json()
    expect(data.running).toBe(true)
    expect(data.sensors).toHaveLength(1)
    expect(data.mode).toBe('fetch_summarize')
  })
})

describe('GET /api/intel/latest', () => {
  it('returns 503 when no cache', async () => {
    mockReadReport.mockResolvedValue(null)
    const { GET } = await import('@/app/api/intel/latest/route')
    const resp = await GET()
    expect(resp.status).toBe(503)
  })

  it('returns report schema', async () => {
    const report = makeReport({ sources_ok: ['hn'] })
    mockReadReport.mockResolvedValue(report)
    mockIsStale.mockReturnValue(false)
    const { GET } = await import('@/app/api/intel/latest/route')
    const resp = await GET()
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.items).toBeDefined()
    expect(data.date).toBeDefined()
    expect(data.fetched_at).toBeDefined()
    expect(data.stale).toBeDefined()
  })

  it('returns all items without truncation', async () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(String(i), `Item ${i}`))
    const report = makeReport({ items: { ...emptyItemsMap(), tech_trends: items } })
    mockReadReport.mockResolvedValue(report)
    mockIsStale.mockReturnValue(false)
    const { GET } = await import('@/app/api/intel/latest/route')
    const resp = await GET()
    const data = await resp.json()
    expect(data.items.tech_trends).toHaveLength(10)
  })

  it('stale flag propagated', async () => {
    mockReadReport.mockResolvedValue(makeReport())
    mockIsStale.mockReturnValue(true)
    const { GET } = await import('@/app/api/intel/latest/route')
    const resp = await GET()
    const data = await resp.json()
    expect(data.stale).toBe(true)
  })
})

describe('GET /api/intel/[section]', () => {
  it('returns items for known section', async () => {
    const item = makeItem('1', 'HN Top Post')
    const report = makeReport({ items: { ...emptyItemsMap(), tech_trends: [item] } })
    mockReadReport.mockResolvedValue(report)
    mockIsStale.mockReturnValue(false)
    const { GET } = await import('@/app/api/intel/[section]/route')
    const req = new NextRequest('http://localhost/api/intel/tech_trends')
    const resp = await GET(req, { params: Promise.resolve({ section: 'tech_trends' }) })
    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.section).toBe('tech_trends')
    expect(data.items).toHaveLength(1)
  })

  it('returns 404 for unknown section', async () => {
    const { GET } = await import('@/app/api/intel/[section]/route')
    const req = new NextRequest('http://localhost/api/intel/nonexistent')
    const resp = await GET(req, { params: Promise.resolve({ section: 'nonexistent' }) })
    expect(resp.status).toBe(404)
  })

  it('returns 503 when no cache', async () => {
    mockReadReport.mockResolvedValue(null)
    const { GET } = await import('@/app/api/intel/[section]/route')
    const req = new NextRequest('http://localhost/api/intel/tech_trends')
    const resp = await GET(req, { params: Promise.resolve({ section: 'tech_trends' }) })
    expect(resp.status).toBe(503)
  })
})

describe('GET /api/briefing/markdown', () => {
  it('returns markdown content type', async () => {
    mockReadReport.mockResolvedValue(makeReport())
    const { GET } = await import('@/app/api/briefing/markdown/route')
    const resp = await GET()
    expect(resp.status).toBe(200)
    expect(resp.headers.get('content-type')).toContain('text/markdown')
  })

  it('returns string content', async () => {
    mockReadReport.mockResolvedValue(makeReport({ sources_ok: ['hn'] }))
    const { GET } = await import('@/app/api/briefing/markdown/route')
    const resp = await GET()
    const text = await resp.text()
    expect(text).toContain('Intel Briefing')
  })

  it('returns 503 when no cache', async () => {
    mockReadReport.mockResolvedValue(null)
    const { GET } = await import('@/app/api/briefing/markdown/route')
    const resp = await GET()
    expect(resp.status).toBe(503)
  })
})

describe('GET /api/config', () => {
  it('returns masked config', async () => {
    const configWithKey = { ...freshConfig, xai_api_key: 'secret' }
    mockLoadConfig.mockResolvedValue(configWithKey)
    mockMaskConfig.mockReturnValue({ ...configWithKey, xai_api_key: '***' })
    const { GET } = await import('@/app/api/config/route')
    const resp = await GET()
    const data = await resp.json()
    expect(data.xai_api_key).toBe('***')
  })

  it('null keys not masked', async () => {
    mockMaskConfig.mockReturnValue(freshConfig)
    const { GET } = await import('@/app/api/config/route')
    const resp = await GET()
    const data = await resp.json()
    expect(data.xai_api_key).toBeNull()
  })
})

describe('PUT /api/config', () => {
  it('updates settings', async () => {
    const updated = { ...freshConfig, default_limit: 25 }
    mockSaveConfig.mockResolvedValue(updated)
    mockMaskConfig.mockReturnValue(updated)
    const { PUT } = await import('@/app/api/config/route')
    const req = new NextRequest('http://localhost/api/config', {
      method: 'PUT',
      body: JSON.stringify({ default_limit: 25 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const resp = await PUT(req)
    expect(resp.status).toBe(200)
    expect(mockSaveConfig).toHaveBeenCalled()
  })

  it('ignores masked keys', async () => {
    mockSaveConfig.mockResolvedValue(freshConfig)
    mockMaskConfig.mockReturnValue(freshConfig)
    const { PUT } = await import('@/app/api/config/route')
    const req = new NextRequest('http://localhost/api/config', {
      method: 'PUT',
      body: JSON.stringify({ xai_api_key: '***' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await PUT(req)
    // saveConfig should have been called without the masked key
    const callArg = mockSaveConfig.mock.calls[0][0]
    expect(callArg.xai_api_key).toBeUndefined()
  })

  it('returns masked response', async () => {
    const configWithKey = { ...freshConfig, xai_api_key: 'real-key' }
    mockSaveConfig.mockResolvedValue(configWithKey)
    mockMaskConfig.mockReturnValue({ ...configWithKey, xai_api_key: '***' })
    const { PUT } = await import('@/app/api/config/route')
    const req = new NextRequest('http://localhost/api/config', {
      method: 'PUT',
      body: JSON.stringify({ default_limit: 5 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const resp = await PUT(req)
    const data = await resp.json()
    expect(data.xai_api_key).toBe('***')
  })
})
