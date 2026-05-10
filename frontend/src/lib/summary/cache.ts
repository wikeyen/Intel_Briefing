// ABOUTME: SQLite-backed cache for BriefingSummary, SummaryProgress, and per-sensor summaries.
// ABOUTME: Per-sensor cache enables skipping unchanged sources on regenerate.
import { kvSet, kvGet, kvDelete, getDb } from '../db'
import type { BriefingSummary, SummaryProgress, SensorSummary, SummaryLanguage } from '../models'
import { parseOverallJson } from './parse-json'

const SUMMARY_KEY_PREFIX = 'info-aggregation:summary'
const SUMMARY_TTL_SECONDS = 48 * 60 * 60 // 48 hours

/** Build the cache key for a language-specific summary. */
function summaryKey(language?: SummaryLanguage): string {
  return language ? `${SUMMARY_KEY_PREFIX}:${language}` : SUMMARY_KEY_PREFIX
}

/** Write a BriefingSummary to the database with a 48-hour TTL, keyed by language. */
export async function writeSummary(summary: BriefingSummary, language?: SummaryLanguage): Promise<void> {
  await kvSet(summaryKey(language), summary, SUMMARY_TTL_SECONDS)
}

/** Read a cached BriefingSummary for a specific language. Repairs broken fallback data on the fly. */
export async function readSummary(language?: SummaryLanguage): Promise<BriefingSummary | null> {
  try {
    // Try language-specific key first, fall back to legacy unkeyed entry
    const data = await kvGet<BriefingSummary>(summaryKey(language))
      ?? (language ? await kvGet<BriefingSummary>(SUMMARY_KEY_PREFIX) : null)
    if (!data) return null
    return repairIfNeeded(data)
  } catch {
    return null
  }
}

/** Invalidate all cached summaries across all languages. */
export async function invalidateAllSummaries(): Promise<void> {
  const db = await getDb()
  await db.execute({
    sql: `DELETE FROM kv WHERE key LIKE ? OR key = ?`,
    args: [`${SUMMARY_KEY_PREFIX}:%`, SUMMARY_KEY_PREFIX],
  })
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
    Array.isArray(overall.sections) &&
    overall.sections.length === 1 &&
    overall.sections[0].entries.length === 1 &&
    overall.sections[0].entries[0].text.trimStart().startsWith('{')
  ) {
    const reparsed = parseOverallJson(overall.sections[0].entries[0].text)
    if (reparsed.executive_summary) {
      return { ...summary, overall: reparsed }
    }
  }
  return summary
}

const SUMMARY_STATUS_KEY = 'info-aggregation:summary_status'
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
  language?: SummaryLanguage
}

/** Build per-sensor cache key, optionally scoped to a language. */
function sensorKey(sensorName: string, language?: SummaryLanguage): string {
  return language
    ? `${SENSOR_SUMMARY_PREFIX}${sensorName}:${language}`
    : `${SENSOR_SUMMARY_PREFIX}${sensorName}`
}

/** Write a per-sensor summary with its content hash, keyed by sensor+language. */
export async function writeSensorSummary(
  sensorName: string,
  contentHash: string,
  sensorSummary: SensorSummary,
  language?: SummaryLanguage,
): Promise<void> {
  const entry: CachedSensorSummary = {
    content_hash: contentHash,
    sensor_summary: sensorSummary,
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    language,
  }
  await kvSet(sensorKey(sensorName, language), entry, SENSOR_SUMMARY_TTL_SECONDS)
}

/** Read a cached per-sensor summary for a specific language. Returns null if missing or expired. */
export async function readSensorSummary(sensorName: string, language?: SummaryLanguage): Promise<CachedSensorSummary | null> {
  try {
    // Try language-keyed entry first, fall back to legacy unkeyed entry
    const data = await kvGet<CachedSensorSummary>(sensorKey(sensorName, language))
      ?? (language ? await kvGet<CachedSensorSummary>(sensorKey(sensorName)) : null)
    return data ?? null
  } catch {
    return null
  }
}

/** Invalidate a single sensor's cached summary (all languages). */
export async function invalidateSensorSummary(sensorName: string): Promise<void> {
  const db = await getDb()
  await db.execute({
    sql: `DELETE FROM kv WHERE key LIKE ? OR key = ?`,
    args: [`${SENSOR_SUMMARY_PREFIX}${sensorName}:%`, `${SENSOR_SUMMARY_PREFIX}${sensorName}`],
  })
}

/** Invalidate all cached per-sensor summaries. Uses SQL LIKE for prefix match. */
export async function invalidateAllSensorSummaries(): Promise<void> {
  const db = await getDb()
  await db.execute({
    sql: `DELETE FROM kv WHERE key LIKE ?`,
    args: [SENSOR_SUMMARY_PREFIX + '%'],
  })
}
