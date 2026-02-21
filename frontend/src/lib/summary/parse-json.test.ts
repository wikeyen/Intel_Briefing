// ABOUTME: Tests for JSON parsing utilities used by the summarizer.
// ABOUTME: Validates parsing, code fence stripping, and fallback behavior for malformed LLM output.
import { describe, it, expect } from 'vitest'
import { parseSensorJson, parseOverallJson } from './parse-json'

describe('parseSensorJson', () => {
  it('parses valid JSON with summary and items', () => {
    const input = JSON.stringify({
      summary: 'AI trends are accelerating.',
      items: [
        { title: 'GPT-5 released', url: 'https://example.com/1', brief: 'Major release' },
        { title: 'Rust 2.0', url: 'https://example.com/2', brief: 'Systems language update' },
      ],
    })

    const result = parseSensorJson(input)
    expect(result.summary).toBe('AI trends are accelerating.')
    expect(result.items).toHaveLength(2)
    expect(result.items[0].title).toBe('GPT-5 released')
    expect(result.items[0].url).toBe('https://example.com/1')
    expect(result.items[1].brief).toBe('Systems language update')
  })

  it('strips markdown code fences', () => {
    const input = '```json\n{"summary": "Fenced output.", "items": []}\n```'
    const result = parseSensorJson(input)
    expect(result.summary).toBe('Fenced output.')
    expect(result.items).toEqual([])
  })

  it('falls back to raw text when JSON is invalid', () => {
    const input = 'This is just plain text from the LLM.'
    const result = parseSensorJson(input)
    expect(result.summary).toBe('This is just plain text from the LLM.')
    expect(result.items).toEqual([])
  })

  it('handles JSON with missing items array', () => {
    const input = JSON.stringify({ summary: 'No items field.' })
    const result = parseSensorJson(input)
    expect(result.summary).toBe('No items field.')
    expect(result.items).toEqual([])
  })

  it('filters out malformed items', () => {
    const input = JSON.stringify({
      summary: 'Test',
      items: [
        { title: 'Valid', url: 'https://example.com', brief: 'OK' },
        'not-an-object',
        null,
        { no_title: true },
      ],
    })
    const result = parseSensorJson(input)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].title).toBe('Valid')
  })
})

describe('parseOverallJson', () => {
  it('parses valid JSON with executive_summary and sections', () => {
    const input = JSON.stringify({
      executive_summary: 'AI continues to dominate.',
      sections: [
        {
          title: 'AI Products',
          entries: [{ text: 'New model released', source: 'Product Hunt' }],
        },
      ],
    })

    const result = parseOverallJson(input)
    expect(result.executive_summary).toBe('AI continues to dominate.')
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].title).toBe('AI Products')
    expect(result.sections[0].entries).toHaveLength(1)
  })

  it('strips markdown code fences', () => {
    const input = '```json\n{"executive_summary": "Test summary", "sections": []}\n```'
    const result = parseOverallJson(input)
    expect(result.executive_summary).toBe('Test summary')
  })

  it('falls back to single-section wrapper for plain text', () => {
    const input = 'This is a plain text executive briefing.'
    const result = parseOverallJson(input)
    expect(result.quick_scan).toEqual([])
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].title).toBe('Briefing')
    expect(result.sections[0].entries[0].text).toBe(input)
  })

  it('handles missing sections array', () => {
    const input = JSON.stringify({ executive_summary: 'Summary here' })
    const result = parseOverallJson(input)
    expect(result.executive_summary).toBe('Summary here')
    expect(result.sections).toEqual([])
  })

  it('parses refs on entries', () => {
    const input = JSON.stringify({
      executive_summary: 'AI is advancing.',
      sections: [
        {
          title: 'AI Products',
          entries: [
            { text: 'New model', source: 'PH', refs: [{ title: 'Launch', url: 'https://ph.com/1' }] },
            { text: 'No refs entry', source: 'GH' },
          ],
        },
      ],
    })

    const result = parseOverallJson(input)
    expect(result.sections[0].entries[0].refs).toHaveLength(1)
    expect(result.sections[0].entries[0].refs[0].url).toBe('https://ph.com/1')
    expect(result.sections[0].entries[1].refs).toEqual([])
  })

  it('filters out refs with missing urls', () => {
    const input = JSON.stringify({
      executive_summary: '',
      sections: [
        {
          title: 'Test Section',
          entries: [
            {
              text: 'Test',
              source: 'HN',
              refs: [
                { title: 'Valid', url: 'https://example.com' },
                { title: 'Missing URL' },
                null,
              ],
            },
          ],
        },
      ],
    })
    const result = parseOverallJson(input)
    expect(result.sections[0].entries[0].refs).toHaveLength(1)
  })

  it('filters out malformed sections', () => {
    const input = JSON.stringify({
      executive_summary: '',
      sections: [
        { title: 'Good', entries: [{ text: 'Entry', source: 'X' }] },
        { no_title: true },
      ],
    })
    const result = parseOverallJson(input)
    expect(result.sections).toHaveLength(1)
  })

  it('parses sentiment analysis block', () => {
    const input = JSON.stringify({
      executive_summary: '',
      sections: [],
      sentiment: {
        overall_mood: 'bearish',
        mood_summary: 'Market uncertainty rising',
        controversies: [
          { topic: 'AI Regulation', analysis: 'Tech vs regulators', refs: [{ title: 'Article', url: 'https://example.com/1' }] },
        ],
        opinion_shifts: [
          { topic: 'Crypto sentiment', analysis: 'Turning cautious' },
        ],
        risk_flags: [],
      },
    })
    const result = parseOverallJson(input)
    expect(result.sentiment.overall_mood).toBe('bearish')
    expect(result.sentiment.mood_summary).toBe('Market uncertainty rising')
    expect(result.sentiment.controversies).toHaveLength(1)
    expect(result.sentiment.controversies[0].topic).toBe('AI Regulation')
    expect(result.sentiment.controversies[0].refs).toHaveLength(1)
    expect(result.sentiment.opinion_shifts).toHaveLength(1)
    expect(result.sentiment.opinion_shifts[0].refs).toEqual([])
    expect(result.sentiment.risk_flags).toEqual([])
  })

  it('defaults sentiment when missing or invalid', () => {
    const noSentiment = JSON.stringify({ executive_summary: '', sections: [] })
    const result1 = parseOverallJson(noSentiment)
    expect(result1.sentiment.overall_mood).toBe('neutral')
    expect(result1.sentiment.mood_summary).toBe('')
    expect(result1.sentiment.controversies).toEqual([])

    const badMood = JSON.stringify({ executive_summary: '', sections: [], sentiment: { overall_mood: 'invalid' } })
    const result2 = parseOverallJson(badMood)
    expect(result2.sentiment.overall_mood).toBe('neutral')
  })

  it('extracts JSON when LLM adds preamble text', () => {
    const json = JSON.stringify({
      executive_summary: 'A busy day in tech.',
      sections: [{ title: 'Tech', entries: [{ text: 'Big release', source: 'GH', refs: [] }] }],
      sentiment: { overall_mood: 'bullish', mood_summary: 'Optimism', controversies: [], opinion_shifts: [], risk_flags: [] },
    })
    const input = `Here is the briefing summary:\n\n${json}\n\nI hope this helps!`
    const result = parseOverallJson(input)
    expect(result.executive_summary).toBe('A busy day in tech.')
    expect(result.sections).toHaveLength(1)
    expect(result.sentiment.overall_mood).toBe('bullish')
  })

  it('extracts sensor JSON when LLM adds preamble text', () => {
    const json = JSON.stringify({
      summary: 'Top stories from HN.',
      items: [{ title: 'Story 1', url: 'https://example.com', brief: 'Hot topic' }],
    })
    const input = `Sure, here is the summary:\n${json}`
    const result = parseSensorJson(input)
    expect(result.summary).toBe('Top stories from HN.')
    expect(result.items).toHaveLength(1)
  })

  it('filters malformed sentiment entries', () => {
    const input = JSON.stringify({
      executive_summary: '',
      sections: [],
      sentiment: {
        overall_mood: 'mixed',
        mood_summary: 'Test',
        controversies: [
          { topic: 'Valid', analysis: 'Analysis' },
          'not-an-object',
          null,
          { no_topic: true },
        ],
        opinion_shifts: 'not-array',
        risk_flags: [],
      },
    })
    const result = parseOverallJson(input)
    expect(result.sentiment.controversies).toHaveLength(1)
    expect(result.sentiment.opinion_shifts).toEqual([])
  })
})

  it('repairs JSON with unescaped double quotes in string values', () => {
    // Simulates LLM output where source titles contain unescaped quotes
    const input = `{
  "executive_summary": "A summary with "quoted words" inside.",
  "sections": [
    {"title": "港股科技股分化："AI新贵"受追捧", "entries": [{"text": "Test entry", "source": "WSJ"}]}
  ],
  "sentiment": {"overall_mood": "mixed", "mood_summary": "Test", "controversies": [], "opinion_shifts": [], "risk_flags": []}
}`
    const result = parseOverallJson(input)
    expect(result.executive_summary.length).toBeGreaterThan(0)
    expect(result.sections.length).toBeGreaterThanOrEqual(1)
    expect(result.sentiment.overall_mood).toBe('mixed')
  })

  it('repairs sensor JSON with unescaped double quotes', () => {
    const input = `{"summary": "港股科技股分化：\"AI新贵\"受追捧", "items": [{"title": "Test article", "url": "https://example.com", "brief": "OK"}]}`
    const result = parseSensorJson(input)
    expect(result.summary).toContain('港股')
    expect(result.items).toHaveLength(1)
  })
