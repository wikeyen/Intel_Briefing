// ABOUTME: POST /api/cache/cleanup — removes expired intel items from the cached report.
// ABOUTME: Called by the "Delete Expired Now" button on the Pipeline page.
import { NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { readReport, writeReport } from '@/lib/pipeline/cache'
import type { IntelItem } from '@/lib/models'

function isItemAlive(item: IntelItem, cutoffMs: number): boolean {
  if (!item.published_at) return true
  const publishedMs = new Date(item.published_at).getTime()
  if (isNaN(publishedMs)) return true
  return publishedMs >= cutoffMs
}

export async function POST(): Promise<NextResponse> {
  const config = await loadConfig()
  const report = await readReport()

  if (!report) {
    return NextResponse.json({ ok: true, removed: 0, expiry_days: config.post_expiry_days ?? 30 })
  }

  const expiryDays = config.post_expiry_days ?? 30
  const cutoffMs = Date.now() - expiryDays * 24 * 60 * 60 * 1000

  let totalRemoved = 0
  const prunedItems = { ...report.items }

  for (const key of Object.keys(prunedItems)) {
    const before = prunedItems[key].length
    prunedItems[key] = prunedItems[key].filter((item) => isItemAlive(item, cutoffMs))
    totalRemoved += before - prunedItems[key].length
  }

  if (totalRemoved > 0) {
    await writeReport({ ...report, items: prunedItems })
  }

  return NextResponse.json({ ok: true, removed: totalRemoved, expiry_days: expiryDays })
}
