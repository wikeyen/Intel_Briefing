// ABOUTME: Group collection routes — GET (list all as tree) and POST (create group).
// ABOUTME: Returns tree-structured groups for UI consumption; validates name, color, and nesting on create.
import { NextRequest, NextResponse } from 'next/server'
import { listGroups, createGroup, getGroup } from '@/lib/groups/queries'
import type { CreateGroupPayload, GroupProcessing } from '@/lib/groups/types'

export const dynamic = 'force-dynamic'

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/
const VALID_PROCESSING: GroupProcessing[] = ['trend', 'topic', 'social', 'research', 'news', 'opinion', 'general']

export async function GET(): Promise<NextResponse> {
  const groups = await listGroups()
  return NextResponse.json(groups)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  // Validate name
  const name = body.name
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'name is required and must be a non-empty string' },
      { status: 400 },
    )
  }

  // Validate color
  const color = body.color
  if (typeof color !== 'string' || !HEX_COLOR_RE.test(color)) {
    return NextResponse.json(
      { error: 'color is required and must be a valid hex color (e.g. #1A7A6D)' },
      { status: 400 },
    )
  }

  // Validate processing (optional)
  const processing = body.processing as string | undefined
  if (processing !== undefined && !VALID_PROCESSING.includes(processing as GroupProcessing)) {
    return NextResponse.json(
      { error: `processing must be one of: ${VALID_PROCESSING.join(', ')}` },
      { status: 400 },
    )
  }

  // Validate parent_id (optional)
  const parentId = body.parent_id as string | undefined | null
  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
    return NextResponse.json(
      { error: 'parent_id must be a string or null' },
      { status: 400 },
    )
  }

  const payload: CreateGroupPayload = {
    name: name.trim(),
    color,
    processing: (processing as GroupProcessing) ?? 'general',
    parent_id: parentId ?? null,
    icon: typeof body.icon === 'string' ? body.icon : null,
  }

  try {
    const group = await createGroup(payload)
    return NextResponse.json(group, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Nesting constraint or parent not found errors are client errors
    if (message.includes('not found') || message.includes('Cannot nest')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
