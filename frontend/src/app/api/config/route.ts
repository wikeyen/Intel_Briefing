// ABOUTME: Config routes — GET /api/config (masked) and PUT /api/config (partial update).
// ABOUTME: API keys are masked in GET responses; PUT merges, writes to Redis, returns masked config.
import { NextRequest, NextResponse } from 'next/server'
import { loadConfig, saveConfig, maskConfig } from '@/lib/config'

const MASKED = '***'
const KEY_FIELDS = new Set(['xai_api_key', 'github_token', 'producthunt_token'])

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
      { detail: 'Request body must be valid JSON' },
      { status: 400 },
    )
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { detail: 'Request body must be a JSON object' },
      { status: 400 },
    )
  }

  // Strip masked key values — caller sent *** meaning "don't change"
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (KEY_FIELDS.has(k) && v === MASKED) continue
    update[k] = v
  }

  try {
    const updated = await saveConfig(update)
    return NextResponse.json(maskConfig(updated))
  } catch (err) {
    return NextResponse.json(
      { detail: `Failed to save config: ${err}` },
      { status: 500 },
    )
  }
}
