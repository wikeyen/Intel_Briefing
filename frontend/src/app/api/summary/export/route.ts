// ABOUTME: GET /api/summary/export — returns structured BriefingSummary JSON for external consumers.
// ABOUTME: Reads from the same SQLite cache used by the UI; guarded by existing X-API-Key middleware.
import { NextResponse } from 'next/server'
import { readSummary } from '@/lib/summary/cache'

export async function GET(): Promise<NextResponse> {
  const summary = await readSummary()

  if (!summary) {
    return NextResponse.json(
      { error: 'No summary available — generate one first' },
      { status: 404 },
    )
  }

  return NextResponse.json(summary)
}
