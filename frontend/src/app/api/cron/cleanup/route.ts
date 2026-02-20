// ABOUTME: Cron cleanup endpoint — GET /api/cron/cleanup.
// ABOUTME: Prunes intel items older than post_expiry_days from the cached report.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { readReport, writeReport } from '@/lib/pipeline/cache'
import type { IntelItem } from '@/lib/models'
import type { CategoryKey } from '@/lib/sensors/taxonomy'

/** Returns true if the item should be kept (not expired). */
function isItemAlive(item: IntelItem, cutoffMs: number): boolean {
  if (!item.published_at) {
    // Items without a published_at are kept — we can't determine their age
    return true
  }
  const publishedMs = new Date(item.published_at).getTime()
  if (isNaN(publishedMs)) return true
  return publishedMs >= cutoffMs
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
    }
  }

  const config = await loadConfig()
  const report = await readReport()

  if (!report) {
    return NextResponse.json({ status: 'ok', removed: 0, message: 'No report to clean' })
  }

  const expiryDays = config.post_expiry_days ?? 30
  const cutoffMs = Date.now() - expiryDays * 24 * 60 * 60 * 1000

  let totalRemoved = 0
  const prunedItems = { ...report.items }

  for (const key of Object.keys(prunedItems) as CategoryKey[]) {
    const before = prunedItems[key].length
    prunedItems[key] = prunedItems[key].filter((item) => isItemAlive(item, cutoffMs))
    totalRemoved += before - prunedItems[key].length
  }

  if (totalRemoved > 0) {
    await writeReport({ ...report, items: prunedItems })
  }

  return NextResponse.json({
    status: 'ok',
    removed: totalRemoved,
    expiry_days: expiryDays,
  })
}
