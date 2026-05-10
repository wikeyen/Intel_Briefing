// ABOUTME: Forwardable AI briefing summary API — returns cached or freshly generated Markdown/JSON.
// ABOUTME: Keeps LLM/provider details inside Info Aggregation so callers can just trigger and forward.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import { readReport } from '@/lib/pipeline/cache'
import { isPipelineRunning, runPipeline } from '@/lib/pipeline/orchestrator'
import { readSummary } from '@/lib/summary/cache'
import { renderSummaryMarkdown } from '@/lib/renderer/summary-markdown'
import type { BriefingSummary, RunMode, SummaryLanguage } from '@/lib/models'

export const maxDuration = 900

const VALID_MODES = new Set<RunMode>(['summarize', 'fetch_summarize'])
const VALID_LANGUAGES = new Set<SummaryLanguage>(['zh', 'en'])

type RequestBody = {
  mode?: RunMode
  format?: 'markdown' | 'json'
  lang?: SummaryLanguage
}

function wantsJson(request: NextRequest, body?: RequestBody): boolean {
  const format = body?.format ?? request.nextUrl.searchParams.get('format')
  if (format === 'json') return true
  if (format === 'markdown') return false
  return request.headers.get('accept')?.includes('application/json') ?? false
}

function parseLanguage(request: NextRequest, body?: RequestBody): SummaryLanguage | undefined {
  const raw = body?.lang ?? request.nextUrl.searchParams.get('lang')
  return VALID_LANGUAGES.has(raw as SummaryLanguage) ? raw as SummaryLanguage : undefined
}

function parseMode(request: NextRequest, body?: RequestBody): RunMode | null {
  const raw = body?.mode ?? request.nextUrl.searchParams.get('mode') ?? 'summarize'
  return VALID_MODES.has(raw as RunMode) ? raw as RunMode : null
}

function responseForSummary(summary: BriefingSummary, json: boolean): NextResponse {
  const markdown = renderSummaryMarkdown(summary)
  if (json) {
    return NextResponse.json({ ok: true, summary, markdown })
  }
  return new NextResponse(markdown, {
    status: 200,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = await loadConfig()
  const language = parseLanguage(request) ?? config.summary_language
  const summary = await readSummary(language)

  if (!summary) {
    return jsonError('No AI briefing summary available yet', 503)
  }

  return responseForSummary(summary, wantsJson(request))
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({})) as RequestBody
  const json = wantsJson(request, body)
  const mode = parseMode(request, body)

  if (!mode) {
    return jsonError('Invalid mode; use summarize or fetch_summarize', 400)
  }

  if (isPipelineRunning()) {
    return jsonError('Pipeline is already running', 409)
  }

  const config = await loadConfig()
  if (!config.summary_provider) {
    return jsonError('No LLM provider configured', 400)
  }

  const language = parseLanguage(request, body) ?? config.summary_language
  const runConfig = { ...config, summary_language: language }

  if (mode === 'summarize') {
    const report = await readReport()
    if (!report) {
      return jsonError('No cached report available; run with mode=fetch_summarize first', 503)
    }
  }

  let result
  try {
    result = await runPipeline(runConfig, mode, undefined, { stopAfterSummary: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('already running') ? 409 : 500
    return jsonError(message, status)
  }

  const summary = result.summary ?? await readSummary(language)
  if (!summary) {
    return jsonError('Pipeline completed but no summary was produced', 500)
  }

  return responseForSummary(summary, json)
}
