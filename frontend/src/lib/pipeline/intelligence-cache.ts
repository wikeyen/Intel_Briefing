// ABOUTME: SQLite-backed cache for IntelligenceReport — stores LLM analysis of trend, topic, and account data.
// ABOUTME: Uses the kv adapter from db.ts for persistence with TTL support.
import { kvSet, kvGet } from '../db'
import type { IntelligenceReport } from './intelligence'

const INTELLIGENCE_KEY = 'intel:intelligence'
const INTELLIGENCE_TTL_SECONDS = 48 * 60 * 60 // 48 hours

export async function writeIntelligence(report: IntelligenceReport): Promise<void> {
  await kvSet(INTELLIGENCE_KEY, report, INTELLIGENCE_TTL_SECONDS)
}

export async function readIntelligence(): Promise<IntelligenceReport | null> {
  try {
    const data = await kvGet<IntelligenceReport>(INTELLIGENCE_KEY)
    return data ?? null
  } catch {
    return null
  }
}
