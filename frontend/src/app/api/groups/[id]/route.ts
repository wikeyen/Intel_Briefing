// ABOUTME: Single group routes — PUT (update) and DELETE (remove group).
// ABOUTME: Validates at least one update field is present; returns 404 for unknown group IDs.
import { NextRequest, NextResponse } from 'next/server'
import { getGroup, updateGroup, deleteGroup } from '@/lib/groups/queries'
import type { UpdateGroupPayload, GroupProcessing } from '@/lib/groups/types'

export const dynamic = 'force-dynamic'

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/
const VALID_PROCESSING: GroupProcessing[] = ['trend', 'topic', 'social', 'research', 'news', 'opinion', 'general']

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

  if (body.processing !== undefined) {
    if (!VALID_PROCESSING.includes(body.processing as GroupProcessing)) {
      return NextResponse.json(
        { error: `processing must be one of: ${VALID_PROCESSING.join(', ')}` },
        { status: 400 },
      )
    }
    payload.processing = body.processing as GroupProcessing
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
