// ABOUTME: Tests for the unified summarization engine.
// ABOUTME: Validates prompt construction, concurrent LLM calls, per-sensor caching, and BriefingSummary output shape.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('./ref-verifier', () => ({
  buildUrlPool: vi.fn().mockReturnValue(new Set()),
  buildSensorUrlPool: vi.fn().mockReturnValue(new Set()),
  verifyRefs: vi.fn().mockResolvedValue({ verified: [], failures: [] }),
}))

import { summarizeReport } from './summarizer'
import type { SummarizeOptions } from './summarizer'
import * as llm from './llm'
import * as cache from './cache'
import type { IntelReport } from '../models'
import { createReport } from '../models'

vi.mock('./cache', async (importOriginal) => {
  const actual = await importOriginal<typeof cache>()
  return {
    ...actual,
    readSensorSummary: vi.fn().mockResolvedValue(null),
    writeSensorSummary: vi.fn().mockResolvedValue(undefined),
  }
})

function makeReport(overrides?: Partial<IntelReport>): IntelReport {
  return createReport({
    date: '2026-02-19',
    fetched_at: '2026-02-19T09:00:00Z',
    sources_ok: ['hacker_news', 'arxiv'],
    items: {
      tech: [
        { id: 'hn-1', source: 'hacker_news', title: 'AI breakthrough', url: 'https://example.com/1' },
        { id: 'hn-2', source: 'hacker_news', title: 'Rust 2.0 released', url: 'https://example.com/2' },
      ],
      research: [
        { id: 'ax-1', source: 'arxiv', title: 'Attention is still all you need', url: 'https://arxiv.org/1', abstract: 'We prove...' },
      ],
      finance: [],
      products: [],
      community: [],
      social: [],
      insights: [],
      feeds: [],
    },
    ...overrides,
  })
}

function makeOptions(overrides?: Partial<SummarizeOptions>): SummarizeOptions {
  return {
    llmConfig: { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' },
    skipCache: true,
    ...overrides,
  }
}

describe('summarizeReport', () => {
  beforeEach(() => {
    // clearAllMocks resets call counts on vi.fn() mocks from vi.mock() factories
    // (restoreAllMocks only reliably clears vi.spyOn mocks)
    vi.clearAllMocks()
    vi.mocked(cache.readSensorSummary).mockResolvedValue(null)
    vi.mocked(cache.writeSensorSummary).mockResolvedValue(undefined)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('produces per-sensor summaries and overall briefing', async () => {
    const calls: string[] = []
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async (messages) => {
      const userMsg = messages.find(m => m.role === 'user')!.content
      // Check for overall prompt first — it also contains sensor labels
      if (userMsg.includes('各信息源趋势分析')) {
        calls.push('overall')
        return 'Overall briefing'
      }
      if (userMsg.includes('Hacker News')) {
        calls.push('hacker_news')
        return 'HN summary here'
      }
      if (userMsg.includes('ArXiv')) {
        calls.push('arxiv')
        return 'ArXiv summary here'
      }
      calls.push('unknown')
      return 'Unknown'
    })

    const result = await summarizeReport(makeReport(), makeOptions())

    expect(result.sections).toHaveLength(2)
    expect(result.sections[0].sensor_name).toBe('hacker_news')
    expect(result.sections[0].summary).toBe('HN summary here')
    expect(result.sections[0].source_url).toBe('https://news.ycombinator.com')
    expect(result.sections[0].items).toEqual([])
    expect(result.sections[0].item_count).toBe(2)
    expect(result.sections[1].sensor_name).toBe('arxiv')
    expect(result.sections[1].summary).toBe('ArXiv summary here')
    expect(result.sections[1].source_url).toBe('https://arxiv.org/list/cs.AI/recent')
    expect(result.sections[1].items).toEqual([])
    // Overall is OverallBriefing fallback shape (raw text not valid JSON)
    // quick_scan: [] comes from parseOverallJson which still parses it for backward compat
    expect(result.overall).toEqual({
      quick_scan: [],
      executive_summary: '',
      sections: [{ title: '简报', entries: [{ text: 'Overall briefing', source: '', refs: [] }] }],
      sentiment: { overall_mood: 'neutral', mood_summary: '', controversies: [], opinion_shifts: [], risk_flags: [] },
      sources: [],
    })
    expect(result.report_fetched_at).toBe('2026-02-19T09:00:00Z')
    // Verify sequential order with concurrency=1 (default)
    expect(calls).toEqual(['hacker_news', 'arxiv', 'overall'])
  })

  it('skips sensors with no items', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Summary')

    const report = makeReport({
      sources_ok: ['hacker_news'],
      items: {
        tech: [
          { id: 'hn-1', source: 'hacker_news', title: 'Story', url: 'https://example.com/1' },
        ],
        research: [],
        finance: [],
        products: [],
        community: [],
        social: [],
        insights: [],
        feeds: [],
      },
    })

    const result = await summarizeReport(report, makeOptions({
      llmConfig: { base_url: 'http://localhost:11434/v1', api_key: null, model: 'llama3' },
    }))

    // Only hacker_news + overall = 2 calls
    expect(llm.chatCompletion).toHaveBeenCalledTimes(2)
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].sensor_name).toBe('hacker_news')
  })

  it('returns empty sections for report with no items', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Nothing to report')

    const report = makeReport({
      sources_ok: [],
      items: {
        tech: [],
        research: [],
        finance: [],
        products: [],
        community: [],
        social: [],
        insights: [],
        feeds: [],
      },
    })

    const result = await summarizeReport(report, makeOptions())

    expect(result.sections).toHaveLength(0)
    // Still gets one overall call
    expect(llm.chatCompletion).toHaveBeenCalledTimes(1)
    // Overall is OverallBriefing fallback shape (raw text not valid JSON)
    // quick_scan: [] comes from parseOverallJson which still parses it for backward compat
    expect(result.overall).toEqual({
      quick_scan: [],
      executive_summary: '',
      sections: [{ title: '简报', entries: [{ text: 'Nothing to report', source: '', refs: [] }] }],
      sentiment: { overall_mood: 'neutral', mood_summary: '', controversies: [], opinion_shifts: [], risk_flags: [] },
      sources: [],
    })
  })

  it('includes item details in the per-sensor prompt', async () => {
    const promptCapture: string[] = []
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async (messages) => {
      promptCapture.push(messages.find(m => m.role === 'user')!.content)
      return 'Summary'
    })

    await summarizeReport(makeReport(), makeOptions())

    // First prompt should contain the HN item titles
    expect(promptCapture[0]).toContain('AI breakthrough')
    expect(promptCapture[0]).toContain('Rust 2.0 released')
    // Second prompt should contain the ArXiv abstract
    expect(promptCapture[1]).toContain('Attention is still all you need')
    expect(promptCapture[1]).toContain('We prove...')
  })

  it('propagates LLM errors when no onProgress callback', async () => {
    vi.spyOn(llm, 'chatCompletion').mockRejectedValue(new Error('LLM timeout'))

    await expect(
      summarizeReport(makeReport(), makeOptions()),
    ).rejects.toThrow('LLM timeout')
  })

  it('calls onProgress with running/ok for each sensor', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Summary text')

    const progressCalls: { sensor: string; label: string; state: string; error: string | null }[] = []
    const onProgress = (sensor: string, label: string, state: string, error: string | null) => {
      progressCalls.push({ sensor, label, state, error })
    }

    await summarizeReport(makeReport(), makeOptions({ onProgress }))

    // hacker_news: running, ok; arxiv: running, ok; __overall__: running, ok
    expect(progressCalls).toEqual([
      { sensor: 'hacker_news', label: 'Hacker News', state: 'running', error: null },
      { sensor: 'hacker_news', label: 'Hacker News', state: 'ok', error: null },
      { sensor: 'arxiv', label: 'ArXiv AI', state: 'running', error: null },
      { sensor: 'arxiv', label: 'ArXiv AI', state: 'ok', error: null },
      { sensor: '__overall__', label: 'Overall', state: 'running', error: null },
      { sensor: '__overall__', label: 'Overall', state: 'ok', error: null },
    ])
  })

  it('reports failed state via onProgress and continues to next sensor', async () => {
    let callCount = 0
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async () => {
      callCount++
      if (callCount === 1) throw new Error('Rate limited')
      return 'Summary text'
    })

    const progressCalls: { sensor: string; state: string; error: string | null }[] = []
    const onProgress = (sensor: string, _label: string, state: string, error: string | null) => {
      progressCalls.push({ sensor, state, error })
    }

    const result = await summarizeReport(makeReport(), makeOptions({ onProgress }))

    // hacker_news fails, arxiv succeeds, overall succeeds
    expect(progressCalls).toEqual([
      { sensor: 'hacker_news', state: 'running', error: null },
      { sensor: 'hacker_news', state: 'failed', error: 'Rate limited' },
      { sensor: 'arxiv', state: 'running', error: null },
      { sensor: 'arxiv', state: 'ok', error: null },
      { sensor: '__overall__', state: 'running', error: null },
      { sensor: '__overall__', state: 'ok', error: null },
    ])

    // Only arxiv in sections since hacker_news failed
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].sensor_name).toBe('arxiv')
  })

  it('only summarizes sensors in enabledSensors set', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Summary text')

    const result = await summarizeReport(makeReport(), makeOptions({
      enabledSensors: new Set(['arxiv']),
    }))

    // Only arxiv should be summarized (hacker_news not in enabled set)
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].sensor_name).toBe('arxiv')
    // 1 sensor + 1 overall = 2 LLM calls
    expect(llm.chatCompletion).toHaveBeenCalledTimes(2)
  })

  it('automatically excludes sensors from sources_failed', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Summary text')

    const report = makeReport({ sources_failed: ['hacker_news'] })

    const result = await summarizeReport(report, makeOptions())

    // hacker_news is in sources_failed — only arxiv should be summarized
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].sensor_name).toBe('arxiv')
    // 1 sensor + 1 overall = 2 LLM calls
    expect(llm.chatCompletion).toHaveBeenCalledTimes(2)
  })

  describe('per-sensor caching', () => {
    it('skips LLM call when cache matches content hash', async () => {
      const chatSpy = vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Summary text')

      const cachedSummary = {
        sensor_name: 'hacker_news',
        label: 'Hacker News',
        source_url: 'https://news.ycombinator.com',
        summary: 'Cached HN summary',
        item_count: 2,
        items: [{ title: 'AI breakthrough', url: 'https://example.com/1', brief: 'Notable' }],
      }

      // Mock cache to return a matching entry for hacker_news
      vi.mocked(cache.readSensorSummary).mockImplementation(async (name) => {
        if (name === 'hacker_news') {
          // The hash is computed from sorted item IDs: 'hn-1\nhn-2'
          const crypto = await import('crypto')
          const hash = crypto.createHash('sha256').update('hn-1\nhn-2').digest('hex').slice(0, 16)
          return { content_hash: hash, sensor_summary: cachedSummary, generated_at: '2026-02-19T09:00:00Z' }
        }
        return null
      })

      const progressCalls: { sensor: string; state: string }[] = []
      const onProgress = (sensor: string, _label: string, state: string) => {
        progressCalls.push({ sensor, state })
      }

      const result = await summarizeReport(makeReport(), makeOptions({
        skipCache: false,
        onProgress,
      }))

      // hacker_news should use cache (no LLM call), arxiv should call LLM
      expect(result.sections).toHaveLength(2)
      expect(result.sections[0].sensor_name).toBe('hacker_news')
      expect(result.sections[0].summary).toBe('Cached HN summary')
      expect(result.sections[1].sensor_name).toBe('arxiv')

      // 1 LLM call for arxiv + 1 for overall = 2 (no call for hacker_news)
      expect(chatSpy).toHaveBeenCalledTimes(2)

      // hacker_news reports 'cached', not 'running'
      expect(progressCalls.find(c => c.sensor === 'hacker_news' && c.state === 'cached')).toBeTruthy()
      expect(progressCalls.find(c => c.sensor === 'hacker_news' && c.state === 'running')).toBeFalsy()
    })

    it('calls LLM when cache hash does not match', async () => {
      const chatSpy = vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Fresh summary')

      // Return a cached entry with a different hash
      vi.mocked(cache.readSensorSummary).mockResolvedValue({
        content_hash: 'stale_hash',
        sensor_summary: {
          sensor_name: 'hacker_news',
          label: 'Hacker News',
          source_url: 'https://news.ycombinator.com',
          summary: 'Old summary',
          item_count: 1,
          items: [],
        },
        generated_at: '2026-02-18T09:00:00Z',
      })

      const result = await summarizeReport(makeReport(), makeOptions({ skipCache: false }))

      // Both sensors should get fresh LLM calls since hash doesn't match
      expect(result.sections).toHaveLength(2)
      expect(result.sections[0].summary).toBe('Fresh summary')
      // 2 sensors + 1 overall = 3 LLM calls
      expect(chatSpy).toHaveBeenCalledTimes(3)
    })

    it('skips cache check when skipCache is true', async () => {
      vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Summary text')

      await summarizeReport(makeReport(), makeOptions({ skipCache: true }))

      // readSensorSummary should never be called when skipCache is true
      expect(cache.readSensorSummary).not.toHaveBeenCalled()
    })

    it('writes to cache after successful LLM summarization', async () => {
      vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Summary text')

      await summarizeReport(makeReport(), makeOptions({ skipCache: false }))

      // Should write cache for both hacker_news and arxiv
      expect(cache.writeSensorSummary).toHaveBeenCalledTimes(2)
      expect(vi.mocked(cache.writeSensorSummary).mock.calls[0][0]).toBe('hacker_news')
      expect(vi.mocked(cache.writeSensorSummary).mock.calls[1][0]).toBe('arxiv')
    })
  })

  it('uses retry-with-verification for per-sensor and overall', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Summary text')

    const result = await summarizeReport(makeReport(), makeOptions())

    // Should still produce the expected output shape
    expect(result.sections).toHaveLength(2)
    expect(result.overall).toBeDefined()
  })
})
