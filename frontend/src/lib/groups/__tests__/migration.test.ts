// ABOUTME: Tests for sensor key migration and group structure migration.
// ABOUTME: Verifies old monolithic keys are split and new groups (Voices, Topics) are created.

import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../../db'

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

  it('should have 6 default groups total', async () => {
    const db = await getDb()
    const result = await db.execute("SELECT COUNT(*) as cnt FROM source_groups")
    expect(Number(result.rows[0].cnt)).toBe(6)
  })
})
