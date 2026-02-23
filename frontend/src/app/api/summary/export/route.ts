// ABOUTME: GET /api/summary/export — returns structured BriefingSummary JSON for external consumers.
// ABOUTME: Reads from the same SQLite cache used by the UI; guarded by existing X-API-Key middleware.
import { NextRequest, NextResponse } from 'next/server'
import { readSummary } from '@/lib/summary/cache'
import { loadConfig } from '@/lib/config'
import type { SummaryLanguage } from '@/lib/models'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const langParam = request.nextUrl.searchParams.get('lang')
  const language = (langParam ?? (await loadConfig()).summary_language) as SummaryLanguage
  const summary = await readSummary(language)

  if (!summary) {
    return NextResponse.json(
      { error: 'No summary available — generate one first' },
      { status: 404 },
    )
  }

  return NextResponse.json(summary)
}
