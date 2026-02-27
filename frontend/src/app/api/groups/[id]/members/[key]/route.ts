// ABOUTME: Single member removal route — DELETE removes a sensor from a group.
// ABOUTME: Returns 404 if the group does not exist.
import { NextRequest, NextResponse } from 'next/server'
import { getGroup, removeGroupMember } from '@/lib/groups/queries'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; key: string }> },
): Promise<NextResponse> {
  const { id, key } = await params

  const existing = await getGroup(id)
  if (!existing) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  await removeGroupMember(id, key)
  return NextResponse.json({ ok: true })
}
