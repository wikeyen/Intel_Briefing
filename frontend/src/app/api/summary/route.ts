// ABOUTME: Summary API — GET returns cached AI briefing, POST writes a new one.
// ABOUTME: GET reads the summary for the configured language; POST writes a new one.
import { NextRequest, NextResponse } from 'next/server'
import { readSummary, writeSummary } from '@/lib/summary/cache'
import { loadConfig } from '@/lib/config'
import type { BriefingSummary, SummaryLanguage } from '@/lib/models'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const langParam = request.nextUrl.searchParams.get('lang')
  const language = (langParam ?? (await loadConfig()).summary_language) as SummaryLanguage
  const summary = await readSummary(language)
  return NextResponse.json({ summary })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: BriefingSummary = await request.json()

    // Basic validation
    if (!body.generated_at || !body.report_fetched_at || !body.overall || !Array.isArray(body.sections)) {
      return NextResponse.json(
        { error: 'Invalid BriefingSummary: missing required fields' },
        { status: 400 },
      )
    }

    await writeSummary(body)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    )
  }
}
