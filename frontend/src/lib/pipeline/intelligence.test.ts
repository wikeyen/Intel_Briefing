// ABOUTME: Tests for intelligence analysis pipeline — JSON parsing and item filtering.
// ABOUTME: Covers think-tag stripping, code-fence stripping, broken JSON repair, and account filter logic.

import { describe, it, expect } from 'vitest'
import { robustJsonParse, runIntelligenceAnalysis } from './intelligence'
import { createReport } from '../models'
import type { IntelItem } from '../models'

describe('robustJsonParse', () => {
  it('parses clean JSON', () => {
    const result = robustJsonParse('{"summary":"hello","topics":[]}')
    expect(result).toEqual({ summary: 'hello', topics: [] })
  })

  it('strips <think> blocks before parsing', () => {
    const raw = '<think>\nLet me analyze {these items} carefully...\n</think>\n{"summary":"parsed","topics":[]}'
    const result = robustJsonParse(raw)
    expect(result).toEqual({ summary: 'parsed', topics: [] })
  })

  it('handles <think> blocks with curly braces inside', () => {
    const raw = `<think>
The user wants me to analyze trends. I see {weibo: 50, douyin: 30} items.
Let me structure {my response} carefully.
</think>
{"summary":"Chinese social media trends","topics":[{"name":"AI","heat":90}]}`
    const result = robustJsonParse(raw)
    expect(result).not.toBeNull()
    expect(result!.summary).toBe('Chinese social media trends')
    expect((result!.topics as Array<{ name: string }>)[0].name).toBe('AI')
  })

  it('strips markdown code fences', () => {
    const raw = '```json\n{"summary":"fenced","topics":[]}\n```'
    const result = robustJsonParse(raw)
    expect(result).toEqual({ summary: 'fenced', topics: [] })
  })

  it('handles both <think> and code fences together', () => {
    const raw = `<think>thinking {stuff}...</think>
\`\`\`json
{"summary":"both","topics":[]}
\`\`\``
    const result = robustJsonParse(raw)
    expect(result).toEqual({ summary: 'both', topics: [] })
  })

  it('extracts JSON from surrounding text', () => {
    const raw = 'Here is my analysis:\n{"summary":"extracted","topics":[]}\nHope that helps!'
    const result = robustJsonParse(raw)
    expect(result).toEqual({ summary: 'extracted', topics: [] })
  })

  it('repairs trailing commas', () => {
    const raw = '{"summary":"repaired","topics":[],}'
    const result = robustJsonParse(raw)
    expect(result).not.toBeNull()
    expect(result!.summary).toBe('repaired')
  })

  it('returns null for completely unparseable input', () => {
    const result = robustJsonParse('This is just plain text with no JSON at all.')
    expect(result).toBeNull()
  })

  it('handles case-insensitive think tags', () => {
    const raw = '<THINK>reasoning {with braces}</THINK>{"summary":"case","topics":[]}'
    const result = robustJsonParse(raw)
    expect(result).toEqual({ summary: 'case', topics: [] })
  })
})

describe('runIntelligenceAnalysis', () => {
  it('excludes rss_news items from accounts (voices) analysis', async () => {
    const rssNewsItems: IntelItem[] = [
      { id: 'rss-1', source: 'rss_news', title: 'Breaking news', url: 'https://example.com/1', account: 'Reuters RSS' },
      { id: 'rss-2', source: 'rss_news', title: 'Market update', url: 'https://example.com/2', account: 'AP News RSS' },
    ]
    const rssFeedItems: IntelItem[] = [
      { id: 'rss-3', source: 'rss_feeds', title: 'Blog post', url: 'https://example.com/3', account: 'Tech Blog' },
    ]

    const report = createReport({
      date: '2026-02-24',
      fetched_at: new Date().toISOString(),
      items: { feeds: [...rssNewsItems, ...rssFeedItems] } as Record<string, IntelItem[]>,
    })

    // No LLM needed — all three analyses should return null
    // because no items match trend (wrong category), topic (no topic field),
    // or accounts (no social-category items).
    const dummyLlm = { base_url: '', api_key: null, model: '' }
    const result = await runIntelligenceAnalysis(report, dummyLlm)

    expect(result.accounts).toBeNull()
    expect(result.trend).toBeNull()
    expect(result.topics).toBeNull()
  })
})
