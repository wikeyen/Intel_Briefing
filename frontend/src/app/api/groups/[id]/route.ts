// ABOUTME: Single group routes — PUT (update) and DELETE (remove group).
// ABOUTME: Validates at least one update field is present; returns 404 for unknown group IDs.
import { NextRequest, NextResponse } from 'next/server'
import { getGroup, updateGroup, deleteGroup } from '@/lib/groups/queries'
import type { UpdateGroupPayload } from '@/lib/groups/types'

export const dynamic = 'force-dynamic'

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

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

  const payload: UpdateGroupPayload = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: 'name must be a non-empty string' },
        { status: 400 },
      )
    }
    payload.name = body.name.trim()
  }

  if (body.color !== undefined) {
    if (typeof body.color !== 'string' || !HEX_COLOR_RE.test(body.color)) {
      return NextResponse.json(
        { error: 'color must be a valid hex color (e.g. #1A7A6D)' },
        { status: 400 },
      )
    }
    payload.color = body.color
  }

  if (body.icon !== undefined) {
    payload.icon = typeof body.icon === 'string' ? body.icon : null
  }

  // Validate boolean workflow toggles (optional)
  for (const field of ['trend_enabled', 'topic_enabled', 'social_enabled', 'sentiment_enabled'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'boolean') {
        return NextResponse.json(
          { error: `${field} must be a boolean` },
          { status: 400 },
        )
      }
      payload[field] = body[field] as boolean
    }
  }

  // Validate string prompt fields (optional, nullable)
  for (const field of ['summary_prompt', 'trend_prompt', 'topic_prompt', 'social_prompt'] as const) {
    if (body[field] !== undefined) {
      if (body[field] !== null && typeof body[field] !== 'string') {
        return NextResponse.json(
          { error: `${field} must be a string or null` },
          { status: 400 },
        )
      }
      payload[field] = body[field] as string | null
    }
  }

  // Validate keyword arrays (optional)
  for (const field of ['suppress_keywords', 'boost_keywords'] as const) {
    if (body[field] !== undefined) {
      if (!Array.isArray(body[field]) || !(body[field] as unknown[]).every(v => typeof v === 'string')) {
        return NextResponse.json(
          { error: `${field} must be an array of strings` },
          { status: 400 },
        )
      }
      payload[field] = body[field] as string[]
    }
  }

  try {
    const updated = await updateGroup(id, payload)
    return NextResponse.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'Group not found') {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  const existing = await getGroup(id)
  if (!existing) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  await deleteGroup(id)
  return NextResponse.json({ ok: true })
}
