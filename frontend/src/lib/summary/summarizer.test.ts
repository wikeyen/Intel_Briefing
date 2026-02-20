// ABOUTME: Tests for the summarizer orchestrator.
// ABOUTME: Validates prompt construction, sequential LLM calls, and BriefingSummary output shape.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { summarizeReport } from './summarizer'
import * as llm from './llm'
import type { IntelReport } from '../models'
import { createReport } from '../models'

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

describe('summarizeReport', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('produces per-sensor summaries and overall briefing', async () => {
    const calls: string[] = []
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async (messages) => {
      const userMsg = messages.find(m => m.role === 'user')!.content
      // Check for overall prompt first — it also contains sensor labels
      if (userMsg.includes('各信息源摘要')) {
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

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
    const result = await summarizeReport(makeReport(), config)

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
    expect(result.overall).toEqual({
      quick_scan: [],
      executive_summary: '',
      sections: [{ title: '简报', entries: [{ text: 'Overall briefing', source: '', refs: [] }] }],
    })
    expect(result.report_fetched_at).toBe('2026-02-19T09:00:00Z')
    // Verify sequential order
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

    const config = { base_url: 'http://localhost:11434/v1', api_key: null, model: 'llama3' }
    const result = await summarizeReport(report, config)

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

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
    const result = await summarizeReport(report, config)

    expect(result.sections).toHaveLength(0)
    // Still gets one overall call
    expect(llm.chatCompletion).toHaveBeenCalledTimes(1)
    // Overall is OverallBriefing fallback shape (raw text not valid JSON)
    expect(result.overall).toEqual({
      quick_scan: [],
      executive_summary: '',
      sections: [{ title: '简报', entries: [{ text: 'Nothing to report', source: '', refs: [] }] }],
    })
  })

  it('includes item details in the per-sensor prompt', async () => {
    const promptCapture: string[] = []
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async (messages) => {
      promptCapture.push(messages.find(m => m.role === 'user')!.content)
      return 'Summary'
    })

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
    await summarizeReport(makeReport(), config)

    // First prompt should contain the HN item titles
    expect(promptCapture[0]).toContain('AI breakthrough')
    expect(promptCapture[0]).toContain('Rust 2.0 released')
    // Second prompt should contain the ArXiv abstract
    expect(promptCapture[1]).toContain('Attention is still all you need')
    expect(promptCapture[1]).toContain('We prove...')
  })

  it('propagates LLM errors when no onProgress callback', async () => {
    vi.spyOn(llm, 'chatCompletion').mockRejectedValue(new Error('LLM timeout'))

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
    await expect(summarizeReport(makeReport(), config)).rejects.toThrow('LLM timeout')
  })

  it('calls onProgress with running/ok for each sensor', async () => {
    vi.spyOn(llm, 'chatCompletion').mockResolvedValue('Summary text')

    const progressCalls: { sensor: string; label: string; state: string; error: string | null }[] = []
    const onProgress = (sensor: string, label: string, state: string, error: string | null) => {
      progressCalls.push({ sensor, label, state, error })
    }

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
    await summarizeReport(makeReport(), config, onProgress)

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

    const config = { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' }
    const result = await summarizeReport(makeReport(), config, onProgress)

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
})
