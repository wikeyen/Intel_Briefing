// ABOUTME: Connections compatibility route — GET/PUT credentials config at /api/connections.
// ABOUTME: Reuses the canonical config helpers so keys stay masked and masked writes preserve secrets.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig, saveConfig, maskConfig } from '@/lib/config'
import type { ConfigSettings } from '@/lib/models'

export const dynamic = 'force-dynamic'

const MASKED = '***'
const KEY_FIELDS = new Set([
  'github_token',
  'producthunt_token',
  'bluesky_app_password',
  'mastodon_token',
  'summary_api_key',
  'twitter_auth_token',
  'twitter_ct0',
  'apify_token',
])

export async function GET(): Promise<NextResponse> {
  const config = await loadConfig()
  return NextResponse.json(maskConfig(config))
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 },
    )
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 },
    )
  }

  const update: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (KEY_FIELDS.has(key) && (value === MASKED || value == null)) continue
    update[key] = value
  }

  const updated = await saveConfig(update as Partial<ConfigSettings>)
  return NextResponse.json(maskConfig(updated))
}
