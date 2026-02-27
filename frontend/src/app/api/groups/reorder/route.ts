// ABOUTME: Group reorder route — PUT accepts {ordered_ids: string[]} to batch-update sort_order.
// ABOUTME: Each group ID gets sort_order equal to its index in the provided array.
import { NextRequest, NextResponse } from 'next/server'
import { reorderGroups } from '@/lib/groups/queries'

export const dynamic = 'force-dynamic'

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

  const orderedIds = body.ordered_ids
  if (!Array.isArray(orderedIds) || !orderedIds.every(id => typeof id === 'string')) {
    return NextResponse.json(
      { error: 'ordered_ids must be an array of strings' },
      { status: 400 },
    )
  }

  await reorderGroups(orderedIds as string[])
  return NextResponse.json({ ok: true })
}
