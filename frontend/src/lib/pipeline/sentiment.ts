// ABOUTME: Local sentiment classifier using Transformers.js — classifies social post text.
// ABOUTME: Singleton model loaded once; exposes classifyBatch() for pipeline enrichment.
import type { IntelItem } from '../models'

const SOCIAL_SOURCES = new Set(['x', 'bluesky', 'mastodon'])
const MODEL_ID = 'Xenova/twitter-roberta-base-sentiment-latest'

type SentimentLabel = 'positive' | 'negative' | 'neutral'

interface ClassifierResult {
  label: string
  score: number
}

// Remap model labels to our canonical labels
const LABEL_MAP: Record<string, SentimentLabel> = {
  positive: 'positive',
  POSITIVE: 'positive',
  LABEL_2: 'positive',
  negative: 'negative',
  NEGATIVE: 'negative',
  LABEL_0: 'negative',
  neutral: 'neutral',
  NEUTRAL: 'neutral',
  LABEL_1: 'neutral',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelineInstance: any = null
let loading: Promise<void> | null = null

async function ensureLoaded(): Promise<void> {
  if (pipelineInstance) return
  if (loading) { await loading; return }
  loading = (async () => {
    const { pipeline } = await import('@huggingface/transformers')
    pipelineInstance = await pipeline('sentiment-analysis', MODEL_ID)
  })()
  await loading
}

/**
 * Classify an array of texts and return sentiment labels with confidence scores.
 * Returns results in the same order as the input texts.
 */
async function classifyTexts(
  texts: string[],
): Promise<Array<{ label: SentimentLabel; score: number }>> {
  if (texts.length === 0) return []
  await ensureLoaded()

  // Truncate long texts to avoid model token limits (RoBERTa max ~512 tokens)
  const truncated = texts.map(t => t.slice(0, 512))

  const results: ClassifierResult[] = await pipelineInstance(truncated, {
    top_k: 1,
  })

  // Pipeline returns nested arrays for batch input
  const flat: ClassifierResult[] = Array.isArray(results[0])
    ? (results as unknown as ClassifierResult[][]).map(r => r[0])
    : results

  return flat.map(r => ({
    label: LABEL_MAP[r.label] ?? 'neutral',
    score: Math.round(r.score * 1000) / 1000,
  }))
}

/**
 * Enrich social items with sentiment labels in-place.
 * Only processes items from social sources (x, bluesky, mastodon).
 * Non-social items are left untouched.
 */
export async function enrichSentiment(items: IntelItem[]): Promise<void> {
  const socialItems = items.filter(item => SOCIAL_SOURCES.has(item.source))
  if (socialItems.length === 0) return

  const texts = socialItems.map(item => item.title || '')
  const sentiments = await classifyTexts(texts)

  for (let i = 0; i < socialItems.length; i++) {
    socialItems[i].sentiment = sentiments[i]
  }
}

/**
 * Compute aggregated sentiment distribution per source for briefing prompts.
 * Returns a human-readable summary string.
 */
export function aggregateSentiment(items: IntelItem[]): string {
  const bySource: Record<string, Record<SentimentLabel, number>> = {}

  for (const item of items) {
    if (!item.sentiment || !SOCIAL_SOURCES.has(item.source)) continue
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
    ? `Sentiment distribution from local classifier:\n${lines.join('\n')}`
    : ''
}
