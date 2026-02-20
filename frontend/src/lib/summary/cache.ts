// ABOUTME: SQLite-backed cache for BriefingSummary, SummaryProgress, and per-sensor summaries.
// ABOUTME: Per-sensor cache enables skipping unchanged sources on regenerate.
import { kvSet, kvGet, kvDelete, getDb } from '../db'
import type { BriefingSummary, SummaryProgress, SensorSummary } from '../models'
import { parseOverallJson } from './parse-json'

const SUMMARY_KEY = 'intel:summary'
const SUMMARY_TTL_SECONDS = 48 * 60 * 60 // 48 hours

/** Write a BriefingSummary to the database with a 48-hour TTL. */
export async function writeSummary(summary: BriefingSummary): Promise<void> {
  await kvSet(SUMMARY_KEY, summary, SUMMARY_TTL_SECONDS)
}

/** Read a cached BriefingSummary. Repairs broken fallback data on the fly. */
export async function readSummary(): Promise<BriefingSummary | null> {
  try {
    const data = await kvGet<BriefingSummary>(SUMMARY_KEY)
    if (!data) return null
    return repairIfNeeded(data)
  } catch {
    return null
  }
}

/**
 * Detect and repair broken summary where parseOverallJson fell back
 * to stuffing the raw JSON into sections[0].entries[0].text.
 * Re-parses the embedded JSON through the improved parser.
 */
function repairIfNeeded(summary: BriefingSummary): BriefingSummary {
  const overall = summary.overall
  if (
    overall &&
    typeof overall === 'object' &&
    'quick_scan' in overall &&
    Array.isArray(overall.quick_scan) &&
    overall.quick_scan.length === 0 &&
    Array.isArray(overall.sections) &&
    overall.sections.length === 1 &&
    overall.sections[0].entries.length === 1 &&
    overall.sections[0].entries[0].text.trimStart().startsWith('{')
  ) {
    const reparsed = parseOverallJson(overall.sections[0].entries[0].text)
    if (reparsed.quick_scan.length > 0 || reparsed.executive_summary) {
      return { ...summary, overall: reparsed }
    }
  }
  return summary
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

// ── Per-sensor summary cache ──────────────────────────────────────────────────
// Keyed as 'summary:sensor:{name}', stores content hash + SensorSummary.
// Used to skip unchanged sensors on regenerate.

const SENSOR_SUMMARY_PREFIX = 'summary:sensor:'
const SENSOR_SUMMARY_TTL_SECONDS = 48 * 60 * 60 // 48 hours

export interface CachedSensorSummary {
  content_hash: string
  sensor_summary: SensorSummary
  generated_at: string
}

/** Write a per-sensor summary with its content hash. */
export async function writeSensorSummary(
  sensorName: string,
  contentHash: string,
  sensorSummary: SensorSummary,
): Promise<void> {
  const entry: CachedSensorSummary = {
    content_hash: contentHash,
    sensor_summary: sensorSummary,
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  }
  await kvSet(SENSOR_SUMMARY_PREFIX + sensorName, entry, SENSOR_SUMMARY_TTL_SECONDS)
}

/** Read a cached per-sensor summary. Returns null if missing or expired. */
export async function readSensorSummary(sensorName: string): Promise<CachedSensorSummary | null> {
  try {
    return await kvGet<CachedSensorSummary>(SENSOR_SUMMARY_PREFIX + sensorName)
  } catch {
    return null
  }
}

/** Invalidate a single sensor's cached summary. */
export async function invalidateSensorSummary(sensorName: string): Promise<void> {
  await kvDelete(SENSOR_SUMMARY_PREFIX + sensorName)
}

/** Invalidate all cached per-sensor summaries. Uses SQL LIKE for prefix match. */
export async function invalidateAllSensorSummaries(): Promise<void> {
  const db = await getDb()
  await db.execute({
    sql: `DELETE FROM kv WHERE key LIKE ?`,
    args: [SENSOR_SUMMARY_PREFIX + '%'],
  })
}
