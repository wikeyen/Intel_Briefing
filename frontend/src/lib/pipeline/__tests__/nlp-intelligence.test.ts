// ABOUTME: Tests for NLP-first intelligence analysis pipeline (runNlpIntelligenceAnalysis).
// ABOUTME: Verifies cluster summarisation, topic intelligence, account aggregation, risk scanning, and executive summary generation.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runNlpIntelligenceAnalysis } from '../intelligence'
import type { NlpSectionData } from '../intelligence'
import type { IntelItem, IntelReport } from '../../models'
import type { LlmConfig } from '../../summary/llm'
import type { NlpEnrichedItem, NlpCluster } from '../nlp-client'

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

const topicItems: IntelItem[] = [
  { id: 'item-7', title: 'GPT-5 discussion thread', url: 'https://bsky.app/2', source: 'bluesky', topic: 'AI' },
  { id: 'item-8', title: 'OpenAI drama continues', url: 'https://x.com/3', source: 'x', topic: 'AI' },
  { id: 'item-9', title: 'Rust vs Go debate', url: 'https://bsky.app/3', source: 'bluesky', topic: 'programming' },
]

const fakeReport: IntelReport = {
  date: '2026-02-27',
  fetched_at: new Date().toISOString(),
  stale: false,
  items: {
    social: [...socialItems, ...topicItems],
    trend: trendItems,
  },
  sources_ok: ['weibo', 'douyin', 'wallstreetcn', 'x', 'bluesky'],
  sources_failed: [],
}

const enrichedItems: NlpEnrichedItem[] = [
  { id: 'item-1', keywords: [{ text: 'AI', weight: 0.9 }, { text: 'chips', weight: 0.7 }], sentiment: { label: 'positive', score: 0.8 }, entities: { people: [], orgs: [], places: [] } },
  { id: 'item-2', keywords: [{ text: 'AI', weight: 0.8 }, { text: 'regulation', weight: 0.6 }], sentiment: { label: 'neutral', score: 0.5 }, entities: { people: [], orgs: [], places: [] } },
  { id: 'item-3', keywords: [{ text: 'stocks', weight: 0.7 }, { text: 'AI', weight: 0.6 }], sentiment: { label: 'positive', score: 0.7 }, entities: { people: [], orgs: [], places: [] } },
  { id: 'item-4', keywords: [{ text: 'AI', weight: 0.8 }, { text: 'regulation', weight: 0.5 }], sentiment: { label: 'neutral', score: 0.5 }, entities: { people: [], orgs: [], places: [] } },
  { id: 'item-5', keywords: [{ text: 'AI', weight: 0.7 }, { text: 'hype', weight: 0.6 }], sentiment: { label: 'negative', score: 0.6 }, entities: { people: [], orgs: [], places: [] } },
  { id: 'item-6', keywords: [{ text: 'chips', weight: 0.9 }], sentiment: { label: 'positive', score: 0.9 }, entities: { people: [], orgs: [], places: [] } },
  { id: 'item-7', keywords: [{ text: 'GPT', weight: 0.9 }, { text: 'AI', weight: 0.8 }], sentiment: { label: 'positive', score: 0.7 }, entities: { people: [], orgs: ['OpenAI'], places: [] } },
  { id: 'item-8', keywords: [{ text: 'OpenAI', weight: 0.8 }], sentiment: { label: 'negative', score: 0.6 }, entities: { people: [], orgs: ['OpenAI'], places: [] } },
  { id: 'item-9', keywords: [{ text: 'Rust', weight: 0.9 }, { text: 'Go', weight: 0.8 }], sentiment: { label: 'neutral', score: 0.5 }, entities: { people: [], orgs: [], places: [] } },
]

const trendClusters: NlpCluster[] = [
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
    item_ids: ['item-2'],
    top_keywords: [{ text: 'AI', weight: 0.8 }, { text: 'regulation', weight: 0.6 }],
    sentiment_distribution: { neutral: 0.6, negative: 0.4 },
    representative_items: ['item-2'],
  },
]

const fakeNlpSectionData: NlpSectionData = {
  trendClusters,
  enrichmentMap: new Map(enrichedItems.map(e => [e.id, e])),
}

// Sensor sets matching the test data — tells the intelligence pipeline which sensors belong to which analysis
const fakeSensorSets = {
  trendSensors: new Set(['weibo', 'douyin', 'wallstreetcn']),
  topicSensors: new Set(['x', 'bluesky']),
  socialSensors: new Set(['x', 'bluesky']),
}

describe('runNlpIntelligenceAnalysis', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns IntelligenceReport with trend, topics, and accounts', async () => {
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
    // topic intelligence
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'AI discourse is heated.',
      topics: [
        { topic: 'AI', sentiment: 'mixed', summary: 'GPT-5 and OpenAI drama', items: [{ title: 'GPT-5 discussion thread', url: 'https://bsky.app/2', brief: 'Active discussion' }], postCount: 2 },
        { topic: 'programming', sentiment: 'neutral', summary: 'Language wars continue', items: [{ title: 'Rust vs Go debate', url: 'https://bsky.app/3', brief: 'Classic debate' }], postCount: 1 },
      ],
      tags: [{ text: 'GPT-5', weight: 0.9, sentiment: 'positive' }],
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

    const result = await runNlpIntelligenceAnalysis(fakeReport, fakeNlpSectionData, fakeLlmConfig, undefined, undefined, fakeSensorSets)

    // Trend
    expect(result.trend).not.toBeNull()
    expect(result.trend!.topics).toHaveLength(2)
    expect(result.trend!.topics[0].name).toBe('AI Technology')
    expect(result.trend!.topics[0].summary).toBe('AI chips are hot.')
    expect(result.trend!.topics[0].itemCount).toBe(2)
    expect(result.trend!.summary).toBe('The AI landscape is evolving rapidly.')
    expect(result.trend!.tags.length).toBeGreaterThan(0)

    // Topics (now populated via NLP enrichment!)
    expect(result.topics).not.toBeNull()
    expect(result.topics!.topics).toHaveLength(2)
    expect(result.topics!.topics[0].topic).toBe('AI')
    expect(result.topics!.summary).toBe('AI discourse is heated.')

    // Accounts
    expect(result.accounts).not.toBeNull()
    expect(result.accounts!.accounts).toHaveLength(2)
    expect(result.accounts!.summary).toBe('Tech voices are split.')
    expect(result.accounts!.tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'AI Hype' }),
    ]))
  })

  it('handles LLM failures gracefully with empty summaries and tags', async () => {
    // All LLM calls throw
    mockChat.mockRejectedValue(new Error('LLM down'))

    const result = await runNlpIntelligenceAnalysis(fakeReport, fakeNlpSectionData, fakeLlmConfig, undefined, undefined, fakeSensorSets)

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
    // topic intelligence
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'test', topics: [], tags: [],
    }))
    // accounts summary (no tags — should fall back to trend tags)
    mockChat.mockResolvedValueOnce(JSON.stringify({ summary: 'test' }))
    // remaining LLM calls
    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test' }))

    const result = await runNlpIntelligenceAnalysis(fakeReport, fakeNlpSectionData, fakeLlmConfig, undefined, undefined, fakeSensorSets)

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
      items: { ...fakeReport.items, social: [...topicItems] },
    }

    // cluster summaries + topic + exec summary
    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test', topics: [], tags: [] }))

    const result = await runNlpIntelligenceAnalysis(reportNoSocial, fakeNlpSectionData, fakeLlmConfig, undefined, undefined, fakeSensorSets)
    expect(result.accounts).toBeNull()
  })

  it('returns null trend when no trend clusters exist', async () => {
    const emptyTrendData: NlpSectionData = {
      trendClusters: [],
      enrichmentMap: fakeNlpSectionData.enrichmentMap,
    }

    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test', topics: [], tags: [] }))

    const result = await runNlpIntelligenceAnalysis(fakeReport, emptyTrendData, fakeLlmConfig, undefined, undefined, fakeSensorSets)
    expect(result.trend).toBeNull()
  })

  it('returns null topics when no topic items exist', async () => {
    const reportNoTopics: IntelReport = {
      ...fakeReport,
      items: { ...fakeReport.items, social: socialItems },
    }

    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test' }))

    const result = await runNlpIntelligenceAnalysis(reportNoTopics, fakeNlpSectionData, fakeLlmConfig, undefined, undefined, fakeSensorSets)
    expect(result.topics).toBeNull()
  })

  it('skips risk scan when no clusters have high negative sentiment', async () => {
    const noNegativeData: NlpSectionData = {
      trendClusters: [{
        id: 0,
        label: 'Happy news',
        item_ids: ['item-1'],
        top_keywords: [{ text: 'good', weight: 0.9 }],
        sentiment_distribution: { positive: 0.9, neutral: 0.1 },
        representative_items: ['item-1'],
      }],
      enrichmentMap: fakeNlpSectionData.enrichmentMap,
    }

    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test', topics: [], tags: [] }))

    const result = await runNlpIntelligenceAnalysis(fakeReport, noNegativeData, fakeLlmConfig, undefined, undefined, fakeSensorSets)
    expect(result.trend).not.toBeNull()

    // Should have called: 1 cluster summary + 1 topic + 1 accounts summary + 1 executive summary = 4
    // No risk scan call
    const callCount = mockChat.mock.calls.length
    expect(callCount).toBe(4)
  })

  it('includes topic items from any sensor, not just topicSensors', async () => {
    // Add a topic item from a sensor NOT in topicSensors (e.g. weibo)
    const extraTopicItem: IntelItem = { id: 'item-extra', title: 'Weibo AI topic', url: 'https://example.com/extra', source: 'weibo', topic: 'AI' }
    const reportWithExtra: IntelReport = {
      ...fakeReport,
      items: { ...fakeReport.items, social: [...socialItems, ...topicItems, extraTopicItem] },
    }

    // cluster summaries
    mockChat.mockResolvedValueOnce(JSON.stringify({ summary: 'test', tags: [] }))
    mockChat.mockResolvedValueOnce(JSON.stringify({ summary: 'test', tags: [] }))
    // topic intelligence — capture the input to verify weibo item is included
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'Topics from all sensors.', topics: [], tags: [],
    }))
    // remaining calls
    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test' }))

    await runNlpIntelligenceAnalysis(reportWithExtra, fakeNlpSectionData, fakeLlmConfig, undefined, undefined, fakeSensorSets)

    // The topic call (3rd call) should include the weibo item
    const topicCall = mockChat.mock.calls[2]
    const userContent = topicCall[0][1].content as string
    expect(userContent).toContain('Weibo AI topic')
  })

  it('assigns dominant sentiment correctly', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test', topics: [], tags: [] }))

    const result = await runNlpIntelligenceAnalysis(fakeReport, fakeNlpSectionData, fakeLlmConfig, undefined, undefined, fakeSensorSets)

    // Cluster 0: 80% positive -> 'positive'
    expect(result.trend!.topics[0].sentiment).toBe('positive')
    // Cluster 1: 60% neutral, 40% negative -> 'mixed' (top < 0.5 not met, but 0.6 >= 0.5 so 'neutral')
    expect(result.trend!.topics[1].sentiment).toBe('neutral')
  })

  it('includes NLP sentiment in topic LLM input', async () => {
    // cluster summaries
    mockChat.mockResolvedValueOnce(JSON.stringify({ summary: 'test', tags: [] }))
    mockChat.mockResolvedValueOnce(JSON.stringify({ summary: 'test', tags: [] }))
    // topic intelligence — capture the input
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'test', topics: [], tags: [],
    }))
    // remaining calls
    mockChat.mockResolvedValue(JSON.stringify({ summary: 'test' }))

    await runNlpIntelligenceAnalysis(fakeReport, fakeNlpSectionData, fakeLlmConfig, undefined, undefined, fakeSensorSets)

    // The third call should be for topics — check the user content includes sentiment labels
    const topicCall = mockChat.mock.calls[2]
    const userContent = topicCall[0][1].content as string
    expect(userContent).toContain('(positive)')  // item-7 has positive sentiment
    expect(userContent).toContain('(negative)')  // item-8 has negative sentiment
    expect(userContent).toContain('## Topic: AI')
    expect(userContent).toContain('## Topic: programming')
  })
})
