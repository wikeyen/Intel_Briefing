// ABOUTME: SQLite-backed cache for IntelReport and PipelineStatus.
// ABOUTME: Uses the kv adapter from db.ts for persistence with TTL support.
import { kvSet, kvGet } from '../db'
import type { IntelReport, PipelineStatus } from '../models'

const REPORT_KEY = 'intel:latest'
const STATUS_KEY = 'intel:pipeline_status'
const REPORT_TTL_SECONDS = 48 * 60 * 60 // 48 hours
const STATUS_TTL_SECONDS = 60 * 60 // 1 hour

/** Write an IntelReport to the database with a 48-hour TTL. */
export async function writeReport(report: IntelReport): Promise<void> {
  await kvSet(REPORT_KEY, report, REPORT_TTL_SECONDS)
}

/** Read and deserialize an IntelReport from the database. Returns null if missing or expired. */
export async function readReport(): Promise<IntelReport | null> {
  try {
    const data = await kvGet<IntelReport>(REPORT_KEY)
    return data ?? null
  } catch {
    return null
  }
}

/**
 * Determine whether a cached report is older than the TTL.
 * Returns true if the report is older than ttlHours, or if fetched_at cannot be parsed.
 */
export function isStale(report: IntelReport, ttlHours: number = 6): boolean {
  try {
    const fetchedAt = report.fetched_at.replace('Z', '+00:00')
    const fetched = new Date(fetchedAt)
    if (isNaN(fetched.getTime())) {
      return true
    }
    const ageHours = (Date.now() - fetched.getTime()) / (1000 * 60 * 60)
    return ageHours > ttlHours
  } catch {
    return true
  }
}

/** Write PipelineStatus to the database with a 1-hour TTL. */
export async function writePipelineStatus(
  status: PipelineStatus,
): Promise<void> {
  await kvSet(STATUS_KEY, status, STATUS_TTL_SECONDS)
}

/** Read PipelineStatus from the database. Returns null if missing or expired. */
export async function readPipelineStatus(): Promise<PipelineStatus | null> {
  try {
    const data = await kvGet<PipelineStatus>(STATUS_KEY)
    return data ?? null
  } catch {
    return null
  }
}
