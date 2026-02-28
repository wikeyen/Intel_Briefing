// ABOUTME: Tests for intelligence analysis — verifies LLM retry logic and JSON parsing.
// ABOUTME: Uses mocked chatCompletion to simulate LLM failures and recovery.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeTrendIntelligence, analyzeTopicIntelligence, analyzeAccountsIntelligence } from '../intelligence'
import type { IntelItem } from '../../models'
import type { LlmConfig } from '../../summary/llm'

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

const fakeTrendItem: IntelItem = {
  id: '1',
  title: 'Test trend',
  url: 'https://example.com',
  source: 'weibo',
  heat: '90',
}

const fakeAccountItem: IntelItem = {
  id: '2',
  title: 'Test post by user',
  url: 'https://x.com/test/1',
  source: 'x',
  account: 'Test User',
  handle: 'testuser',
}

const fakeTopicItem: IntelItem = {
  id: '3',
  title: 'AI regulation debate heats up',
  url: 'https://bsky.app/post/123',
  source: 'bluesky',
  topic: 'AI Regulation',
}

describe('analyzeTrendIntelligence', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns null for empty items', async () => {
    const result = await analyzeTrendIntelligence([], fakeLlmConfig)
    expect(result).toBeNull()
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('parses valid LLM response', async () => {
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'AI is trending',
      topics: [{ name: 'AI', summary: 'Hot topic', sentiment: 'positive', sources: ['weibo'], itemCount: 1, heat: 90 }],
      tags: [{ text: 'AI', weight: 0.9, sentiment: 'positive' }],
    }))

    const result = await analyzeTrendIntelligence([fakeTrendItem], fakeLlmConfig)
    expect(result).not.toBeNull()
    expect(result!.summary).toBe('AI is trending')
    expect(result!.topics).toHaveLength(1)
    expect(mockChat).toHaveBeenCalledTimes(1)
  })

  it('retries once on JSON parse failure then succeeds', async () => {
    // First call returns garbage
    mockChat.mockResolvedValueOnce('I cannot produce JSON because...')
    // Retry returns valid JSON
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'Recovered',
      topics: [],
      tags: [],
    }))

    const result = await analyzeTrendIntelligence([fakeTrendItem], fakeLlmConfig)
    expect(result).not.toBeNull()
    expect(result!.summary).toBe('Recovered')
    expect(mockChat).toHaveBeenCalledTimes(2)
    // Verify retry message includes the nudge
    const retryMessages = mockChat.mock.calls[1][0]
    expect(retryMessages[retryMessages.length - 1].content).toContain('not valid JSON')
  })

  it('returns null when both attempts fail', async () => {
    mockChat.mockResolvedValueOnce('garbage')
    mockChat.mockResolvedValueOnce('still garbage')

    const result = await analyzeTrendIntelligence([fakeTrendItem], fakeLlmConfig)
    expect(result).toBeNull()
    expect(mockChat).toHaveBeenCalledTimes(2)
  })
})

describe('analyzeTopicIntelligence', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns null for empty items', async () => {
    const result = await analyzeTopicIntelligence([], fakeLlmConfig)
    expect(result).toBeNull()
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('uses per-topic LLM calls then a merge call', async () => {
    // Per-topic call for "AI Regulation"
    mockChat.mockResolvedValueOnce(JSON.stringify({
      sentiment: 'mixed',
      summary: 'Debate ongoing',
      items: [
        { title: 'New EU AI Act provisions', url: 'https://example.com/1', brief: 'EU tightens AI rules' },
        { title: 'US proposes AI guidelines', url: 'https://example.com/2', brief: 'Lighter touch from US' },
      ],
      tags: [{ text: 'AI Regulation', weight: 0.9, sentiment: 'mixed' }],
    }))
    // Merge call
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'AI regulation is a hot topic',
      tags: [{ text: 'AI Regulation', weight: 0.9, sentiment: 'mixed' }],
    }))

    const result = await analyzeTopicIntelligence([fakeTopicItem], fakeLlmConfig)
    expect(result).not.toBeNull()
    expect(result!.topics).toHaveLength(1)
    expect(result!.topics[0].topic).toBe('AI Regulation')
    expect(result!.topics[0].items).toHaveLength(2)
    expect(result!.topics[0].items[0]).toEqual({
      title: 'New EU AI Act provisions',
      url: 'https://example.com/1',
      brief: 'EU tightens AI rules',
    })
    expect(result!.summary).toBe('AI regulation is a hot topic')
    // 1 per-topic call + 1 merge call = 2
    expect(mockChat).toHaveBeenCalledTimes(2)
  })

  it('includes item URLs in the per-topic LLM prompt', async () => {
    // Per-topic call
    mockChat.mockResolvedValueOnce(JSON.stringify({
      sentiment: 'neutral', summary: 'Test', items: [], tags: [],
    }))
    // Merge call
    mockChat.mockResolvedValueOnce(JSON.stringify({ summary: 'Test', tags: [] }))

    await analyzeTopicIntelligence([fakeTopicItem], fakeLlmConfig)

    const userMessage = mockChat.mock.calls[0][0].find((m: { role: string }) => m.role === 'user')
    expect(userMessage?.content).toContain('https://bsky.app/post/123')
    expect(userMessage?.content).toContain('AI regulation debate heats up')
  })

  it('handles missing items array gracefully', async () => {
    // Per-topic call — no items array
    mockChat.mockResolvedValueOnce(JSON.stringify({
      sentiment: 'neutral', summary: 'Test', tags: [],
    }))
    // Merge call
    mockChat.mockResolvedValueOnce(JSON.stringify({ summary: 'Test', tags: [] }))

    const result = await analyzeTopicIntelligence([fakeTopicItem], fakeLlmConfig)
    expect(result).not.toBeNull()
    expect(result!.topics[0].items).toEqual([])
  })

  it('processes multiple topics in parallel and merges results', async () => {
    const items: IntelItem[] = [
      { id: 'a1', title: 'AI post 1', url: 'https://example.com/a1', source: 'bluesky', topic: 'AI' },
      { id: 'a2', title: 'AI post 2', url: 'https://example.com/a2', source: 'bluesky', topic: 'AI' },
      { id: 'c1', title: 'Crypto post 1', url: 'https://example.com/c1', source: 'x', topic: 'crypto' },
    ]

    // Per-topic call for AI
    mockChat.mockResolvedValueOnce(JSON.stringify({
      sentiment: 'positive', summary: 'AI hype', items: [], tags: [{ text: 'LLM', weight: 0.8, sentiment: 'positive' }],
    }))
    // Per-topic call for crypto
    mockChat.mockResolvedValueOnce(JSON.stringify({
      sentiment: 'neutral', summary: 'Crypto steady', items: [], tags: [{ text: 'Bitcoin', weight: 0.7, sentiment: 'neutral' }],
    }))
    // Merge call
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'AI and crypto both active', tags: [{ text: 'Technology', weight: 0.9, sentiment: 'neutral' }],
    }))

    const result = await analyzeTopicIntelligence(items, fakeLlmConfig)
    expect(result).not.toBeNull()
    expect(result!.topics).toHaveLength(2)
    expect(result!.topics.map(t => t.topic).sort()).toEqual(['AI', 'crypto'])
    expect(result!.summary).toBe('AI and crypto both active')
    // 2 per-topic + 1 merge = 3
    expect(mockChat).toHaveBeenCalledTimes(3)
  })
})

describe('analyzeAccountsIntelligence', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retries once on JSON parse failure then succeeds', async () => {
    mockChat.mockResolvedValueOnce('thinking about it...')
    mockChat.mockResolvedValueOnce(JSON.stringify({
      summary: 'Account analysis recovered',
      accounts: [{ account: 'Test User', handle: 'testuser', platform: 'x', themes: ['AI'], sentiment: 'neutral', postCount: 1 }],
      tags: [],
    }))

    const result = await analyzeAccountsIntelligence([fakeAccountItem], fakeLlmConfig)
    expect(result).not.toBeNull()
    expect(result!.accounts).toHaveLength(1)
    expect(mockChat).toHaveBeenCalledTimes(2)
  })
})
