// ABOUTME: Comprehensive tests for the groups query module — CRUD, membership, nesting, and seeding.
// ABOUTME: Uses in-memory SQLite via initDb(':memory:') for isolation between tests.

import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, getDb } from '../../db'
import {
  listGroups,
  listGroupsFlat,
  sensorGroupMap,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  setGroupMembers,
  addGroupMember,
  removeGroupMember,
  reorderGroups,
} from '../queries'
import { seedDefaultGroups } from '../seed'

/**
 * initDb(':memory:') creates tables AND seeds default groups.
 * Tests that need a clean slate clear both tables after init.
 */
async function initCleanDb(): Promise<void> {
  await initDb(':memory:')
  const db = await getDb()
  // Enable foreign key enforcement for CASCADE tests
  await db.execute('PRAGMA foreign_keys = ON')
  // Clear seeded data so tests start from scratch
  await db.execute('DELETE FROM source_group_members')
  await db.execute('DELETE FROM source_groups')
}

// ── listGroups ──────────────────────────────────────────────────────────

describe('listGroups', () => {
  beforeEach(initCleanDb)

  it('returns empty array when no groups exist', async () => {
    const groups = await listGroups()
    expect(groups).toEqual([])
  })

  it('returns seeded defaults after seeding (6 top-level groups)', async () => {
    await seedDefaultGroups()
    const groups = await listGroups()
    expect(groups).toHaveLength(6)
    expect(groups.map(g => g.name)).toEqual([
      'Research & Reports',
      'News',
      'Trending',
      'Opinions',
      'Voices',
      'Topics',
    ])
  })

  it('nests children under their parent', async () => {
    const parent = await createGroup({ name: 'Parent', color: '#1A7A6D' })
    await createGroup({ name: 'Child', color: '#2E7D9A', parent_id: parent.id })

    const groups = await listGroups()
    expect(groups).toHaveLength(1)
    expect(groups[0].children).toHaveLength(1)
    expect(groups[0].children[0].name).toBe('Child')
    expect(groups[0].children[0].parent_id).toBe(parent.id)
  })
})

// ── createGroup ─────────────────────────────────────────────────────────

describe('createGroup', () => {
  beforeEach(initCleanDb)

  it('creates a group and returns it with correct fields', async () => {
    const group = await createGroup({
      name: 'Test Group',
      color: '#1A7A6D',
      processing: 'news',
    })
    expect(group.id).toBeTruthy()
    expect(group.name).toBe('Test Group')
    expect(group.color).toBe('#1A7A6D')
    expect(group.processing).toBe('news')
    expect(group.parent_id).toBeNull()
    expect(group.sensors).toEqual([])
    expect(group.created_at).toBeTruthy()
    expect(group.updated_at).toBeTruthy()
  })

  it('defaults processing to general when not specified', async () => {
    const group = await createGroup({ name: 'Minimal', color: '#2E7D9A' })
    expect(group.processing).toBe('general')
  })

  it('trims whitespace from name', async () => {
    const group = await createGroup({ name: '  Padded Name  ', color: '#1A7A6D' })
    expect(group.name).toBe('Padded Name')
  })

  it('rejects empty name', async () => {
    await expect(createGroup({ name: '', color: '#1A7A6D' })).rejects.toThrow(
      'Group name must not be empty'
    )
  })

  it('rejects whitespace-only name', async () => {
    await expect(createGroup({ name: '   ', color: '#1A7A6D' })).rejects.toThrow(
      'Group name must not be empty'
    )
  })

  it('rejects name longer than 50 characters', async () => {
    const longName = 'A'.repeat(51)
    await expect(createGroup({ name: longName, color: '#1A7A6D' })).rejects.toThrow(
      '50 characters or fewer'
    )
  })

  it('accepts name exactly 50 characters', async () => {
    const name = 'A'.repeat(50)
    const group = await createGroup({ name, color: '#1A7A6D' })
    expect(group.name).toBe(name)
  })

  it('rejects invalid hex color', async () => {
    await expect(createGroup({ name: 'Test', color: 'red' })).rejects.toThrow(
      'valid hex color'
    )
  })

  it('rejects short hex color', async () => {
    await expect(createGroup({ name: 'Test', color: '#FFF' })).rejects.toThrow(
      'valid hex color'
    )
  })

  it('rejects hex color without hash', async () => {
    await expect(createGroup({ name: 'Test', color: '1A7A6D' })).rejects.toThrow(
      'valid hex color'
    )
  })

  it('accepts lowercase hex color', async () => {
    const group = await createGroup({ name: 'Test', color: '#1a7a6d' })
    expect(group.color).toBe('#1a7a6d')
  })

  it('creates a sub-group when parent_id is valid top-level group', async () => {
    const parent = await createGroup({ name: 'Parent', color: '#1A7A6D' })
    const child = await createGroup({
      name: 'Child',
      color: '#2E7D9A',
      parent_id: parent.id,
    })
    expect(child.parent_id).toBe(parent.id)
  })

  it('rejects nesting beyond one level', async () => {
    const parent = await createGroup({ name: 'Parent', color: '#1A7A6D' })
    const child = await createGroup({
      name: 'Child',
      color: '#2E7D9A',
      parent_id: parent.id,
    })
    await expect(
      createGroup({ name: 'Grandchild', color: '#C4851C', parent_id: child.id })
    ).rejects.toThrow('Cannot nest groups beyond one level')
  })

  it('rejects non-existent parent_id', async () => {
    await expect(
      createGroup({ name: 'Orphan', color: '#1A7A6D', parent_id: 'non-existent' })
    ).rejects.toThrow('Parent group not found')
  })
})

// ── getGroup ────────────────────────────────────────────────────────────

describe('getGroup', () => {
  beforeEach(initCleanDb)

  it('returns null for non-existent ID', async () => {
    const result = await getGroup('nope')
    expect(result).toBeNull()
  })

  it('returns group with sensors', async () => {
    const created = await createGroup({ name: 'With Sensors', color: '#1A7A6D' })
    await setGroupMembers(created.id, ['arxiv', 'github'])

    const group = await getGroup(created.id)
    expect(group).not.toBeNull()
    expect(group!.name).toBe('With Sensors')
    expect(group!.sensors).toEqual(['arxiv', 'github'])
  })
})

// ── updateGroup ─────────────────────────────────────────────────────────

describe('updateGroup', () => {
  beforeEach(initCleanDb)

  it('updates name and returns updated group', async () => {
    const created = await createGroup({ name: 'Original', color: '#1A7A6D' })
    const updated = await updateGroup(created.id, { name: 'Renamed' })
    expect(updated.name).toBe('Renamed')
    expect(updated.id).toBe(created.id)
  })

  it('updates color', async () => {
    const created = await createGroup({ name: 'Color Test', color: '#1A7A6D' })
    const updated = await updateGroup(created.id, { color: '#FF0000' })
    expect(updated.color).toBe('#FF0000')
  })

  it('updates processing type', async () => {
    const created = await createGroup({ name: 'Processing', color: '#1A7A6D' })
    const updated = await updateGroup(created.id, { processing: 'trend' })
    expect(updated.processing).toBe('trend')
  })

  it('updates icon', async () => {
    const created = await createGroup({ name: 'Icon Test', color: '#1A7A6D' })
    const updated = await updateGroup(created.id, { icon: 'globe' })
    expect(updated.icon).toBe('globe')
  })

  it('validates name on update', async () => {
    const created = await createGroup({ name: 'Valid', color: '#1A7A6D' })
    await expect(updateGroup(created.id, { name: '' })).rejects.toThrow('must not be empty')
  })

  it('validates color on update', async () => {
    const created = await createGroup({ name: 'Valid', color: '#1A7A6D' })
    await expect(updateGroup(created.id, { color: 'nope' })).rejects.toThrow('valid hex color')
  })

  it('throws when group not found', async () => {
    await expect(updateGroup('ghost', { name: 'Nope' })).rejects.toThrow('Group not found')
  })

  it('returns unchanged group when no fields provided', async () => {
    const created = await createGroup({ name: 'NoOp', color: '#1A7A6D' })
    const updated = await updateGroup(created.id, {})
    expect(updated.name).toBe('NoOp')
  })

  it('preserves sensors after update', async () => {
    const created = await createGroup({ name: 'With Sensors', color: '#1A7A6D' })
    await setGroupMembers(created.id, ['arxiv', 'github'])
    const updated = await updateGroup(created.id, { name: 'Updated' })
    expect(updated.sensors).toEqual(['arxiv', 'github'])
  })
})

// ── deleteGroup ─────────────────────────────────────────────────────────

describe('deleteGroup', () => {
  beforeEach(initCleanDb)

  it('removes a group', async () => {
    const created = await createGroup({ name: 'Doomed', color: '#1A7A6D' })
    await deleteGroup(created.id)
    const result = await getGroup(created.id)
    expect(result).toBeNull()
  })

  it('removes group members via CASCADE', async () => {
    const created = await createGroup({ name: 'With Members', color: '#1A7A6D' })
    await setGroupMembers(created.id, ['arxiv', 'github'])
    await deleteGroup(created.id)

    const db = await getDb()
    const members = await db.execute({
      sql: 'SELECT * FROM source_group_members WHERE group_id = ?',
      args: [created.id],
    })
    expect(members.rows).toHaveLength(0)
  })

  it('removes sub-groups when parent is deleted (CASCADE)', async () => {
    const parent = await createGroup({ name: 'Parent', color: '#1A7A6D' })
    const child = await createGroup({
      name: 'Child',
      color: '#2E7D9A',
      parent_id: parent.id,
    })
    await deleteGroup(parent.id)
    const result = await getGroup(child.id)
    expect(result).toBeNull()
  })

  it('is a no-op for non-existent ID', async () => {
    // Should not throw
    await deleteGroup('does-not-exist')
  })
})

// ── setGroupMembers ─────────────────────────────────────────────────────

describe('setGroupMembers', () => {
  beforeEach(initCleanDb)

  it('sets members for a group', async () => {
    const group = await createGroup({ name: 'Members Test', color: '#1A7A6D' })
    await setGroupMembers(group.id, ['arxiv', 'github', 'hacker_news'])

    const loaded = await getGroup(group.id)
    expect(loaded!.sensors).toEqual(['arxiv', 'github', 'hacker_news'])
  })

  it('replaces all existing members', async () => {
    const group = await createGroup({ name: 'Replace Test', color: '#1A7A6D' })
    await setGroupMembers(group.id, ['arxiv', 'github'])
    await setGroupMembers(group.id, ['weibo', 'zhihu'])

    const loaded = await getGroup(group.id)
    expect(loaded!.sensors).toEqual(['weibo', 'zhihu'])
  })

  it('clears members when given empty array', async () => {
    const group = await createGroup({ name: 'Clear Test', color: '#1A7A6D' })
    await setGroupMembers(group.id, ['arxiv'])
    await setGroupMembers(group.id, [])

    const loaded = await getGroup(group.id)
    expect(loaded!.sensors).toEqual([])
  })
})

// ── addGroupMember / removeGroupMember ──────────────────────────────────

describe('addGroupMember', () => {
  beforeEach(initCleanDb)

  it('adds a sensor to a group', async () => {
    const group = await createGroup({ name: 'Add Test', color: '#1A7A6D' })
    await addGroupMember(group.id, 'arxiv')

    const loaded = await getGroup(group.id)
    expect(loaded!.sensors).toContain('arxiv')
  })

  it('is a no-op when sensor already a member (INSERT OR IGNORE)', async () => {
    const group = await createGroup({ name: 'Dupe Test', color: '#1A7A6D' })
    await addGroupMember(group.id, 'arxiv')
    await addGroupMember(group.id, 'arxiv')

    const loaded = await getGroup(group.id)
    expect(loaded!.sensors.filter(s => s === 'arxiv')).toHaveLength(1)
  })
})

describe('removeGroupMember', () => {
  beforeEach(initCleanDb)

  it('removes a sensor from a group', async () => {
    const group = await createGroup({ name: 'Remove Test', color: '#1A7A6D' })
    await setGroupMembers(group.id, ['arxiv', 'github'])
    await removeGroupMember(group.id, 'arxiv')

    const loaded = await getGroup(group.id)
    expect(loaded!.sensors).toEqual(['github'])
  })

  it('is a no-op when sensor is not a member', async () => {
    const group = await createGroup({ name: 'NoOp Remove', color: '#1A7A6D' })
    // Should not throw
    await removeGroupMember(group.id, 'not-a-member')
  })
})

// ── reorderGroups ───────────────────────────────────────────────────────

describe('reorderGroups', () => {
  beforeEach(initCleanDb)

  it('updates sort_order based on array position', async () => {
    const a = await createGroup({ name: 'A', color: '#1A7A6D' })
    const b = await createGroup({ name: 'B', color: '#2E7D9A' })
    const c = await createGroup({ name: 'C', color: '#C4851C' })

    // Reverse order
    await reorderGroups([c.id, b.id, a.id])

    const groups = await listGroupsFlat()
    const sorted = groups.sort((x, y) => x.sort_order - y.sort_order)
    expect(sorted[0].name).toBe('C')
    expect(sorted[0].sort_order).toBe(0)
    expect(sorted[1].name).toBe('B')
    expect(sorted[1].sort_order).toBe(1)
    expect(sorted[2].name).toBe('A')
    expect(sorted[2].sort_order).toBe(2)
  })
})

// ── listGroupsFlat ──────────────────────────────────────────────────────

describe('listGroupsFlat', () => {
  beforeEach(initCleanDb)

  it('returns all groups with sensor arrays', async () => {
    const group = await createGroup({ name: 'Flat Test', color: '#1A7A6D', processing: 'news' })
    await setGroupMembers(group.id, ['hacker_news', 'github'])

    const groups = await listGroupsFlat()
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Flat Test')
    expect(groups[0].sensors).toEqual(['hacker_news', 'github'])
    expect(groups[0].processing).toBe('news')
  })

  it('includes both top-level and child groups', async () => {
    const parent = await createGroup({ name: 'Parent', color: '#1A7A6D' })
    await createGroup({ name: 'Child', color: '#2E7D9A', parent_id: parent.id })

    const groups = await listGroupsFlat()
    expect(groups).toHaveLength(2)
  })
})

// ── sensorGroupMap ──────────────────────────────────────────────────────

describe('sensorGroupMap', () => {
  beforeEach(initCleanDb)

  it('returns sensor key to group IDs mapping', async () => {
    const g1 = await createGroup({ name: 'Group 1', color: '#1A7A6D' })
    const g2 = await createGroup({ name: 'Group 2', color: '#2E7D9A' })
    await addGroupMember(g1.id, 'arxiv')
    await addGroupMember(g2.id, 'arxiv')
    await addGroupMember(g1.id, 'github')

    const map = await sensorGroupMap()
    expect(map.get('arxiv')).toHaveLength(2)
    expect(map.get('arxiv')).toContain(g1.id)
    expect(map.get('arxiv')).toContain(g2.id)
    expect(map.get('github')).toEqual([g1.id])
  })

  it('returns empty map when no members exist', async () => {
    const map = await sensorGroupMap()
    expect(map.size).toBe(0)
  })
})

// ── seedDefaultGroups ───────────────────────────────────────────────────

describe('seedDefaultGroups', () => {
  beforeEach(initCleanDb)

  it('creates 6 default groups with correct sensors', async () => {
    await seedDefaultGroups()
    const groups = await listGroupsFlat()
    expect(groups).toHaveLength(6)

    const research = groups.find(g => g.name === 'Research & Reports')!
    expect(research.color).toBe('#1A7A6D')
    expect(research.processing).toBe('research')
    expect(research.sensors).toEqual(['arxiv'])

    const news = groups.find(g => g.name === 'News')!
    expect(news.color).toBe('#2E7D9A')
    expect(news.processing).toBe('news')
    expect(news.sensors).toEqual([
      'hacker_news', 'product_hunt', 'sources_36kr',
      'wallstreetcn', 'rss_news', 'github',
    ])

    const trending = groups.find(g => g.name === 'Trending')!
    expect(trending.color).toBe('#C4851C')
    expect(trending.processing).toBe('trend')
    expect(trending.sensors).toHaveLength(12)

    const opinions = groups.find(g => g.name === 'Opinions')!
    expect(opinions.color).toBe('#8B5CF6')
    expect(opinions.processing).toBe('opinion')
    expect(opinions.sensors).toEqual(['hn_blogs', 'rss_blogs'])

    const voices = groups.find(g => g.name === 'Voices')!
    expect(voices.color).toBe('#E05A8D')
    expect(voices.processing).toBe('social')
    expect(voices.sensors).toEqual(['x_accounts', 'bluesky_accounts', 'mastodon_accounts'])

    const topics = groups.find(g => g.name === 'Topics')!
    expect(topics.color).toBe('#3B82F6')
    expect(topics.processing).toBe('topic')
    expect(topics.sensors).toEqual(['bluesky_topics', 'mastodon_topics'])
  })

  it('assigns correct sort_order to seeded groups', async () => {
    await seedDefaultGroups()
    const groups = await listGroupsFlat()
    const sorted = groups.sort((a, b) => a.sort_order - b.sort_order)
    expect(sorted[0].name).toBe('Research & Reports')
    expect(sorted[0].sort_order).toBe(0)
    expect(sorted[5].name).toBe('Topics')
    expect(sorted[5].sort_order).toBe(5)
  })

  it('is idempotent — second call is a no-op', async () => {
    await seedDefaultGroups()
    await seedDefaultGroups()
    const groups = await listGroupsFlat()
    expect(groups).toHaveLength(6)
  })

  it('does not seed if custom groups already exist', async () => {
    await createGroup({ name: 'Custom', color: '#FF0000' })
    await seedDefaultGroups()
    const groups = await listGroupsFlat()
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Custom')
  })
})
