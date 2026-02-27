// ABOUTME: Tests for NLP sidecar client — validates batched /enrich + /cluster calls.
// ABOUTME: Uses mocked fetch to avoid requiring a running sidecar.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeItems, checkHealth, NlpAnalyzeResponse } from '../nlp-client'

const mockEnrichResponse = {
  items: [
    {
      id: 'test-1',
      keywords: [{ text: 'ai', weight: 0.9 }],
      sentiment: { label: 'positive', score: 0.85 },
      entities: { people: [], orgs: ['OpenAI'], places: [] },
    },
  ],
}

const mockClusterResponse = {
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

  it('sends items via /enrich then /cluster and parses response', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/enrich')) {
        return new Response(JSON.stringify(mockEnrichResponse))
      }
      if (urlStr.includes('/cluster')) {
        return new Response(JSON.stringify(mockClusterResponse))
      }
      return new Response('', { status: 404 })
    })

    const result = await analyzeItems([{ id: 'test-1', title: 'OpenAI releases GPT-5', lang: 'en' }])
    expect(result).toBeDefined()
    expect(result!.items).toHaveLength(1)
    expect(result!.clusters).toHaveLength(1)
  })

  it('returns null when sidecar is down', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await analyzeItems([{ id: 'test-1', title: 'test', lang: 'en' }])
    expect(result).toBeNull()
  })

  it('batches items into chunks of 200 for /enrich', async () => {
    const fetchCalls: string[] = []
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      fetchCalls.push(urlStr)
      if (urlStr.includes('/enrich')) {
        return new Response(JSON.stringify({
          items: [{ id: 'x', keywords: [], sentiment: { label: 'neutral', score: 0.5 }, entities: { people: [], orgs: [], places: [] } }],
        }))
      }
      if (urlStr.includes('/cluster')) {
        return new Response(JSON.stringify({ clusters: [] }))
      }
      return new Response('', { status: 404 })
    })

    // Send 450 items — should result in 3 /enrich calls + 1 /cluster call
    const items = Array.from({ length: 450 }, (_, i) => ({
      id: `item-${i}`,
      title: `Title ${i}`,
      lang: 'en',
    }))
    const result = await analyzeItems(items)

    expect(result).not.toBeNull()
    const enrichCalls = fetchCalls.filter(u => u.includes('/enrich'))
    const clusterCalls = fetchCalls.filter(u => u.includes('/cluster'))
    expect(enrichCalls).toHaveLength(3)  // 200 + 200 + 50
    expect(clusterCalls).toHaveLength(1)
  })

  it('reports progress via callback during batch processing', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.includes('/enrich')) {
        return new Response(JSON.stringify({
          items: [{ id: 'x', keywords: [], sentiment: { label: 'neutral', score: 0.5 }, entities: { people: [], orgs: [], places: [] } }],
        }))
      }
      if (urlStr.includes('/cluster')) {
        return new Response(JSON.stringify({ clusters: [{ id: 0, label: 'test', item_ids: ['x'], top_keywords: [], sentiment_distribution: {}, representative_items: [] }] }))
      }
      return new Response('', { status: 404 })
    })

    const messages: string[] = []
    const items = [{ id: 'p1', title: 'Test', lang: 'en' }]
    await analyzeItems(items, (msg) => messages.push(msg))

    expect(messages.length).toBeGreaterThanOrEqual(3)
    expect(messages[0]).toContain('Enriching batch')
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('Enrichment complete'),
      expect.stringContaining('Clustering'),
      expect.stringContaining('Analysis complete'),
    ]))
  })

  it('health check returns status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ready', models_loaded: true }),
    })
    const result = await checkHealth()
    expect(result).toBe(true)
  })

  it('health check returns false when down', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await checkHealth()
    expect(result).toBe(false)
  })
})
