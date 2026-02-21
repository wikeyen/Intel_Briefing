// ABOUTME: Summary API — GET returns cached AI briefing, POST writes a new one.
// ABOUTME: GET is used by the Status page; POST is used by the Claude Code skill.
import { NextRequest, NextResponse } from 'next/server'
import { readSummary, writeSummary } from '@/lib/summary/cache'
import type { BriefingSummary } from '@/lib/models'

export async function GET(): Promise<NextResponse> {
  const summary = await readSummary()
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
