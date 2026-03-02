// ABOUTME: Tests for source credibility tagging in the overall briefing generation.
// ABOUTME: Validates that sensorGroupMap propagates FACTUAL/CONTEXTUAL tags into LLM context.
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('../ref-verifier', () => ({
  buildUrlPool: vi.fn().mockReturnValue(new Set()),
  buildSensorUrlPool: vi.fn().mockReturnValue(new Set()),
  verifyRefs: vi.fn().mockResolvedValue({ verified: [], failures: [] }),
}))

vi.mock('../cache', () => ({
  readSensorSummary: vi.fn().mockResolvedValue(null),
  writeSensorSummary: vi.fn().mockResolvedValue(undefined),
}))

import { generateOverallBriefing } from '../summarizer'
import type { SummarizeOptions } from '../summarizer'
import * as llm from '../llm'
import type { IntelReport, SensorSummary } from '../../models'
import { createReport, EMPTY_SENTIMENT } from '../../models'

function makeReport(): IntelReport {
  return createReport({
    date: '2026-03-02',
    fetched_at: '2026-03-02T09:00:00Z',
    sources_ok: ['hacker_news', 'x_accounts'],
    items: {
      tech: [
        { id: 'hn-1', source: 'hacker_news', title: 'AI breakthrough', url: 'https://example.com/1' },
      ],
      research: [],
      finance: [],
      products: [],
      community: [],
      social: [
        { id: 'x-1', source: 'x_accounts', title: 'Hot take on AI', url: 'https://x.com/1' },
      ],
      insights: [],
      feeds: [],
    },
  })
}

function makeSections(): SensorSummary[] {
  return [
    {
      sensor_name: 'hacker_news',
      label: 'Hacker News',
      source_url: 'https://news.ycombinator.com',
      summary: 'AI breakthrough dominates discussion.',
      brief_summary: 'AI breakthrough.',
      item_count: 1,
      items: [{ title: 'AI breakthrough', url: 'https://example.com/1', brief: 'Major AI news' }],
    },
    {
      sensor_name: 'x_accounts',
      label: 'X/Twitter',
      source_url: 'https://x.com',
      summary: 'Social media buzz about AI regulation.',
      brief_summary: 'AI regulation buzz.',
      item_count: 1,
      items: [{ title: 'Hot take on AI', url: 'https://x.com/1', brief: 'Opinion on AI' }],
    },
  ]
}

function makeOptions(overrides?: Partial<SummarizeOptions>): SummarizeOptions {
  return {
    llmConfig: { base_url: 'https://openrouter.ai/api/v1', api_key: 'k', model: 'm' },
    skipCache: true,
    ...overrides,
  }
}

describe('generateOverallBriefing — credibility tagging', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('includes credibility tags in sensor summary headings when sensorGroupMap is provided', async () => {
    const promptCapture: string[] = []
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async (messages) => {
      const userMsg = messages.find(m => m.role === 'user')?.content ?? ''
      promptCapture.push(userMsg)
      return JSON.stringify({
        executive_summary: 'Test briefing.',
        sentiment: { ...EMPTY_SENTIMENT },
      })
    })

    const sensorGroupMap = {
      hacker_news: { groupName: 'News', credibility: 'FACTUAL' as const },
      x_accounts: { groupName: 'Voices', credibility: 'CONTEXTUAL' as const },
    }

    await generateOverallBriefing(
      makeReport(),
      makeSections(),
      makeOptions({ sensorGroupMap }),
    )

    // The first chatCompletion call is the overall briefing
    const overallPrompt = promptCapture[0]
    expect(overallPrompt).toContain('### Hacker News (News — FACTUAL, 1 items)')
    expect(overallPrompt).toContain('### X/Twitter (Voices — CONTEXTUAL, 1 items)')
  })

  it('includes credibility tags in the reference list when sensorGroupMap is provided', async () => {
    const promptCapture: string[] = []
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async (messages) => {
      const userMsg = messages.find(m => m.role === 'user')?.content ?? ''
      promptCapture.push(userMsg)
      return JSON.stringify({
        executive_summary: 'Test briefing.',
        sentiment: { ...EMPTY_SENTIMENT },
      })
    })

    const sensorGroupMap = {
      hacker_news: { groupName: 'News', credibility: 'FACTUAL' as const },
      x_accounts: { groupName: 'Voices', credibility: 'CONTEXTUAL' as const },
    }

    await generateOverallBriefing(
      makeReport(),
      makeSections(),
      makeOptions({ sensorGroupMap }),
    )

    const overallPrompt = promptCapture[0]
    expect(overallPrompt).toContain('"AI breakthrough" — Hacker News [FACTUAL]')
    expect(overallPrompt).toContain('"Hot take on AI" — X/Twitter [CONTEXTUAL]')
  })

  it('defaults to CONTEXTUAL when sensorGroupMap is undefined', async () => {
    const promptCapture: string[] = []
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async (messages) => {
      const userMsg = messages.find(m => m.role === 'user')?.content ?? ''
      promptCapture.push(userMsg)
      return JSON.stringify({
        executive_summary: 'Test briefing.',
        sentiment: { ...EMPTY_SENTIMENT },
      })
    })

    await generateOverallBriefing(
      makeReport(),
      makeSections(),
      makeOptions(), // no sensorGroupMap
    )

    const overallPrompt = promptCapture[0]
    // Without sensorGroupMap, sensor summaries default to CONTEXTUAL
    expect(overallPrompt).toContain('### Hacker News (CONTEXTUAL, 1 items)')
    expect(overallPrompt).toContain('### X/Twitter (CONTEXTUAL, 1 items)')
    // Reference list also defaults to CONTEXTUAL
    expect(overallPrompt).toContain('[CONTEXTUAL]')
  })

  it('defaults to CONTEXTUAL for sensors not in sensorGroupMap', async () => {
    const promptCapture: string[] = []
    vi.spyOn(llm, 'chatCompletion').mockImplementation(async (messages) => {
      const userMsg = messages.find(m => m.role === 'user')?.content ?? ''
      promptCapture.push(userMsg)
      return JSON.stringify({
        executive_summary: 'Test briefing.',
        sentiment: { ...EMPTY_SENTIMENT },
      })
    })

    // Only map hacker_news, leave x_accounts unmapped
    const sensorGroupMap = {
      hacker_news: { groupName: 'News', credibility: 'FACTUAL' as const },
    }

    await generateOverallBriefing(
      makeReport(),
      makeSections(),
      makeOptions({ sensorGroupMap }),
    )

    const overallPrompt = promptCapture[0]
    expect(overallPrompt).toContain('### Hacker News (News — FACTUAL, 1 items)')
    // x_accounts not in map — falls back to CONTEXTUAL
    expect(overallPrompt).toContain('### X/Twitter (CONTEXTUAL, 1 items)')
  })
})
