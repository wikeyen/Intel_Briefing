// ABOUTME: Sources aggregate route — exposes source metadata, groups, config, and latest status.
// ABOUTME: Keeps /api/sources from 404ing for deployed clients while reusing existing helpers.
import { NextResponse } from 'next/server'
import { loadConfig, maskConfig } from '@/lib/config'
import { readReport, isStale } from '@/lib/pipeline/cache'
import { SENSORS } from '@/lib/sensors/taxonomy'
import { listGroups } from '@/lib/groups/queries'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const [config, groups, report] = await Promise.all([
    loadConfig(),
    listGroups(),
    readReport(),
  ])

  const latest = report
    ? {
        fetched_at: report.fetched_at,
        stale: isStale(report, config.cache_ttl_hours),
        sources_ok: report.sources_ok,
        sources_failed: report.sources_failed,
        sources_fetched_at: report.sources_fetched_at ?? {},
      }
    : null

  return NextResponse.json({
    sources: SENSORS,
    groups,
    config: maskConfig(config),
    status: latest,
  })
}
