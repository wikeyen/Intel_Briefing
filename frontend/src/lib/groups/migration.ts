// ABOUTME: Migrates old monolithic sensor keys to new split keys in source_group_members.
// ABOUTME: Runs during initDb() to handle the x→x_accounts, bluesky→bluesky_accounts+bluesky_topics transition.

import { getDb } from '../db'
import { createGroup, setGroupMembers } from './queries'
import type { GroupProcessing } from './types'

const KEY_MIGRATIONS: Record<string, string[]> = {
  x: ['x_accounts'],
  bluesky: ['bluesky_accounts', 'bluesky_topics'],
  mastodon: ['mastodon_accounts', 'mastodon_topics'],
  rss_feeds: ['rss_blogs'],
}

/** Sensor→group assignments for the v2 group structure. */
const GROUP_SENSOR_MAP: Record<string, { color: string; processing: GroupProcessing; sensors: string[] }> = {
  Voices:  { color: '#E05A8D', processing: 'social', sensors: ['x_accounts', 'bluesky_accounts', 'mastodon_accounts'] },
  Topics:  { color: '#3B82F6', processing: 'topic',  sensors: ['bluesky_topics', 'mastodon_topics'] },
}

export async function migrateOldSensorKeys(): Promise<void> {
  const db = await getDb()

  for (const [oldKey, newKeys] of Object.entries(KEY_MIGRATIONS)) {
    // Find all group memberships with the old key
    const result = await db.execute({
      sql: 'SELECT group_id, sort_order FROM source_group_members WHERE sensor_key = ?',
      args: [oldKey],
    })

    if (result.rows.length === 0) continue

    const now = new Date().toISOString()

    // For each group that had the old key, add the new keys
    for (const row of result.rows) {
      const groupId = row.group_id as string
      const sortOrder = row.sort_order as number

      for (let i = 0; i < newKeys.length; i++) {
        // Check if new key already exists in this group
        const exists = await db.execute({
          sql: 'SELECT 1 FROM source_group_members WHERE group_id = ? AND sensor_key = ?',
          args: [groupId, newKeys[i]],
        })
        if (exists.rows.length === 0) {
          await db.execute({
            sql: 'INSERT INTO source_group_members (group_id, sensor_key, sort_order, added_at) VALUES (?, ?, ?, ?)',
            args: [groupId, newKeys[i], sortOrder + i, now],
          })
        }
      }
    }

    // Remove old key entries
    await db.execute({
      sql: 'DELETE FROM source_group_members WHERE sensor_key = ?',
      args: [oldKey],
    })
  }
}

/**
 * Ensures the v2 group structure exists: creates Voices and Topics groups
 * if missing, and moves sensors to their correct groups.
 */
export async function migrateGroupStructure(): Promise<void> {
  const db = await getDb()

  // Only run if groups exist (skip on fresh DB — seed handles that)
  const countResult = await db.execute('SELECT COUNT(*) as cnt FROM source_groups')
  if (Number(countResult.rows[0].cnt) === 0) return

  const now = new Date().toISOString()

  for (const [groupName, def] of Object.entries(GROUP_SENSOR_MAP)) {
    // Check if the group already exists
    const existing = await db.execute({
      sql: 'SELECT id FROM source_groups WHERE name = ?',
      args: [groupName],
    })

    let groupId: string

    if (existing.rows.length > 0) {
      groupId = existing.rows[0].id as string
    } else {
      // Create the group
      const maxOrder = await db.execute('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM source_groups')
      const group = await createGroup({
        name: groupName,
        color: def.color,
        processing: def.processing,
      })
      groupId = group.id
      await db.execute({
        sql: 'UPDATE source_groups SET sort_order = ? WHERE id = ?',
        args: [Number(maxOrder.rows[0].next), groupId],
      })
    }

    // Move sensors: remove from any current group, add to this group
    for (let i = 0; i < def.sensors.length; i++) {
      const sensor = def.sensors[i]

      // Remove from wherever it currently lives
      await db.execute({
        sql: 'DELETE FROM source_group_members WHERE sensor_key = ? AND group_id != ?',
        args: [sensor, groupId],
      })

      // Ensure it's in the correct group
      const inGroup = await db.execute({
        sql: 'SELECT 1 FROM source_group_members WHERE group_id = ? AND sensor_key = ?',
        args: [groupId, sensor],
      })
      if (inGroup.rows.length === 0) {
        await db.execute({
          sql: 'INSERT INTO source_group_members (group_id, sensor_key, sort_order, added_at) VALUES (?, ?, ?, ?)',
          args: [groupId, sensor, i, now],
        })
      }
    }
  }
}
