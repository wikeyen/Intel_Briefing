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

/** Parse a JSON string as a string array, returning [] on failure. */
function parseJsonArray(val: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(val ?? '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/** Convert a raw DB row to a SourceGroup object. */
function rowToGroup(row: Record<string, unknown>): SourceGroup {
  return {
    id: row.id as string,
    parent_id: (row.parent_id as string) ?? null,
    name: row.name as string,
    color: row.color as string,
    icon: (row.icon as string) ?? null,
    sort_order: Number(row.sort_order),
    trend_enabled: Boolean(row.trend_enabled),
    topic_enabled: Boolean(row.topic_enabled),
    social_enabled: Boolean(row.social_enabled),
    sentiment_enabled: Boolean(row.sentiment_enabled),
    summary_prompt: (row.summary_prompt as string) ?? null,
    trend_prompt: (row.trend_prompt as string) ?? null,
    topic_prompt: (row.topic_prompt as string) ?? null,
    social_prompt: (row.social_prompt as string) ?? null,
    suppress_keywords: parseJsonArray(row.suppress_keywords as string),
    boost_keywords: parseJsonArray(row.boost_keywords as string),
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
  const icon = payload.icon ?? null
  const trendEnabled = payload.trend_enabled ? 1 : 0
  const topicEnabled = payload.topic_enabled ? 1 : 0
  const socialEnabled = payload.social_enabled ? 1 : 0
  const sentimentEnabled = payload.sentiment_enabled ? 1 : 0
  const summaryPrompt = payload.summary_prompt ?? null
  const trendPrompt = payload.trend_prompt ?? null
  const topicPrompt = payload.topic_prompt ?? null
  const socialPrompt = payload.social_prompt ?? null
  const suppressKeywords = JSON.stringify(payload.suppress_keywords ?? [])
  const boostKeywords = JSON.stringify(payload.boost_keywords ?? [])

  await db.execute({
    sql: `INSERT INTO source_groups (id, parent_id, name, color, icon, sort_order, trend_enabled, topic_enabled, social_enabled, sentiment_enabled, summary_prompt, trend_prompt, topic_prompt, social_prompt, suppress_keywords, boost_keywords, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, parentId, name, payload.color, icon, trendEnabled, topicEnabled, socialEnabled, sentimentEnabled, summaryPrompt, trendPrompt, topicPrompt, socialPrompt, suppressKeywords, boostKeywords, now, now],
  })

  return {
    id,
    parent_id: parentId,
    name,
    color: payload.color,
    icon,
    sort_order: 0,
    trend_enabled: Boolean(payload.trend_enabled),
    topic_enabled: Boolean(payload.topic_enabled),
    social_enabled: Boolean(payload.social_enabled),
    sentiment_enabled: Boolean(payload.sentiment_enabled),
    summary_prompt: summaryPrompt,
    trend_prompt: trendPrompt,
    topic_prompt: topicPrompt,
    social_prompt: socialPrompt,
    suppress_keywords: payload.suppress_keywords ?? [],
    boost_keywords: payload.boost_keywords ?? [],
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
  const args: Array<string | number | boolean | null> = []

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

  if (payload.trend_enabled !== undefined) {
    updates.push('trend_enabled = ?')
    args.push(payload.trend_enabled ? 1 : 0)
  }

  if (payload.topic_enabled !== undefined) {
    updates.push('topic_enabled = ?')
    args.push(payload.topic_enabled ? 1 : 0)
  }

  if (payload.social_enabled !== undefined) {
    updates.push('social_enabled = ?')
    args.push(payload.social_enabled ? 1 : 0)
  }

  if (payload.sentiment_enabled !== undefined) {
    updates.push('sentiment_enabled = ?')
    args.push(payload.sentiment_enabled ? 1 : 0)
  }

  if (payload.summary_prompt !== undefined) {
    updates.push('summary_prompt = ?')
    args.push(payload.summary_prompt)
  }

  if (payload.trend_prompt !== undefined) {
    updates.push('trend_prompt = ?')
    args.push(payload.trend_prompt)
  }

  if (payload.topic_prompt !== undefined) {
    updates.push('topic_prompt = ?')
    args.push(payload.topic_prompt)
  }

  if (payload.social_prompt !== undefined) {
    updates.push('social_prompt = ?')
    args.push(payload.social_prompt)
  }

  if (payload.suppress_keywords !== undefined) {
    updates.push('suppress_keywords = ?')
    args.push(JSON.stringify(payload.suppress_keywords))
  }

  if (payload.boost_keywords !== undefined) {
    updates.push('boost_keywords = ?')
    args.push(JSON.stringify(payload.boost_keywords))
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
