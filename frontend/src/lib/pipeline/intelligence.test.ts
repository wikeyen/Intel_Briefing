// ABOUTME: Tests for intelligence analysis pipeline — JSON parsing robustness.
// ABOUTME: Covers think-tag stripping, code-fence stripping, and broken JSON repair.

import { describe, it, expect } from 'vitest'
import { robustJsonParse } from './intelligence'

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
