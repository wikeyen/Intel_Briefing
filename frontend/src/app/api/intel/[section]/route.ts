// ABOUTME: Single section route — GET /api/intel/{section}.
// ABOUTME: Returns items from one report section with ?limit support; 404 on unknown sections.
import { NextRequest, NextResponse } from 'next/server'
import { readReport, isStale } from '@/lib/pipeline/cache'
import { loadConfig } from '@/lib/config'
import { ALL_CATEGORIES, type CategoryKey } from '@/lib/sensors/taxonomy'

const KNOWN_SECTIONS = new Set<string>(ALL_CATEGORIES)
const MAX_LIMIT = 200

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ section: string }> },
): Promise<NextResponse> {
  const { section } = await params

  if (!KNOWN_SECTIONS.has(section)) {
    return NextResponse.json(
      {
        error: `Unknown section '${section}'. Known sections: ${[...ALL_CATEGORIES].sort().join(', ')}`,
      },
      { status: 404 },
    )
  }

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
      { error: 'No data available yet' },
      { status: 503 },
    )
  }

  const config = await loadConfig()
  const stale = isStale(report, config.cache_ttl_hours)
  const items = (report.items[section as CategoryKey] ?? []).slice(0, limit)

  return NextResponse.json({
    section,
    stale,
    fetched_at: report.fetched_at,
    items,
  })
}
