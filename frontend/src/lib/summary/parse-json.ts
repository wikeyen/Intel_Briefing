// ABOUTME: JSON parsing utilities for LLM summary responses.
// ABOUTME: Handles code fence stripping, JSON repair, and fallback for malformed output.

import type { SensorSummaryItem, OverallBriefing, BriefingEntry, BriefingSection, BriefingRef, SentimentAnalysis, SentimentEntry } from '../models'
import { EMPTY_SENTIMENT } from '../models'
import { jsonrepair } from 'jsonrepair'

/** Strip LLM wrapper artifacts: <think> blocks and markdown code fences. */
function stripLlmWrapper(text: string): string {
  // Remove <think>...</think> blocks (Qwen, DeepSeek, etc.)
  const noThink = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // Remove markdown code fences
  const fenced = noThink.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  return fenced ? fenced[1].trim() : noThink
}

/**
 * Robustly parse JSON from LLM output.
 * Tries: direct parse → extract outermost braces → jsonrepair (handles unescaped quotes, etc.)
 */
function robustJsonParse(text: string): Record<string, unknown> | null {
  // 1. Direct parse
  try {
    const result = JSON.parse(text)
    if (result && typeof result === 'object') return result
  } catch { /* continue */ }

  // 2. Extract outermost { ... } and try again
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1)
    try {
      const result = JSON.parse(slice)
      if (result && typeof result === 'object') return result
    } catch { /* continue */ }

    // 3. Repair broken JSON (unescaped quotes, trailing commas, etc.)
    try {
      const repaired = jsonrepair(slice)
      const result = JSON.parse(repaired)
      if (result && typeof result === 'object') return result
    } catch { /* give up */ }
  }

  return null
}

/** Parsed sensor summary JSON from the LLM. */
export interface ParsedSensorJson {
  summary: string
  brief_summary: string
  items: SensorSummaryItem[]
}

/**
 * Parse a per-sensor LLM response as JSON.
 * Falls back to treating the entire response as plain text summary if parsing fails.
 */
export function parseSensorJson(raw: string): ParsedSensorJson {
  const cleaned = stripLlmWrapper(raw)
  const parsed = robustJsonParse(cleaned)

  if (parsed) {
    const summary = typeof parsed.summary === 'string' ? parsed.summary : cleaned
    const brief_summary = typeof parsed.brief_summary === 'string' ? parsed.brief_summary : ''
    const items: SensorSummaryItem[] = Array.isArray(parsed.items)
      ? parsed.items
          .filter((it: unknown) => it && typeof it === 'object' && 'title' in it)
          .map((it: { title?: string; url?: string; brief?: string }) => ({
            title: String(it.title ?? ''),
            url: String(it.url ?? ''),
            brief: String(it.brief ?? ''),
          }))
      : []
    return { summary, brief_summary, items }
  }

  return { summary: raw.trim(), brief_summary: '', items: [] }
}

/** Parse a single briefing entry, extracting refs if present. */
function parseEntry(e: unknown): BriefingEntry {
  const entry = e as Record<string, unknown>
  const refs: BriefingRef[] = Array.isArray(entry.refs)
    ? (entry.refs as unknown[])
        .filter((r: unknown) => r && typeof r === 'object' && 'url' in r)
        .map((r: unknown) => {
          const ref = r as Record<string, unknown>
          return { title: String(ref.title ?? ''), url: String(ref.url ?? '') }
        })
        .filter(r => r.url)
    : []
  return { text: String(entry.text ?? ''), source: String(entry.source ?? ''), refs }
}

/** Parse a single sentiment entry with topic, analysis, and refs. */
function parseSentimentEntry(e: unknown): SentimentEntry {
  const entry = e as Record<string, unknown>
  const refs: BriefingRef[] = Array.isArray(entry.refs)
    ? (entry.refs as unknown[])
        .filter((r: unknown) => r && typeof r === 'object' && 'url' in r)
        .map((r: unknown) => {
          const ref = r as Record<string, unknown>
          return { title: String(ref.title ?? ''), url: String(ref.url ?? '') }
        })
        .filter(r => r.url)
    : []
  return {
    topic: String(entry.topic ?? ''),
    analysis: String(entry.analysis ?? ''),
    refs,
  }
}

/** Parse the sentiment analysis block from parsed JSON. */
function parseSentiment(parsed: Record<string, unknown>): SentimentAnalysis {
  const raw = parsed.sentiment as Record<string, unknown> | undefined
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SENTIMENT }

  const validMoods = ['bullish', 'bearish', 'mixed', 'neutral'] as const
  const overall_mood = validMoods.includes(raw.overall_mood as typeof validMoods[number])
    ? (raw.overall_mood as SentimentAnalysis['overall_mood'])
    : 'neutral'

  const parseSentimentList = (arr: unknown): SentimentEntry[] =>
    Array.isArray(arr)
      ? arr
          .filter((e: unknown) => e && typeof e === 'object' && 'topic' in e)
          .map(parseSentimentEntry)
      : []

  return {
    overall_mood,
    mood_summary: typeof raw.mood_summary === 'string' ? raw.mood_summary : '',
    controversies: parseSentimentList(raw.controversies),
    opinion_shifts: parseSentimentList(raw.opinion_shifts),
    risk_flags: parseSentimentList(raw.risk_flags),
  }
}

/**
 * Parse the overall briefing LLM response as JSON.
 * Falls back to a single-section structure with the raw text if parsing fails.
 */
export function parseOverallJson(raw: string): OverallBriefing & { parsed: boolean } {
  const cleaned = stripLlmWrapper(raw)
  const parsed = robustJsonParse(cleaned)

  if (parsed) {
    const quick_scan: BriefingEntry[] = Array.isArray(parsed.quick_scan)
      ? parsed.quick_scan
          .filter((e: unknown) => e && typeof e === 'object' && 'text' in e)
          .map(parseEntry)
      : []

    const sections: BriefingSection[] = Array.isArray(parsed.sections)
      ? parsed.sections
          .filter((s: unknown) => s && typeof s === 'object' && 'title' in s)
          .map((s: unknown) => {
            const sec = s as Record<string, unknown>
            return {
              title: String(sec.title ?? ''),
              entries: Array.isArray(sec.entries)
                ? (sec.entries as unknown[])
                    .filter((e: unknown) => e && typeof e === 'object' && 'text' in e)
                    .map(parseEntry)
              : [],
            }
          })
      : []

    const executive_summary = typeof parsed.executive_summary === 'string'
      ? parsed.executive_summary
      : ''

    const sentiment = parseSentiment(parsed)

    // parsed: true means valid JSON (even if exec summary is empty).
    // Caller uses parsed + executive_summary to decide whether to retry.
    return { quick_scan, executive_summary, sections, sentiment, parsed: true }
  }

  // Not parseable as JSON — wrap raw text as fallback content.
  // parsed: false tells the caller the response was not structured JSON.
  return {
    quick_scan: [],
    executive_summary: '',
    sections: [{ title: 'Briefing', entries: [{ text: raw.trim(), source: '', refs: [] }] }],
    sentiment: { ...EMPTY_SENTIMENT },
    parsed: false,
  }
}
