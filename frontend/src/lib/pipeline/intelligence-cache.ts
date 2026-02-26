// ABOUTME: SQLite-backed cache for IntelligenceReport — stores LLM analysis of trend, topic, and account data.
// ABOUTME: Uses the kv adapter from db.ts for persistence with TTL support.
import { kvSet, kvGet } from '../db'
import type { IntelligenceReport } from './intelligence'

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

export async function readIntelligence(): Promise<IntelligenceReport | null> {
  try {
    const data = await kvGet<IntelligenceReport>(INTELLIGENCE_KEY)
    return data ?? null
  } catch {
    return null
  }
}
