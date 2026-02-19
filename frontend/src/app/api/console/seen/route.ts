// ABOUTME: Console "seen" API — tracks the last pipeline run the user viewed on the Console page.
// ABOUTME: GET returns the run ID; PUT stores a new run ID. Used to show/hide the sidebar error badge.
import { NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/db'

const KV_KEY = 'console:last-seen-run'

export async function GET(): Promise<NextResponse> {
  const runId = await kvGet<string>(KV_KEY)
  return NextResponse.json({ runId })
}

export async function PUT(req: Request): Promise<NextResponse> {
  const { runId } = await req.json() as { runId: string }
  await kvSet(KV_KEY, runId)
  return NextResponse.json({ ok: true })
}
