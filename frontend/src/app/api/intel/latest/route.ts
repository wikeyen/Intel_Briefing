// ABOUTME: Intel data route — GET /api/intel/latest returns the full IntelReport.
// ABOUTME: Returns all items per section without truncation.
import { NextResponse } from 'next/server'
import { readReport, isStale } from '@/lib/pipeline/cache'
import { loadConfig } from '@/lib/config'

export async function GET(): Promise<NextResponse> {
  const report = await readReport()
  if (!report) {
    return NextResponse.json(
      { detail: 'No data available yet' },
      { status: 503 },
    )
  }

  const config = await loadConfig()
  const stale = isStale(report, config.cache_ttl_hours)
  const updated = { ...report, stale }

  return NextResponse.json(updated)
}
