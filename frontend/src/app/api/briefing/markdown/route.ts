// ABOUTME: Briefing route — GET /api/briefing/markdown returns the report as Markdown.
// ABOUTME: Calls the pure renderer; returns text/markdown content type.
import { NextResponse } from 'next/server'
import { readReport } from '@/lib/pipeline/cache'
import { renderMarkdown } from '@/lib/renderer/markdown'

export async function GET(): Promise<NextResponse> {
  const report = await readReport()
  if (!report) {
    return NextResponse.json(
      { detail: 'No data available yet' },
      { status: 503 },
    )
  }
  const md = renderMarkdown(report)
  return new NextResponse(md, {
    status: 200,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
