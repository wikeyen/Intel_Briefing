// ABOUTME: Database query layer for source groups — CRUD, membership, and tree assembly.
// ABOUTME: All functions use parameterized queries via getDb() and return typed group objects.

import { getDb } from '../db'
import type {
  SourceGroup,
  SourceGroupFlat,
  SourceGroupTree,
  CreateGroupPayload,
  UpdateGroupPayload,
} from './types'

// ── Helpers ─────────────────────────────────────────────────────────────

/** Convert a raw DB row to a SourceGroup object. */
function rowToGroup(row: Record<string, unknown>): SourceGroup {
  return {
    id: row.id as string,
    parent_id: (row.parent_id as string) ?? null,
    name: row.name as string,
    color: row.color as string,
    icon: (row.icon as string) ?? null,
    processing: row.processing as SourceGroup['processing'],
    sort_order: Number(row.sort_order),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

/** Load sensor keys for a group. */
async function loadSensors(groupId: string): Promise<string[]> {
  const db = await getDb()
  const result = await db.execute({
    sql: 'SELECT sensor_key FROM source_group_members WHERE group_id = ? ORDER BY sort_order, added_at',
    args: [groupId],
  })
  return result.rows.map(r => r.sensor_key as string)
}

/** Get current ISO timestamp. */
function nowISO(): string {
  return new Date().toISOString()
}

// ── Validation ──────────────────────────────────────────────────────────

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/
const MAX_NAME_LENGTH = 50

function validateName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new Error('Group name must not be empty')
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Group name must be ${MAX_NAME_LENGTH} characters or fewer`)
  }
  return trimmed
}

function validateColor(color: string): void {
  if (!HEX_COLOR_RE.test(color)) {
    throw new Error('Color must be a valid hex color (e.g. #1A7A6D)')
  }
}

// ── Read queries ────────────────────────────────────────────────────────

/**
 * Load all groups as a tree — top-level groups with nested children.
 * Sorted by sort_order within each level.
 */
export async function listGroups(): Promise<SourceGroupTree[]> {
  const db = await getDb()
  const groupsResult = await db.execute(
    'SELECT * FROM source_groups ORDER BY sort_order, created_at'
  )
  const membersResult = await db.execute(
    'SELECT group_id, sensor_key FROM source_group_members ORDER BY sort_order, added_at'
  )

  // Build sensor map: group_id -> sensor_key[]
  const sensorMap = new Map<string, string[]>()
  for (const row of membersResult.rows) {
    const gid = row.group_id as string
    const key = row.sensor_key as string
    if (!sensorMap.has(gid)) sensorMap.set(gid, [])
    sensorMap.get(gid)!.push(key)
  }

  // Convert rows to SourceGroupTree
  const allGroups: SourceGroupTree[] = groupsResult.rows.map(row => ({
    ...rowToGroup(row),
    sensors: sensorMap.get(row.id as string) ?? [],
    children: [],
  }))

  // Separate top-level and child groups
  const topLevel: SourceGroupTree[] = []
  const childMap = new Map<string, SourceGroupTree[]>()

  for (const group of allGroups) {
    if (group.parent_id === null) {
      topLevel.push(group)
    } else {
      if (!childMap.has(group.parent_id)) childMap.set(group.parent_id, [])
      childMap.get(group.parent_id)!.push(group)
    }
  }

  // Nest children into parents
  for (const parent of topLevel) {
    parent.children = childMap.get(parent.id) ?? []
  }

  return topLevel
}

/**
 * Load all groups as a flat list with sensor arrays (for pipeline use).
 * Includes both top-level and child groups.
 */
export async function listGroupsFlat(): Promise<SourceGroupFlat[]> {
  const db = await getDb()
  const groupsResult = await db.execute(
    'SELECT * FROM source_groups ORDER BY sort_order, created_at'
  )
  const membersResult = await db.execute(
    'SELECT group_id, sensor_key FROM source_group_members ORDER BY sort_order, added_at'
  )

  const sensorMap = new Map<string, string[]>()
  for (const row of membersResult.rows) {
    const gid = row.group_id as string
    const key = row.sensor_key as string
    if (!sensorMap.has(gid)) sensorMap.set(gid, [])
    sensorMap.get(gid)!.push(key)
  }

  return groupsResult.rows.map(row => ({
    ...rowToGroup(row),
    sensors: sensorMap.get(row.id as string) ?? [],
  }))
}

/**
 * Build a sensor key -> group ID[] mapping.
 * A sensor can appear in multiple groups.
 */
export async function sensorGroupMap(): Promise<Map<string, string[]>> {
  const db = await getDb()
  const result = await db.execute(
    'SELECT group_id, sensor_key FROM source_group_members'
  )

  const map = new Map<string, string[]>()
  for (const row of result.rows) {
    const sensor = row.sensor_key as string
    const group = row.group_id as string
    if (!map.has(sensor)) map.set(sensor, [])
    map.get(sensor)!.push(group)
  }
  return map
}

/**
 * Get a single group by ID with its sensor keys, or null if not found.
 */
export async function getGroup(id: string): Promise<SourceGroupFlat | null> {
  const db = await getDb()
  const result = await db.execute({
    sql: 'SELECT * FROM source_groups WHERE id = ?',
    args: [id],
  })
  if (result.rows.length === 0) return null

  const group = rowToGroup(result.rows[0])
  const sensors = await loadSensors(id)
  return { ...group, sensors }
}

// ── Write queries ───────────────────────────────────────────────────────

/**
 * Create a new group. Validates name, color, and nesting constraints.
 * Returns the created group with an empty sensors array.
 */
export async function createGroup(payload: CreateGroupPayload): Promise<SourceGroupFlat> {
  const db = await getDb()

  const name = validateName(payload.name)
  validateColor(payload.color)

  // Validate nesting: parent must exist and be top-level
  const parentId = payload.parent_id ?? null
  if (parentId !== null) {
    const parentResult = await db.execute({
      sql: 'SELECT parent_id FROM source_groups WHERE id = ?',
      args: [parentId],
    })
    if (parentResult.rows.length === 0) {
      throw new Error('Parent group not found')
    }
    if (parentResult.rows[0].parent_id !== null) {
      throw new Error('Cannot nest groups beyond one level')
    }
  }

  const id = crypto.randomUUID()
  const now = nowISO()
  const processing = payload.processing ?? 'general'
  const icon = payload.icon ?? null

  await db.execute({
    sql: `INSERT INTO source_groups (id, parent_id, name, color, icon, processing, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    args: [id, parentId, name, payload.color, icon, processing, now, now],
  })

  return {
    id,
    parent_id: parentId,
    name,
    color: payload.color,
    icon,
    processing,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    sensors: [],
  }
}

/**
 * Update an existing group's properties. Throws if not found.
 * Returns the updated group with sensors.
 */
export async function updateGroup(id: string, payload: UpdateGroupPayload): Promise<SourceGroupFlat> {
  const db = await getDb()

  // Verify group exists
  const existing = await getGroup(id)
  if (!existing) {
    throw new Error('Group not found')
  }

  const updates: string[] = []
  const args: unknown[] = []

  if (payload.name !== undefined) {
    const name = validateName(payload.name)
    updates.push('name = ?')
    args.push(name)
  }

  if (payload.color !== undefined) {
    validateColor(payload.color)
    updates.push('color = ?')
    args.push(payload.color)
  }

  if (payload.icon !== undefined) {
    updates.push('icon = ?')
    args.push(payload.icon)
  }

  if (payload.processing !== undefined) {
    updates.push('processing = ?')
    args.push(payload.processing)
  }

  if (updates.length === 0) {
    return existing
  }

  const now = nowISO()
  updates.push('updated_at = ?')
  args.push(now)
  args.push(id)

  await db.execute({
    sql: `UPDATE source_groups SET ${updates.join(', ')} WHERE id = ?`,
    args,
  })

  return (await getGroup(id))!
}

/**
 * Delete a group. CASCADE handles member cleanup and sub-group removal.
 */
export async function deleteGroup(id: string): Promise<void> {
  const db = await getDb()
  await db.execute({
    sql: 'DELETE FROM source_groups WHERE id = ?',
    args: [id],
  })
}

// ── Membership queries ──────────────────────────────────────────────────

/**
 * Replace all members of a group with the given sensor keys.
 * Deletes existing members, then inserts the new set.
 */
export async function setGroupMembers(groupId: string, sensorKeys: string[]): Promise<void> {
  const db = await getDb()
  const now = nowISO()

  await db.execute({
    sql: 'DELETE FROM source_group_members WHERE group_id = ?',
    args: [groupId],
  })

  for (let i = 0; i < sensorKeys.length; i++) {
    await db.execute({
      sql: 'INSERT INTO source_group_members (group_id, sensor_key, sort_order, added_at) VALUES (?, ?, ?, ?)',
      args: [groupId, sensorKeys[i], i, now],
    })
  }
}

/**
 * Add a single sensor to a group. No-op if already a member.
 */
export async function addGroupMember(groupId: string, sensorKey: string): Promise<void> {
  const db = await getDb()
  const now = nowISO()

  await db.execute({
    sql: 'INSERT OR IGNORE INTO source_group_members (group_id, sensor_key, sort_order, added_at) VALUES (?, ?, 0, ?)',
    args: [groupId, sensorKey, now],
  })
}

/**
 * Remove a single sensor from a group.
 */
export async function removeGroupMember(groupId: string, sensorKey: string): Promise<void> {
  const db = await getDb()

  await db.execute({
    sql: 'DELETE FROM source_group_members WHERE group_id = ? AND sensor_key = ?',
    args: [groupId, sensorKey],
  })
}

// ── Reordering ──────────────────────────────────────────────────────────

/**
 * Batch update sort_order for groups based on the provided ordered ID list.
 * Each ID gets sort_order = its index in the array.
 */
export async function reorderGroups(orderedIds: string[]): Promise<void> {
  const db = await getDb()

  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute({
      sql: 'UPDATE source_groups SET sort_order = ? WHERE id = ?',
      args: [i, orderedIds[i]],
    })
  }
}
