// ABOUTME: Tests for intelligence analysis — verifies LLM retry logic and JSON parsing.
// ABOUTME: Uses mocked chatCompletion to simulate LLM failures and recovery.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { robustJsonParse, analyzeTrendIntelligence, analyzeAccountsIntelligence } from '../intelligence'
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

describe('robustJsonParse', () => {
  it('parses clean JSON', () => {
    const result = robustJsonParse('{"key": "value"}')
    expect(result).toEqual({ key: 'value' })
  })

  it('strips markdown fences', () => {
    const result = robustJsonParse('```json\n{"key": "value"}\n```')
    expect(result).toEqual({ key: 'value' })
  })

  it('strips think blocks', () => {
    const result = robustJsonParse('<think>reasoning here</think>{"key": "value"}')
    expect(result).toEqual({ key: 'value' })
  })

  it('returns null for garbage', () => {
    expect(robustJsonParse('not json at all')).toBeNull()
  })
})

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
