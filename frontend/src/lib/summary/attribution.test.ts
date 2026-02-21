// ABOUTME: Tests for the post-hoc citation attribution module.
// ABOUTME: Validates prompt builders, result parsers, and marker stripping logic.

import { describe, it, expect } from 'vitest'
import type { BriefingEntry, BriefingSource, SentimentEntry } from '../models'
import {
  ATTRIBUTION_SYSTEM_PROMPT,
  buildSectionAttributionPrompt,
  buildExecSummaryAttributionPrompt,
  buildSentimentAttributionPrompt,
  parseSectionAttributionResult,
  parseTextAttributionResult,
  parseSentimentAttributionResult,
  stripInvalidMarkers,
} from './attribution'

// -- Test fixtures --

const sources: BriefingSource[] = [
  { id: 1, title: 'GPT-5 Release', url: 'https://example.com/1', sensor: 'hacker_news', brief: 'Major release' },
  { id: 2, title: 'React 20', url: 'https://example.com/2', sensor: 'github' },
  { id: 3, title: 'Fed Rate Cut', url: 'https://example.com/3', sensor: 'wallstreetcn', brief: 'Policy shift' },
]

const entries: BriefingEntry[] = [
  { text: 'GPT-5 marks a major leap in AI capabilities.', source: 'hacker_news', refs: [] },
  { text: 'React 20 introduces server components by default.', source: 'github', refs: [] },
]

const sentimentContros: SentimentEntry[] = [
  { topic: 'AI Safety', analysis: 'Heated debate on alignment approaches.', refs: [] },
]

const sentimentShifts: SentimentEntry[] = [
  { topic: 'Rate Policy', analysis: 'Market shifted from hawkish to dovish outlook.', refs: [] },
]

const sentimentRisks: SentimentEntry[] = []

// -- System prompt --

describe('ATTRIBUTION_SYSTEM_PROMPT', () => {
  it('contains citation marker instruction', () => {
    expect(ATTRIBUTION_SYSTEM_PROMPT).toContain('[N]')
  })

  it('instructs not to modify original text', () => {
    expect(ATTRIBUTION_SYSTEM_PROMPT).toContain('不要修改原文')
  })

  it('warns against fabricating source IDs', () => {
    expect(ATTRIBUTION_SYSTEM_PROMPT).toContain('不要编造')
  })
})

// -- buildSectionAttributionPrompt --

describe('buildSectionAttributionPrompt', () => {
  it('includes all entry texts as a numbered list', () => {
    const prompt = buildSectionAttributionPrompt(entries, sources)
    expect(prompt).toContain('1. GPT-5 marks a major leap')
    expect(prompt).toContain('2. React 20 introduces server components')
  })

  it('includes source IDs for sensors relevant to entries', () => {
    const prompt = buildSectionAttributionPrompt(entries, sources)
    // entries reference hacker_news and github — sources [1] and [2]
    expect(prompt).toContain('[1]')
    expect(prompt).toContain('[2]')
  })

  it('scopes sources to entry sensors', () => {
    const prompt = buildSectionAttributionPrompt(entries, sources)
    // wallstreetcn source [3] should be excluded — no entry uses that sensor
    expect(prompt).not.toContain('[3]')
  })

  it('falls back to all sources when no sensor match found', () => {
    const orphanEntries: BriefingEntry[] = [
      { text: 'Something from unknown.', source: 'nonexistent_sensor', refs: [] },
    ]
    const prompt = buildSectionAttributionPrompt(orphanEntries, sources)
    // Should include all three sources as fallback
    expect(prompt).toContain('[1]')
    expect(prompt).toContain('[2]')
    expect(prompt).toContain('[3]')
  })

  it('specifies expected count in the output instruction', () => {
    const prompt = buildSectionAttributionPrompt(entries, sources)
    expect(prompt).toContain(`${entries.length}条`)
  })

  it('includes source brief when available', () => {
    const prompt = buildSectionAttributionPrompt(entries, sources)
    expect(prompt).toContain('Major release')
  })
})

// -- buildExecSummaryAttributionPrompt --

describe('buildExecSummaryAttributionPrompt', () => {
  it('includes the full executive summary text', () => {
    const text = 'Today AI and finance converge in unexpected ways.'
    const prompt = buildExecSummaryAttributionPrompt(text, sources)
    expect(prompt).toContain(text)
  })

  it('includes all source IDs regardless of sensor', () => {
    const prompt = buildExecSummaryAttributionPrompt('summary text', sources)
    expect(prompt).toContain('[1]')
    expect(prompt).toContain('[2]')
    expect(prompt).toContain('[3]')
  })

  it('requests JSON object output with attributed_text field', () => {
    const prompt = buildExecSummaryAttributionPrompt('text', sources)
    expect(prompt).toContain('attributed_text')
  })
})

// -- buildSentimentAttributionPrompt --

describe('buildSentimentAttributionPrompt', () => {
  it('includes all three sentiment categories', () => {
    const prompt = buildSentimentAttributionPrompt(sentimentContros, sentimentShifts, sentimentRisks, sources)
    expect(prompt).toContain('争议话题')
    expect(prompt).toContain('舆论转向')
    expect(prompt).toContain('风险信号')
  })

  it('includes controversy and shift entry content', () => {
    const prompt = buildSentimentAttributionPrompt(sentimentContros, sentimentShifts, sentimentRisks, sources)
    expect(prompt).toContain('AI Safety')
    expect(prompt).toContain('Rate Policy')
  })

  it('marks empty categories with placeholder', () => {
    const prompt = buildSentimentAttributionPrompt(sentimentContros, sentimentShifts, sentimentRisks, sources)
    // riskFlags is empty
    expect(prompt).toContain('（无）')
  })

  it('includes all source IDs', () => {
    const prompt = buildSentimentAttributionPrompt(sentimentContros, sentimentShifts, sentimentRisks, sources)
    expect(prompt).toContain('[1]')
    expect(prompt).toContain('[3]')
  })
})

// -- parseSectionAttributionResult --

describe('parseSectionAttributionResult', () => {
  it('parses a valid JSON array of strings', () => {
    const raw = '["Entry one [1]", "Entry two [2]"]'
    const result = parseSectionAttributionResult(raw, 2)
    expect(result).toEqual(['Entry one [1]', 'Entry two [2]'])
  })

  it('returns null when array length does not match expected count', () => {
    const raw = '["Entry one [1]"]'
    const result = parseSectionAttributionResult(raw, 2)
    expect(result).toBeNull()
  })

  it('handles markdown code fences', () => {
    const raw = '```json\n["Entry one [1]", "Entry two [2]"]\n```'
    const result = parseSectionAttributionResult(raw, 2)
    expect(result).toEqual(['Entry one [1]', 'Entry two [2]'])
  })

  it('returns null for completely invalid input', () => {
    const result = parseSectionAttributionResult('not json at all', 1)
    expect(result).toBeNull()
  })

  it('extracts JSON array from surrounding text', () => {
    const raw = 'Here is the result: ["A [1]", "B [2]"] hope this helps'
    const result = parseSectionAttributionResult(raw, 2)
    expect(result).toEqual(['A [1]', 'B [2]'])
  })

  it('converts non-string elements to strings', () => {
    const raw = '[123, true]'
    const result = parseSectionAttributionResult(raw, 2)
    expect(result).toEqual(['123', 'true'])
  })
})

// -- parseTextAttributionResult --

describe('parseTextAttributionResult', () => {
  it('parses JSON object with attributed_text field', () => {
    const raw = '{"attributed_text": "AI is evolving [1] rapidly [2]."}'
    const result = parseTextAttributionResult(raw)
    expect(result).toBe('AI is evolving [1] rapidly [2].')
  })

  it('falls back to plain text when JSON is invalid', () => {
    const raw = 'AI is evolving [1] rapidly [2].'
    const result = parseTextAttributionResult(raw)
    expect(result).toBe('AI is evolving [1] rapidly [2].')
  })

  it('handles code fences around JSON', () => {
    const raw = '```json\n{"attributed_text": "text [1]"}\n```'
    const result = parseTextAttributionResult(raw)
    expect(result).toBe('text [1]')
  })

  it('extracts JSON object from surrounding text', () => {
    const raw = 'Sure! {"attributed_text": "hello [3]"} done.'
    const result = parseTextAttributionResult(raw)
    expect(result).toBe('hello [3]')
  })

  it('returns cleaned text when JSON lacks attributed_text key', () => {
    const raw = '{"other_key": "value"}'
    const result = parseTextAttributionResult(raw)
    expect(result).toBe('{"other_key": "value"}')
  })
})

// -- parseSentimentAttributionResult --

describe('parseSentimentAttributionResult', () => {
  it('parses valid sentiment JSON with all three categories', () => {
    const raw = JSON.stringify({
      controversies: [{ topic: 'AI Safety', analysis: 'Debate [1] ongoing.' }],
      opinion_shifts: [{ topic: 'Rates', analysis: 'Shifted [3] dovish.' }],
      risk_flags: [],
    })
    const result = parseSentimentAttributionResult(raw)
    expect(result).not.toBeNull()
    expect(result!.controversies).toHaveLength(1)
    expect(result!.controversies[0].topic).toBe('AI Safety')
    expect(result!.controversies[0].analysis).toContain('[1]')
    expect(result!.opinion_shifts).toHaveLength(1)
    expect(result!.risk_flags).toHaveLength(0)
  })

  it('handles code fences', () => {
    const json = JSON.stringify({
      controversies: [],
      opinion_shifts: [],
      risk_flags: [{ topic: 'Supply Chain', analysis: 'Disruption risk [2]' }],
    })
    const raw = '```json\n' + json + '\n```'
    const result = parseSentimentAttributionResult(raw)
    expect(result).not.toBeNull()
    expect(result!.risk_flags).toHaveLength(1)
    expect(result!.risk_flags[0].topic).toBe('Supply Chain')
  })

  it('returns null for completely invalid input', () => {
    const result = parseSentimentAttributionResult('just garbage text')
    expect(result).toBeNull()
  })

  it('returns empty arrays for missing categories', () => {
    const raw = '{"controversies": [{"topic": "X", "analysis": "Y"}]}'
    const result = parseSentimentAttributionResult(raw)
    expect(result).not.toBeNull()
    expect(result!.controversies).toHaveLength(1)
    expect(result!.opinion_shifts).toHaveLength(0)
    expect(result!.risk_flags).toHaveLength(0)
  })

  it('filters entries without topic field', () => {
    const raw = JSON.stringify({
      controversies: [
        { topic: 'Valid', analysis: 'OK' },
        { analysis: 'Missing topic' },
      ],
      opinion_shifts: [],
      risk_flags: [],
    })
    const result = parseSentimentAttributionResult(raw)
    expect(result!.controversies).toHaveLength(1)
    expect(result!.controversies[0].topic).toBe('Valid')
  })

  it('populates empty refs array on parsed entries', () => {
    const raw = JSON.stringify({
      controversies: [{ topic: 'T', analysis: 'A' }],
      opinion_shifts: [],
      risk_flags: [],
    })
    const result = parseSentimentAttributionResult(raw)
    expect(result!.controversies[0].refs).toEqual([])
  })
})

// -- stripInvalidMarkers --

describe('stripInvalidMarkers', () => {
  it('keeps markers with valid IDs', () => {
    const text = 'AI is evolving [1] and accelerating [3].'
    const result = stripInvalidMarkers(text, new Set([1, 3]))
    expect(result).toBe('AI is evolving [1] and accelerating [3].')
  })

  it('strips markers with invalid IDs', () => {
    const text = 'AI is evolving [1] and accelerating [99].'
    const result = stripInvalidMarkers(text, new Set([1, 2, 3]))
    expect(result).toBe('AI is evolving [1] and accelerating .')
  })

  it('handles text with no markers at all', () => {
    const text = 'Plain text without any markers.'
    const result = stripInvalidMarkers(text, new Set([1, 2]))
    expect(result).toBe('Plain text without any markers.')
  })

  it('strips all markers when validIds is empty', () => {
    const text = 'Something [1] here [2] and [3].'
    const result = stripInvalidMarkers(text, new Set())
    expect(result).toBe('Something  here  and .')
  })

  it('handles adjacent markers correctly', () => {
    const text = 'Claim [1][2][3] end.'
    const result = stripInvalidMarkers(text, new Set([1, 3]))
    expect(result).toBe('Claim [1][3] end.')
  })

  it('does not strip non-numeric brackets', () => {
    const text = 'See [note] and [1] here.'
    const result = stripInvalidMarkers(text, new Set([1]))
    expect(result).toBe('See [note] and [1] here.')
  })
})
