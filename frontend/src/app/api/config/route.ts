// ABOUTME: Config routes — GET /api/config (masked) and PUT /api/config (partial update).
// ABOUTME: API keys are masked in GET responses; PUT merges, writes to SQLite, returns masked config.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig, saveConfig, maskConfig } from '@/lib/config'

const MASKED = '***'
const KEY_FIELDS = new Set(['github_token', 'producthunt_token', 'bluesky_app_password', 'mastodon_token', 'summary_api_key', 'twitter_auth_token', 'twitter_ct0'])

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

  // Strip masked or null key values — caller sent *** or null meaning "don't change"
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (KEY_FIELDS.has(k) && (v === MASKED || v == null)) continue
    update[k] = v
  }

  try {
    const updated = await saveConfig(update)
    return NextResponse.json(maskConfig(updated))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Failed to save config:', message)
    return NextResponse.json(
      { error: 'Failed to save config' },
      { status: 500 },
    )
  }
}
