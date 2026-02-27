// ABOUTME: Migrates old monolithic sensor keys to new split keys in source_group_members.
// ABOUTME: Runs during initDb() to handle the x->x_accounts, bluesky->bluesky_accounts+bluesky_topics transition.

import { getDb } from '../db'
import { createGroup, setGroupMembers } from './queries'

const KEY_MIGRATIONS: Record<string, string[]> = {
  x: ['x_accounts'],
  bluesky: ['bluesky_accounts', 'bluesky_topics'],
  mastodon: ['mastodon_accounts', 'mastodon_topics'],
  rss_feeds: ['rss_blogs'],
}

/** Sensor->group assignments for the v2 group structure. */
const GROUP_SENSOR_MAP: Record<string, { color: string; social_enabled?: boolean; sentiment_enabled?: boolean; topic_enabled?: boolean; sensors: string[] }> = {
  Voices:  { color: '#E05A8D', social_enabled: true, sentiment_enabled: true, sensors: ['x_accounts', 'bluesky_accounts', 'mastodon_accounts'] },
  Topics:  { color: '#3B82F6', topic_enabled: true, sensors: ['bluesky_topics', 'mastodon_topics'] },
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

  // Only run once — skip if already migrated
  const marker = await db.execute({
    sql: "SELECT value FROM kv WHERE key = 'migration:group_structure_v2'",
    args: [],
  })
  if (marker.rows.length > 0) return

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
        social_enabled: def.social_enabled,
        sentiment_enabled: def.sentiment_enabled,
        topic_enabled: def.topic_enabled,
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

  // Mark migration as complete so it never runs again
  await db.execute({
    sql: "INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES ('migration:group_structure_v2', '\"done\"', NULL)",
    args: [],
  })
}

/**
 * Migrates the old `processing` column to 10 discrete workflow columns.
 * Translates processing enum values to boolean toggles:
 *   - 'trend'  -> trend_enabled = 1
 *   - 'topic'  -> topic_enabled = 1
 *   - 'social' -> social_enabled = 1, sentiment_enabled = 1
 *   - all others -> all toggles stay 0
 *
 * The old `processing` column is left in place (SQLite can't drop columns
 * in older versions) but is no longer read by the application.
 */
export async function migrateWorkflowColumns(): Promise<void> {
  const db = await getDb()

  // Only run once — gated on kv marker
  const marker = await db.execute({
    sql: "SELECT value FROM kv WHERE key = 'migration:workflow_columns_v1'",
    args: [],
  })
  if (marker.rows.length > 0) return

  // Check if the old `processing` column exists
  let hasProcessing = false
  try {
    await db.execute('SELECT processing FROM source_groups LIMIT 1')
    hasProcessing = true
  } catch {
    // Column doesn't exist — fresh schema with new columns already
  }

  if (hasProcessing) {
    // Add new columns (ALTER TABLE ADD COLUMN is safe even if table has data)
    const newColumns = [
      'trend_enabled    INTEGER NOT NULL DEFAULT 0',
      'topic_enabled    INTEGER NOT NULL DEFAULT 0',
      'social_enabled   INTEGER NOT NULL DEFAULT 0',
      'sentiment_enabled INTEGER NOT NULL DEFAULT 0',
      'summary_prompt   TEXT',
      'trend_prompt     TEXT',
      'topic_prompt     TEXT',
      'social_prompt    TEXT',
      'suppress_keywords TEXT NOT NULL DEFAULT \'[]\'',
      'boost_keywords   TEXT NOT NULL DEFAULT \'[]\'',
    ]

    for (const colDef of newColumns) {
      try {
        await db.execute(`ALTER TABLE source_groups ADD COLUMN ${colDef}`)
      } catch {
        // Column already exists — safe to ignore
      }
    }

    // Migrate data from processing enum to boolean toggles
    await db.execute("UPDATE source_groups SET trend_enabled = 1 WHERE processing = 'trend'")
    await db.execute("UPDATE source_groups SET topic_enabled = 1 WHERE processing = 'topic'")
    await db.execute("UPDATE source_groups SET social_enabled = 1, sentiment_enabled = 1 WHERE processing = 'social'")
  }

  // Mark migration as complete
  await db.execute({
    sql: "INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES ('migration:workflow_columns_v1', '\"done\"', NULL)",
    args: [],
  })
}
