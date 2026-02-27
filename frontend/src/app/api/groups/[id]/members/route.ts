// ABOUTME: Group member routes — PUT (replace all members) and POST (add member(s)).
// ABOUTME: PUT expects {sensors: string[]}, POST accepts {sensor_key: string} or {sensors: string[]}.
import { NextRequest, NextResponse } from 'next/server'
import { getGroup, setGroupMembers, addGroupMember } from '@/lib/groups/queries'

export const dynamic = 'force-dynamic'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  const existing = await getGroup(id)
  if (!existing) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 },
    )
  }

  const sensors = body.sensors
  if (!Array.isArray(sensors) || !sensors.every(s => typeof s === 'string')) {
    return NextResponse.json(
      { error: 'sensors must be an array of strings' },
      { status: 400 },
    )
  }

  await setGroupMembers(id, sensors as string[])
  const updated = await getGroup(id)
  return NextResponse.json(updated)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  const existing = await getGroup(id)
  if (!existing) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 },
    )
  }

  // Accept either {sensor_key: string} or {sensors: string[]}
  if (typeof body.sensor_key === 'string') {
    await addGroupMember(id, body.sensor_key)
  } else if (Array.isArray(body.sensors) && body.sensors.every(s => typeof s === 'string')) {
    for (const key of body.sensors as string[]) {
      await addGroupMember(id, key)
    }
  } else {
    return NextResponse.json(
      { error: 'Provide sensor_key (string) or sensors (string[])' },
      { status: 400 },
    )
  }

  const updated = await getGroup(id)
  return NextResponse.json(updated)
}
