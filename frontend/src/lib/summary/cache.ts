// ABOUTME: SQLite-backed cache for BriefingSummary.
// ABOUTME: Uses the kv adapter from db.ts, keyed as 'intel:summary'.
import { kvSet, kvGet } from '../db'
import type { BriefingSummary } from '../models'

const SUMMARY_KEY = 'intel:summary'
const SUMMARY_TTL_SECONDS = 48 * 60 * 60 // 48 hours

/** Write a BriefingSummary to the database with a 48-hour TTL. */
export async function writeSummary(summary: BriefingSummary): Promise<void> {
  await kvSet(SUMMARY_KEY, summary, SUMMARY_TTL_SECONDS)
}

/** Read a cached BriefingSummary. Returns null if missing or expired. */
export async function readSummary(): Promise<BriefingSummary | null> {
  try {
    const data = await kvGet<BriefingSummary>(SUMMARY_KEY)
    return data ?? null
  } catch {
    return null
  }
}
