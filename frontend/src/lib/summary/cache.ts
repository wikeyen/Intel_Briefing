// ABOUTME: SQLite-backed cache for BriefingSummary and SummaryProgress.
// ABOUTME: Uses the kv adapter from db.ts, keyed as 'intel:summary' and 'intel:summary_status'.
import { kvSet, kvGet } from '../db'
import type { BriefingSummary, SummaryProgress } from '../models'

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

const SUMMARY_STATUS_KEY = 'intel:summary_status'
const SUMMARY_STATUS_TTL_SECONDS = 60 * 60 // 1 hour

/** Write SummaryProgress to the database with a 1-hour TTL. */
export async function writeSummaryProgress(progress: SummaryProgress): Promise<void> {
  await kvSet(SUMMARY_STATUS_KEY, progress, SUMMARY_STATUS_TTL_SECONDS)
}

/** Read cached SummaryProgress. Returns null if missing or expired. */
export async function readSummaryProgress(): Promise<SummaryProgress | null> {
  try {
    const data = await kvGet<SummaryProgress>(SUMMARY_STATUS_KEY)
    return data ?? null
  } catch {
    return null
  }
}
