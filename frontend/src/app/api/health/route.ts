// ABOUTME: Health check API route — GET /api/health.
// ABOUTME: Returns cache status (no_data/ok/stale) and last fetch timestamp.
import { NextResponse } from 'next/server'
import { readReport, isStale } from '@/lib/pipeline/cache'
import { loadConfig } from '@/lib/config'
import type { HealthResponse } from '@/lib/models'

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const report = await readReport()
  if (!report) {
    return NextResponse.json({ status: 'no_data', last_fetch: null })
  }
  const config = await loadConfig()
  const stale = isStale(report, config.cache_ttl_hours)
  return NextResponse.json({
    status: stale ? 'stale' : 'ok',
    last_fetch: report.fetched_at,
  })
}
