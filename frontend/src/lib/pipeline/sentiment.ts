// ABOUTME: LLM-based sentiment classifier — classifies items in batches via chatCompletion.
// ABOUTME: Caller pre-filters which items need sentiment; this module handles batching and LLM calls.
import type { IntelItem } from '../models'
import type { LlmConfig } from '../summary/llm'
import { chatCompletion } from '../summary/llm'
import { jsonrepair } from 'jsonrepair'

type SentimentLabel = 'positive' | 'negative' | 'neutral'

const BATCH_SIZE = 30

const SYSTEM_PROMPT = `You are a sentiment classifier. You will receive a numbered list of social media posts.
For each post, classify its sentiment as exactly one of: positive, negative, neutral.
Also provide a confidence score between 0 and 1 (e.g. 0.85).

Respond with ONLY a JSON array, no markdown fences, no explanation:
[{"i":0,"label":"positive","score":0.92},{"i":1,"label":"negative","score":0.78}]

Rules:
- "i" must match the post number exactly
- "label" must be exactly "positive", "negative", or "neutral"
- "score" is your confidence in the classification (0.0 to 1.0)
- Classify based on the actual sentiment expressed, not the topic
- Handle any language (English, Chinese, etc.)`

interface SentimentResult {
  i: number
  label: string
  score: number
}

/**
 * Classify a batch of texts using the LLM. Returns results keyed by index.
 */
async function classifyBatch(
  texts: string[],
  llmConfig: LlmConfig,
  signal?: AbortSignal,
): Promise<Map<number, { label: SentimentLabel; score: number }>> {
  const results = new Map<number, { label: SentimentLabel; score: number }>()
  if (texts.length === 0) return results

  const numbered = texts.map((t, i) => `[${i}] ${t}`).join('\n\n')

  const raw = await chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: numbered },
    ],
    llmConfig,
    signal,
  )

  const parsed = parseResponse(raw, texts.length)
  for (const r of parsed) {
    results.set(r.i, { label: r.label, score: r.score })
  }

  return results
}

/**
 * Parse the LLM response into validated sentiment results.
 */
function parseResponse(raw: string, expectedCount: number): Array<{ i: number; label: SentimentLabel; score: number }> {
  const validLabels = new Set<SentimentLabel>(['positive', 'negative', 'neutral'])

  // Strip markdown fences if present
  const cleaned = raw.replace(/```(?:json)?\s*\n?/g, '').replace(/```/g, '').trim()

  let arr: SentimentResult[]
  try {
    arr = JSON.parse(cleaned)
  } catch {
    // Try extracting array from response
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (!match) return []
    try {
      arr = JSON.parse(match[0])
    } catch {
      try {
        arr = JSON.parse(jsonrepair(match[0]))
      } catch {
        return []
      }
    }
  }

  if (!Array.isArray(arr)) return []

  return arr
    .filter(r =>
      r && typeof r === 'object' &&
      typeof r.i === 'number' && r.i >= 0 && r.i < expectedCount &&
      typeof r.label === 'string' && validLabels.has(r.label as SentimentLabel) &&
      typeof r.score === 'number',
    )
    .map(r => ({
      i: r.i,
      label: r.label as SentimentLabel,
      score: Math.round(Math.min(1, Math.max(0, r.score)) * 1000) / 1000,
    }))
}

/**
 * Enrich items with sentiment labels in-place using LLM classification.
 * Items are batched to keep prompt sizes manageable and maintain per-item accuracy.
 * The caller decides which items need sentiment — no source filtering here.
 * Skips silently if no LLM config is provided.
 */
export async function enrichSentiment(
  items: IntelItem[],
  llmConfig?: LlmConfig | null,
  signal?: AbortSignal,
): Promise<void> {
  if (!llmConfig) return
  if (items.length === 0) return

  // Process in batches to keep prompts focused
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    if (signal?.aborted) return

    const batch = items.slice(start, start + BATCH_SIZE)
    const texts = batch.map(item => item.title || '')

    const results = await classifyBatch(texts, llmConfig, signal)

    for (let i = 0; i < batch.length; i++) {
      const sentiment = results.get(i)
      if (sentiment) {
        batch[i].sentiment = sentiment
      }
    }
  }
}

/**
 * Compute aggregated sentiment distribution per source for briefing prompts.
 * Returns a human-readable summary string.
 */
export function aggregateSentiment(items: IntelItem[]): string {
  const bySource: Record<string, Record<SentimentLabel, number>> = {}

  for (const item of items) {
    if (!item.sentiment) continue
    if (!bySource[item.source]) {
      bySource[item.source] = { positive: 0, negative: 0, neutral: 0 }
    }
    bySource[item.source][item.sentiment.label]++
  }

  const lines: string[] = []
  for (const [source, counts] of Object.entries(bySource)) {
    lines.push(`- ${source}: ${counts.positive} positive, ${counts.negative} negative, ${counts.neutral} neutral`)
  }

  return lines.length > 0
    ? `Sentiment distribution from per-item classifier:\n${lines.join('\n')}`
    : ''
}
