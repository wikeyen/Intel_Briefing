// ABOUTME: Tests for NLP sidecar client — validates request building and response parsing.
// ABOUTME: Uses mocked fetch to avoid requiring a running sidecar.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeItems, checkHealth, NlpAnalyzeResponse } from '../nlp-client'

const mockResponse: NlpAnalyzeResponse = {
  items: [
    {
      id: 'test-1',
      keywords: [{ text: 'ai', weight: 0.9 }],
      sentiment: { label: 'positive', score: 0.85 },
      entities: { people: [], orgs: ['OpenAI'], places: [] },
    },
  ],
  clusters: [
    {
      id: 0,
      label: 'ai',
      item_ids: ['test-1'],
      top_keywords: [{ text: 'ai', weight: 0.9 }],
      sentiment_distribution: { positive: 1.0, neutral: 0, negative: 0 },
      representative_items: ['test-1'],
    },
  ],
}

describe('NLP client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends items and parses response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })
    const result = await analyzeItems([{ id: 'test-1', title: 'OpenAI releases GPT-5', lang: 'en' }])
    expect(result).toBeDefined()
    expect(result!.items).toHaveLength(1)
    expect(result!.clusters).toHaveLength(1)
  })

  it('returns null when sidecar is down', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await analyzeItems([{ id: 'test-1', title: 'test', lang: 'en' }])
    expect(result).toBeNull()
  })

  it('health check returns status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ready', models_loaded: true }),
    })
    const result = await checkHealth()
    expect(result).toBe(true)
  })

  it('health check returns false when down', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await checkHealth()
    expect(result).toBe(false)
  })
})
