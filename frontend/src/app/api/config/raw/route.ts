// ABOUTME: Raw config route — GET /api/config/raw returns unmasked config.
// ABOUTME: Returns actual API key values; used by the ApiKeys component for editing.
import { NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const config = await loadConfig()
  return NextResponse.json(config)
}
