// ABOUTME: Tests for sensor key migration and group structure migration.
// ABOUTME: Verifies old monolithic keys are split and new groups (Voices, Topics) are created.

import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../../db'
import { migrateGroupStructure } from '../migration'

describe('migrateOldSensorKeys', () => {
  beforeEach(async () => {
    await initDb(':memory:')
  })

  it('should have created Voices and Topics groups on fresh DB via seed', async () => {
    const db = await getDb()
    const result = await db.execute("SELECT name FROM source_groups ORDER BY sort_order")
    const names = result.rows.map(r => r.name as string)
    expect(names).toContain('Voices')
    expect(names).toContain('Topics')
  })

  it('should assign social account sensors to Voices group', async () => {
    const db = await getDb()
    const result = await db.execute(`
      SELECT sgm.sensor_key FROM source_group_members sgm
      JOIN source_groups sg ON sg.id = sgm.group_id
      WHERE sg.name = 'Voices'
      ORDER BY sgm.sort_order
    `)
    const keys = result.rows.map(r => r.sensor_key as string)
    expect(keys).toContain('x_accounts')
    expect(keys).toContain('bluesky_accounts')
    expect(keys).toContain('mastodon_accounts')
  })

  it('should assign topic sensors to Topics group', async () => {
    const db = await getDb()
    const result = await db.execute(`
      SELECT sgm.sensor_key FROM source_group_members sgm
      JOIN source_groups sg ON sg.id = sgm.group_id
      WHERE sg.name = 'Topics'
      ORDER BY sgm.sort_order
    `)
    const keys = result.rows.map(r => r.sensor_key as string)
    expect(keys).toContain('bluesky_topics')
    expect(keys).toContain('mastodon_topics')
  })

  it('should have 7 default groups total', async () => {
    const db = await getDb()
    const result = await db.execute("SELECT COUNT(*) as cnt FROM source_groups")
    expect(Number(result.rows[0].cnt)).toBe(7)
  })
})

describe('migrateGroupStructure idempotency', () => {
  beforeEach(async () => {
    await initDb(':memory:')
  })

  it('should not re-create deleted groups on subsequent runs', async () => {
    const db = await getDb()

    // Delete the Voices group (simulates user action)
    await db.execute("DELETE FROM source_groups WHERE name = 'Voices'")

    // Run migration again — should be a no-op because marker is set
    await migrateGroupStructure()

    const result = await db.execute("SELECT name FROM source_groups WHERE name = 'Voices'")
    expect(result.rows.length).toBe(0)
  })

  it('should not move sensors back after migration marker is set', async () => {
    const db = await getDb()

    // Move x_accounts out of Voices into a different group (simulates user action)
    const voicesResult = await db.execute("SELECT id FROM source_groups WHERE name = 'Voices'")
    const voicesId = voicesResult.rows[0].id as string
    await db.execute({
      sql: 'DELETE FROM source_group_members WHERE group_id = ? AND sensor_key = ?',
      args: [voicesId, 'x_accounts'],
    })

    // Run migration again — should be a no-op
    await migrateGroupStructure()

    // x_accounts should NOT be back in Voices
    const members = await db.execute({
      sql: 'SELECT sensor_key FROM source_group_members WHERE group_id = ?',
      args: [voicesId],
    })
    const keys = members.rows.map(r => r.sensor_key as string)
    expect(keys).not.toContain('x_accounts')
  })

  it('should set migration marker in kv table after first run', async () => {
    const db = await getDb()
    const result = await db.execute(
      "SELECT value FROM kv WHERE key = 'migration:group_structure_v2'"
    )
    expect(result.rows.length).toBe(1)
    expect(result.rows[0].value).toBe('"done"')
  })
})
