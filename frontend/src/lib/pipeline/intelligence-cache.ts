// ABOUTME: SQLite-backed cache for IntelligenceReport — stores LLM analysis of trend, topic, and account data.
// ABOUTME: Uses the kv adapter from db.ts for persistence with TTL support.
import { kvSet, kvGet } from '../db'
import type { IntelligenceReport, IntelTag } from './intelligence'

const INTELLIGENCE_KEY = 'intel:intelligence'
const INTELLIGENCE_TTL_SECONDS = 48 * 60 * 60 // 48 hours

export async function writeIntelligence(report: IntelligenceReport): Promise<void> {
  // Preserve previously cached non-null fields when new analysis returns null.
  // This prevents a transient LLM failure from wiping out good cached data.
  const existing = await readIntelligence()
  const merged: IntelligenceReport = {
    trend: report.trend ?? existing?.trend ?? null,
    topics: report.topics ?? existing?.topics ?? null,
    accounts: report.accounts ?? existing?.accounts ?? null,
  }
  await kvSet(INTELLIGENCE_KEY, merged, INTELLIGENCE_TTL_SECONDS)
}

/** Synthesize tags from account themes when the LLM didn't produce any. */
function backfillAccountTags(report: IntelligenceReport): IntelligenceReport {
  const accts = report.accounts
  if (!accts || (accts.tags && accts.tags.length > 0)) return report

  const freq = new Map<string, { count: number; sentiment: string }>()
  for (const acct of accts.accounts) {
    for (const theme of acct.themes) {
      const key = theme.toLowerCase()
      const existing = freq.get(key)
      if (existing) {
        existing.count++
      } else {
        freq.set(key, { count: 1, sentiment: acct.sentiment })
      }
    }
  }
  if (freq.size === 0) return report

  const sorted = [...freq.entries()].sort((a, b) => b[1].count - a[1].count)
  const maxCount = sorted[0][1].count
  const VALID_SENTIMENTS = new Set(['positive', 'negative', 'neutral', 'mixed'])
  const tags: IntelTag[] = sorted.slice(0, 20).map(([text, { count, sentiment }]) => ({
    text,
    weight: Math.round((count / maxCount) * 1000) / 1000,
    sentiment: (VALID_SENTIMENTS.has(sentiment) ? sentiment : 'neutral') as IntelTag['sentiment'],
  }))

  return { ...report, accounts: { ...accts, tags } }
}

export async function readIntelligence(): Promise<IntelligenceReport | null> {
  try {
    const data = await kvGet<IntelligenceReport>(INTELLIGENCE_KEY)
    if (!data) return null
    return backfillAccountTags(data)
  } catch {
    return null
  }
}
