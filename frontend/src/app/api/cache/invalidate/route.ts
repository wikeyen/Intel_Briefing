// ABOUTME: POST /api/cache/invalidate — deletes the cached report so the next fetch runs fresh.
// ABOUTME: Called by the "Mark Stale Now" button on the Pipeline page.
import { NextResponse } from 'next/server'
import { readReport, invalidateReport } from '@/lib/pipeline/cache'

export async function POST(): Promise<NextResponse> {
  const report = await readReport()
  if (!report) {
    return NextResponse.json({ ok: true, invalidated: 0 })
  }
  const itemCount = Object.values(report.items).reduce((sum, arr) => sum + arr.length, 0)
  await invalidateReport()
  return NextResponse.json({ ok: true, invalidated: itemCount })
}
