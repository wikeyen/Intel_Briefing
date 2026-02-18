// ABOUTME: Redis-backed cache for IntelReport and PipelineStatus.
// ABOUTME: Uses Upstash Redis REST client — no connection pool issues in serverless environments.
import { Redis } from '@upstash/redis'
import type { IntelReport, PipelineStatus } from '../models'

const REPORT_KEY = 'intel:latest'
const STATUS_KEY = 'intel:pipeline_status'
const REPORT_TTL_SECONDS = 48 * 60 * 60 // 48 hours
const STATUS_TTL_SECONDS = 60 * 60 // 1 hour

function getRedis(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

/** Write an IntelReport to Redis with a 48-hour TTL. */
export async function writeReport(report: IntelReport): Promise<void> {
  const redis = getRedis()
  await redis.set(REPORT_KEY, report, { ex: REPORT_TTL_SECONDS })
}

/** Read and deserialize an IntelReport from Redis. Returns null if missing. */
export async function readReport(): Promise<IntelReport | null> {
  try {
    const redis = getRedis()
    const data = await redis.get<IntelReport>(REPORT_KEY)
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

/** Write PipelineStatus to Redis with a 1-hour TTL. */
export async function writePipelineStatus(
  status: PipelineStatus,
): Promise<void> {
  const redis = getRedis()
  await redis.set(STATUS_KEY, status, { ex: STATUS_TTL_SECONDS })
}

/** Read PipelineStatus from Redis. Returns null if missing. */
export async function readPipelineStatus(): Promise<PipelineStatus | null> {
  try {
    const redis = getRedis()
    const data = await redis.get<PipelineStatus>(STATUS_KEY)
    return data ?? null
  } catch {
    return null
  }
}
