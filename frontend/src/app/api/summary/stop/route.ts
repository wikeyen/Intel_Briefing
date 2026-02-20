// ABOUTME: Summary stop endpoint — POST /api/summary/stop.
// ABOUTME: Aborts the running standalone summary and returns 200, or 404 if nothing is running.
import { NextResponse } from 'next/server'
import { cancelSummary } from '../trigger/route'

export async function POST(): Promise<NextResponse> {
  const stopped = cancelSummary()
  if (stopped) {
    return NextResponse.json({ status: 'stopped' })
  }
  return NextResponse.json({ error: 'No summary running' }, { status: 404 })
}
