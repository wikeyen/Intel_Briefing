// ABOUTME: Tests the forwardable briefing summary API contract.
// ABOUTME: Verifies cached GET output and POST summary-only pipeline execution.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { BriefingSummary } from '@/lib/models'

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  readReport: vi.fn(),
  isPipelineRunning: vi.fn(),
  runPipeline: vi.fn(),
  readSummary: vi.fn(),
  renderSummaryMarkdown: vi.fn(),
}))

vi.mock('@/lib/config', () => ({ loadConfig: mocks.loadConfig }))
vi.mock('@/lib/pipeline/cache', () => ({ readReport: mocks.readReport }))
vi.mock('@/lib/pipeline/orchestrator', () => ({
  isPipelineRunning: mocks.isPipelineRunning,
  runPipeline: mocks.runPipeline,
}))
vi.mock('@/lib/summary/cache', () => ({ readSummary: mocks.readSummary }))
vi.mock('@/lib/renderer/summary-markdown', () => ({ renderSummaryMarkdown: mocks.renderSummaryMarkdown }))

const { GET, POST } = await import('./route')

const summary: BriefingSummary = {
  generated_at: '2026-05-09T12:00:00Z',
  report_fetched_at: '2026-05-09T11:00:00Z',
  sections: [],
  overall: {
    executive_summary: 'Cached summary',
    sections: [],
    sentiment: {
      overall: 'neutral',
      confidence: 0.5,
      distribution: { positive: 0, neutral: 1, negative: 0 },
    },
  },
}

function request(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadConfig.mockResolvedValue({ summary_language: 'zh', summary_provider: 'minimax' })
  mocks.isPipelineRunning.mockReturnValue(false)
  mocks.renderSummaryMarkdown.mockReturnValue('# Info Aggregation Summary\n\nCached summary')
})

describe('/api/briefing/summary', () => {
  it('GET returns cached summary as markdown by default', async () => {
    mocks.readSummary.mockResolvedValue(summary)

    const res = await GET(request('http://localhost/api/briefing/summary'))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/markdown')
    expect(await res.text()).toContain('Cached summary')
    expect(mocks.readSummary).toHaveBeenCalledWith('zh')
  })

  it('GET returns JSON when requested', async () => {
    mocks.readSummary.mockResolvedValue(summary)

    const res = await GET(request('http://localhost/api/briefing/summary?format=json'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.summary).toEqual(summary)
    expect(body.markdown).toContain('Cached summary')
  })

  it('POST runs the pipeline in summary-only mode and returns JSON', async () => {
    mocks.readReport.mockResolvedValue({ items: {}, sources_ok: [], sources_failed: [] })
    mocks.runPipeline.mockResolvedValue({ report: null, summary })

    const res = await POST(request('http://localhost/api/briefing/summary?format=json', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'summarize', lang: 'zh', format: 'json' }),
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mocks.runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ summary_language: 'zh' }),
      'summarize',
      undefined,
      { stopAfterSummary: true },
    )
  })

  it('POST rejects invalid modes', async () => {
    const res = await POST(request('http://localhost/api/briefing/summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'fetch' }),
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain('Invalid mode')
  })
})
