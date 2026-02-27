// ABOUTME: Tests for NLP-first intelligence analysis pipeline (runNlpIntelligenceAnalysis).
// ABOUTME: Verifies cluster summarisation, account aggregation, risk scanning, and executive summary generation.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runNlpIntelligenceAnalysis } from '../intelligence'
import type { IntelItem, IntelReport } from '../../models'
import type { LlmConfig } from '../../summary/llm'
import type { NlpAnalyzeResponse } from '../nlp-client'

// Mock chatCompletion
vi.mock('../../summary/llm', () => ({
  chatCompletion: vi.fn(),
}))

import { chatCompletion } from '../../summary/llm'
const mockChat = vi.mocked(chatCompletion)

const fakeLlmConfig: LlmConfig = {
  base_url: 'http://localhost',
  api_key: 'test-key',
  model: 'gpt-4',
}

const trendItems: IntelItem[] = [
  { id: 'item-1', title: 'AI breakthrough in chip design', url: 'https://example.com/1', source: 'weibo' },
  { id: 'item-2', title: 'New AI regulation proposed', url: 'https://example.com/2', source: 'douyin' },
  { id: 'item-3', title: 'Tech stocks surge on AI hype', url: 'https://example.com/3', source: 'wallstreetcn' },
]

const socialItems: IntelItem[] = [
  { id: 'item-4', title: 'Thoughts on AI regulation', url: 'https://x.com/1', source: 'x', account: 'TechGuru', handle: 'techguru' },
  { id: 'item-5', title: 'AI is overhyped', url: 'https://x.com/2', source: 'x', account: 'TechGuru', handle: 'techguru' },
  { id: 'item-6', title: 'Excited about new chips', url: 'https://bsky.app/1', source: 'bluesky', account: 'ChipFan', handle: 'chipfan' },
]

const fakeReport: IntelReport = {
  items: {
    tech: [],
    research: [],
    finance: [],
    products: [],
    community: [],
    social: socialItems,
    trend: trendItems,
    insights: [],
    feeds: [],
  },
  generated_at: new Date().toISOString(),
  sources_ok: ['weibo', 'douyin', 'wallstreetcn', 'x', 'bluesky'],
  sources_failed: [],
  sources_skipped: [],
}

const fakeNlpData: NlpAnalyzeResponse = {
  items: [
    { id: 'item-1', keywords: [{ text: 'AI', weight: 0.9 }, { text: 'chips', weight: 0.7 }], sentiment: { label: 'positive', score: 0.8 }, entities: { people: [], orgs: [], places: [] } },
    { id: 'item-2', keywords: [{ text: 'AI', weight: 0.8 }, { text: 'regulation', weight: 0.6 }], sentiment: { label: 'neutral', score: 0.5 }, entities: { people: [], orgs: [], places: [] } },
    { id: 'item-3', keywords: [{ text: 'stocks', weight: 0.7 }, { text: 'AI', weight: 0.6 }], sentiment: { label: 'positive', score: 0.7 }, entities: { people: [], orgs: [], places: [] } },
    { id: 'item-4', keywords: [{ text: 'AI', weight: 0.8 }, { text: 'regulation', weight: 0.5 }], sentiment: { label: 'neutral', score: 0.5 }, entities: { people: [], orgs: [], places: [] } },
    { id: 'item-5', keywords: [{ text: 'AI', weight: 0.7 }, { text: 'hype', weight: 0.6 }], sentiment: { label: 'negative', score: 0.6 }, entities: { people: [], orgs: [], places: [] } },
    { id: 'item-6', keywords: [{ text: 'chips', weight: 0.9 }], sentiment: { label: 'positive', score: 0.9 }, entities: { people: [], orgs: [], places: [] } },
  ],
  clusters: [
    {
      id: 0,
      label: 'AI Technology',
      item_ids: ['item-1', 'item-3'],
      top_keywords: [{ text: 'AI', weight: 0.9 }, { text: 'chips', weight: 0.7 }],
      sentiment_distribution: { positive: 0.8, neutral: 0.2 },
      representative_items: ['item-1', 'item-3'],
    },
    {
      id: 1,
      label: 'AI Regulation',
      item_ids: ['item-2', 'item-4'],
      top_keywords: [{ text: 'AI', weight: 0.8 }, { text: 'regulation', weight: 0.6 }],
      sentiment_distribution: { neutral: 0.6, negative: 0.4 },
      representative_items: ['item-2'],
    },
  ],
}

describe('runNlpIntelligenceAnalysis', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns IntelligenceReport with trend and accounts when NLP data is provided', async () => {
    // cluster summary for cluster 0
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'AI chips are hot.',
      tags: [{ text: 'Chip Design', weight: 0.9, sentiment: 'positive' }, { text: 'AI', weight: 0.8, sentiment: 'neutral' }],
    }))
    // cluster summary for cluster 1
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'Regulation looms.',
      tags: [{ text: 'Regulation', weight: 0.85, sentiment: 'mixed' }, { text: 'AI', weight: 0.7, sentiment: 'neutral' }],
    }))
    // accounts summary
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'Tech voices are split.',
      tags: [{ text: 'AI Hype', weight: 0.9, sentiment: 'negative' }, { text: 'Semiconductors', weight: 0.7, sentiment: 'positive' }],
    }))
    // risk scan (cluster 1 has >30% negative)
    mockChat.mockResolvedValueOnce(JSON.stringify({ risks: [{ title: 'Regulatory risk', description: 'New rules may impact AI' }] }))
    // executive summary
    mockChat.mockResolvedValueOnce(JSON.stringify({ summary: 'The AI landscape is evolving rapidly.' }))

    const result = await runNlpIntelligenceAnalysis(fakeReport, fakeNlpData, fakeLlmConfig)

    expect(result.trend).not.toBeNull()
    expect(result.trend!.topics).toHaveLength(2)
    expect(result.trend!.topics[0].name).toBe('AI Technology')
    expect(result.trend!.topics[0].summary).toBe('AI chips are hot.')
    expect(result.trend!.topics[0].itemCount).toBe(2)
    expect(result.trend!.summary).toBe('The AI landscape is evolving rapidly.')
    expect(result.trend!.tags.length).toBeGreaterThan(0)

    expect(result.accounts).not.toBeNull()
    expect(result.accounts!.accounts).toHaveLength(2)
    expect(result.accounts!.summary).toBe('Tech voices are split.')
    // Account tags should be LLM-curated, not shared with trend
    expect(result.accounts!.tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'AI Hype' }),
    ]))

    // topics is null in NLP pipeline (not used)
    expect(result.topics).toBeNull()
  })

  it('handles LLM failures gracefully with empty summaries and tags', async () => {
    // All LLM calls throw
    mockChat.mockRejectedValue(new Error('LLM down'))

    const result = await runNlpIntelligenceAnalysis(fakeReport, fakeNlpData, fakeLlmConfig)

    // Should still return a result with empty summaries and tags
    expect(result.trend).not.toBeNull()
    expect(result.trend!.topics).toHaveLength(2)
    expect(result.trend!.topics[0].summary).toBe('')
    expect(result.trend!.summary).toBe('')
    expect(result.trend!.tags).toEqual([])
  })

  it('produces trend tags aggregated from LLM cluster summaries', async () => {
    // cluster 0 returns tags
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'test',
      tags: [{ text: 'AI', weight: 0.9, sentiment: 'neutral' }, { text: 'Chips', weight: 0.7, sentiment: 'positive' }],
    }))
    // cluster 1 returns tags (with overlapping 'AI' at lower weight)
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'test',
      tags: [{ text: 'AI', weight: 0.8, sentiment: 'neutral' }, { text: 'Regulation', weight: 0.6, sentiment: 'mixed' }],
    }))
    // accounts summary (no tags — should fall back to trend tags)
    mockChat.mockResolvedValueOnce(JSON.stringify({ summary: 'test' }))
    // remaining LLM calls
    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test' }))

    const result = await runNlpIntelligenceAnalysis(fakeReport, fakeNlpData, fakeLlmConfig)

    expect(result.trend!.tags.length).toBe(3) // ai, chips, regulation (deduplicated)
    // 'ai' should be top tag with max weight from clusters (0.9)
    expect(result.trend!.tags[0].text).toBe('ai')
    expect(result.trend!.tags[0].weight).toBe(0.9)
    // Accounts should fall back to trend tags since no account-specific tags
    expect(result.accounts!.tags.length).toBe(3)
  })

  it('returns null accounts when no social items exist', async () => {
    const reportNoSocial: IntelReport = {
      ...fakeReport,
      items: { ...fakeReport.items, social: [] },
    }

    // cluster summaries + exec summary
    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test' }))

    const result = await runNlpIntelligenceAnalysis(reportNoSocial, fakeNlpData, fakeLlmConfig)
    expect(result.accounts).toBeNull()
  })

  it('skips risk scan when no clusters have high negative sentiment', async () => {
    const noNegativeNlp: NlpAnalyzeResponse = {
      items: fakeNlpData.items,
      clusters: [{
        id: 0,
        label: 'Happy news',
        item_ids: ['item-1'],
        top_keywords: [{ text: 'good', weight: 0.9 }],
        sentiment_distribution: { positive: 0.9, neutral: 0.1 },
        representative_items: ['item-1'],
      }],
    }

    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test' }))

    const result = await runNlpIntelligenceAnalysis(fakeReport, noNegativeNlp, fakeLlmConfig)
    expect(result.trend).not.toBeNull()

    // Should have called: 1 cluster summary + 1 accounts summary + 1 executive summary = 3
    // No risk scan call
    const callCount = mockChat.mock.calls.length
    expect(callCount).toBe(3)
  })

  it('assigns dominant sentiment correctly', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test' }))

    const result = await runNlpIntelligenceAnalysis(fakeReport, fakeNlpData, fakeLlmConfig)

    // Cluster 0: 80% positive -> 'positive'
    expect(result.trend!.topics[0].sentiment).toBe('positive')
    // Cluster 1: 60% neutral, 40% negative -> 'mixed' (top < 0.5 not met, but 0.6 >= 0.5 so 'neutral')
    expect(result.trend!.topics[1].sentiment).toBe('neutral')
  })
})
