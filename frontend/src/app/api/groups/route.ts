// ABOUTME: Group collection routes — GET (list all as tree) and POST (create group).
// ABOUTME: Returns tree-structured groups for UI consumption; validates name, color, and nesting on create.
import { NextRequest, NextResponse } from 'next/server'
import { listGroups, createGroup } from '@/lib/groups/queries'
import type { CreateGroupPayload } from '@/lib/groups/types'

export const dynamic = 'force-dynamic'

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

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

  // Validate parent_id (optional)
  const parentId = body.parent_id as string | undefined | null
  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
    return NextResponse.json(
      { error: 'parent_id must be a string or null' },
      { status: 400 },
    )
  }

  // Validate boolean workflow toggles (optional)
  for (const field of ['trend_enabled', 'topic_enabled', 'social_enabled', 'sentiment_enabled'] as const) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') {
      return NextResponse.json(
        { error: `${field} must be a boolean` },
        { status: 400 },
      )
    }
  }

  // Validate string prompt fields (optional, nullable)
  for (const field of ['summary_prompt', 'trend_prompt', 'topic_prompt', 'social_prompt'] as const) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
      return NextResponse.json(
        { error: `${field} must be a string or null` },
        { status: 400 },
      )
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
    }
  }

  const payload: CreateGroupPayload = {
    name: name.trim(),
    color,
    parent_id: parentId ?? null,
    icon: typeof body.icon === 'string' ? body.icon : null,
    trend_enabled: body.trend_enabled as boolean | undefined,
    topic_enabled: body.topic_enabled as boolean | undefined,
    social_enabled: body.social_enabled as boolean | undefined,
    sentiment_enabled: body.sentiment_enabled as boolean | undefined,
    summary_prompt: body.summary_prompt as string | null | undefined,
    trend_prompt: body.trend_prompt as string | null | undefined,
    topic_prompt: body.topic_prompt as string | null | undefined,
    social_prompt: body.social_prompt as string | null | undefined,
    suppress_keywords: body.suppress_keywords as string[] | undefined,
    boost_keywords: body.boost_keywords as string[] | undefined,
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
