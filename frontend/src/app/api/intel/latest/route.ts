// ABOUTME: Intel data route — GET /api/intel/latest returns the full IntelReport.
// ABOUTME: Supports ?limit query param to truncate items per section (1-50, default 10).
import { NextRequest, NextResponse } from 'next/server'
import { readReport, isStale } from '@/lib/pipeline/cache'
import { loadConfig } from '@/lib/config'
import type { IntelReport, SectionKey } from '@/lib/models'

const MAX_LIMIT = 50

function limitSections(
  report: IntelReport,
  limit: number,
): IntelReport {
  const limitedItems: Record<string, typeof report.items[SectionKey]> = {}
  for (const [key, items] of Object.entries(report.items)) {
    limitedItems[key] = items.slice(0, limit)
  }
  return { ...report, items: limitedItems as IntelReport['items'] }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limitParam = request.nextUrl.searchParams.get('limit')
  let limit = 10
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= MAX_LIMIT) {
      limit = parsed
    }
  }

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
  const limited = limitSections(updated, limit)

  return NextResponse.json(limited)
}
