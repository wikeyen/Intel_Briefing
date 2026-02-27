// ABOUTME: Migrates old monolithic sensor keys to new split keys in source_group_members.
// ABOUTME: Runs during initDb() to handle the x→x_accounts, bluesky→bluesky_accounts+bluesky_topics transition.

import { getDb } from '../db'

const KEY_MIGRATIONS: Record<string, string[]> = {
  x: ['x_accounts'],
  bluesky: ['bluesky_accounts', 'bluesky_topics'],
  mastodon: ['mastodon_accounts', 'mastodon_topics'],
  rss_feeds: ['rss_blogs'],
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
