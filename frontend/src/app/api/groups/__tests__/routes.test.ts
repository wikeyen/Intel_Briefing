// ABOUTME: Integration tests for group REST API routes — tests full request/response cycle.
// ABOUTME: Uses in-memory SQLite via initDb(':memory:') for isolated per-test databases.
import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { initDb } from '@/lib/db'
import { listGroups, getGroup, createGroup, setGroupMembers } from '@/lib/groups/queries'

// Route handlers under test
import { GET as listRoute, POST as createRoute } from '../route'
import { PUT as updateRoute, DELETE as deleteRoute } from '../[id]/route'
import { PUT as setMembersRoute, POST as addMemberRoute } from '../[id]/members/route'
import { DELETE as removeMemberRoute } from '../[id]/members/[key]/route'
import { PUT as reorderRoute } from '../reorder/route'

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a NextRequest with JSON body. */
function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init)
}

/** Create a params promise matching Next.js 15 App Router convention. */
function paramsOf<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

// ── Setup ────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await initDb(':memory:')
})

// ── GET /api/groups ──────────────────────────────────────────────────────

describe('GET /api/groups', () => {
  it('returns seeded default groups (7 top-level)', async () => {
    const res = await listRoute()
    expect(res.status).toBe(200)

    const groups = await res.json()
    expect(groups).toHaveLength(7)

    const names = groups.map((g: { name: string }) => g.name)
    expect(names).toContain('Research & Reports')
    expect(names).toContain('News')
    expect(names).toContain('Trending')
    expect(names).toContain('Opinions')
    expect(names).toContain('Voices')
    expect(names).toContain('Topics')
    expect(names).toContain('Product')
  })

  it('returns groups with sensor arrays', async () => {
    const res = await listRoute()
    const groups = await res.json()

    const news = groups.find((g: { name: string }) => g.name === 'News')
    expect(news.sensors).toContain('hacker_news')
    expect(news.sensors).toContain('github')
  })
})

// ── POST /api/groups ─────────────────────────────────────────────────────

describe('POST /api/groups', () => {
  it('creates a group and returns 201 with workflow defaults', async () => {
    const req = jsonRequest('/api/groups', 'POST', {
      name: 'Custom Group',
      color: '#FF0000',
    })
    const res = await createRoute(req)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Custom Group')
    expect(body.color).toBe('#FF0000')
    expect(body.trend_enabled).toBe(false)
    expect(body.topic_enabled).toBe(false)
    expect(body.social_enabled).toBe(false)
    expect(body.sentiment_enabled).toBe(false)
    expect(body.id).toBeTruthy()
    expect(body.sensors).toEqual([])
  })

  it('returns 400 when name is missing', async () => {
    const req = jsonRequest('/api/groups', 'POST', {
      color: '#FF0000',
    })
    const res = await createRoute(req)
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error).toMatch(/name/i)
  })

  it('returns 400 when name is empty', async () => {
    const req = jsonRequest('/api/groups', 'POST', {
      name: '   ',
      color: '#FF0000',
    })
    const res = await createRoute(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when color is invalid', async () => {
    const req = jsonRequest('/api/groups', 'POST', {
      name: 'Test',
      color: 'not-a-hex',
    })
    const res = await createRoute(req)
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error).toMatch(/color/i)
  })

  it('returns 400 when color is missing', async () => {
    const req = jsonRequest('/api/groups', 'POST', {
      name: 'Test',
    })
    const res = await createRoute(req)
    expect(res.status).toBe(400)
  })

  it('creates a sub-group with parent_id', async () => {
    // Use one of the seeded groups as parent
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const parent = groups[0]

    const req = jsonRequest('/api/groups', 'POST', {
      name: 'Sub Group',
      color: '#00FF00',
      parent_id: parent.id,
    })
    const res = await createRoute(req)
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.parent_id).toBe(parent.id)
  })

  it('returns 400 when nesting beyond one level', async () => {
    // Create a child of a seeded group
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const parent = groups[0]

    const childReq = jsonRequest('/api/groups', 'POST', {
      name: 'Child',
      color: '#00FF00',
      parent_id: parent.id,
    })
    const childRes = await createRoute(childReq)
    expect(childRes.status).toBe(201)
    const child = await childRes.json()

    // Try to nest under child (grandchild — should fail)
    const grandchildReq = jsonRequest('/api/groups', 'POST', {
      name: 'Grandchild',
      color: '#0000FF',
      parent_id: child.id,
    })
    const grandchildRes = await createRoute(grandchildReq)
    expect(grandchildRes.status).toBe(400)

    const body = await grandchildRes.json()
    expect(body.error).toMatch(/nest/i)
  })

  it('accepts workflow toggle fields', async () => {
    const req = jsonRequest('/api/groups', 'POST', {
      name: 'Trend Group',
      color: '#AABB00',
      trend_enabled: true,
      sentiment_enabled: true,
    })
    const res = await createRoute(req)
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.trend_enabled).toBe(true)
    expect(body.sentiment_enabled).toBe(true)
    expect(body.topic_enabled).toBe(false)
    expect(body.social_enabled).toBe(false)
  })

  it('accepts keyword arrays', async () => {
    const req = jsonRequest('/api/groups', 'POST', {
      name: 'Keyword Group',
      color: '#AABB00',
      suppress_keywords: ['spam'],
      boost_keywords: ['AI', 'ML'],
    })
    const res = await createRoute(req)
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.suppress_keywords).toEqual(['spam'])
    expect(body.boost_keywords).toEqual(['AI', 'ML'])
  })

  it('returns 400 for non-boolean workflow toggle', async () => {
    const req = jsonRequest('/api/groups', 'POST', {
      name: 'Bad Toggle',
      color: '#AABB00',
      trend_enabled: 'yes',
    })
    const res = await createRoute(req)
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error).toMatch(/trend_enabled.*boolean/i)
  })

  it('returns 400 for non-array keyword field', async () => {
    const req = jsonRequest('/api/groups', 'POST', {
      name: 'Bad Keywords',
      color: '#AABB00',
      suppress_keywords: 'not-an-array',
    })
    const res = await createRoute(req)
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error).toMatch(/suppress_keywords.*array/i)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest(new URL('/api/groups', 'http://localhost:3000'), {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await createRoute(req)
    expect(res.status).toBe(400)
  })
})

// ── PUT /api/groups/:id ──────────────────────────────────────────────────

describe('PUT /api/groups/:id', () => {
  it('updates a group name', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const target = groups[0]

    const req = jsonRequest(`/api/groups/${target.id}`, 'PUT', {
      name: 'Renamed Group',
    })
    const res = await updateRoute(req, { params: paramsOf({ id: target.id }) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.name).toBe('Renamed Group')
    expect(body.id).toBe(target.id)
  })

  it('updates a group color', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const target = groups[0]

    const req = jsonRequest(`/api/groups/${target.id}`, 'PUT', {
      color: '#ABCDEF',
    })
    const res = await updateRoute(req, { params: paramsOf({ id: target.id }) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.color).toBe('#ABCDEF')
  })

  it('updates workflow toggles via PUT', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const target = groups[0]

    const req = jsonRequest(`/api/groups/${target.id}`, 'PUT', {
      trend_enabled: true,
      social_enabled: true,
    })
    const res = await updateRoute(req, { params: paramsOf({ id: target.id }) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.trend_enabled).toBe(true)
    expect(body.social_enabled).toBe(true)
  })

  it('returns 400 for non-boolean workflow toggle on PUT', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const target = groups[0]

    const req = jsonRequest(`/api/groups/${target.id}`, 'PUT', {
      trend_enabled: 'yes',
    })
    const res = await updateRoute(req, { params: paramsOf({ id: target.id }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown group ID', async () => {
    const req = jsonRequest('/api/groups/nonexistent', 'PUT', {
      name: 'Nope',
    })
    const res = await updateRoute(req, { params: paramsOf({ id: 'nonexistent' }) })
    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.error).toBe('Group not found')
  })

  it('returns 400 for invalid color', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const target = groups[0]

    const req = jsonRequest(`/api/groups/${target.id}`, 'PUT', {
      color: 'bad',
    })
    const res = await updateRoute(req, { params: paramsOf({ id: target.id }) })
    expect(res.status).toBe(400)
  })
})

// ── DELETE /api/groups/:id ───────────────────────────────────────────────

describe('DELETE /api/groups/:id', () => {
  it('deletes a group', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const target = groups[0]

    const req = jsonRequest(`/api/groups/${target.id}`, 'DELETE')
    const res = await deleteRoute(req, { params: paramsOf({ id: target.id }) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)

    // Verify it's actually gone
    const afterRes = await listRoute()
    const afterGroups = await afterRes.json()
    expect(afterGroups).toHaveLength(groups.length - 1)
  })

  it('returns 404 for unknown group ID', async () => {
    const req = jsonRequest('/api/groups/nonexistent', 'DELETE')
    const res = await deleteRoute(req, { params: paramsOf({ id: 'nonexistent' }) })
    expect(res.status).toBe(404)
  })
})

// ── PUT /api/groups/:id/members ──────────────────────────────────────────

describe('PUT /api/groups/:id/members', () => {
  it('replaces all members', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const target = groups[0]

    const req = jsonRequest(`/api/groups/${target.id}/members`, 'PUT', {
      sensors: ['sensor_a', 'sensor_b'],
    })
    const res = await setMembersRoute(req, { params: paramsOf({ id: target.id }) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.sensors).toEqual(['sensor_a', 'sensor_b'])
  })

  it('returns 400 when sensors is not an array', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const target = groups[0]

    const req = jsonRequest(`/api/groups/${target.id}/members`, 'PUT', {
      sensors: 'not-an-array',
    })
    const res = await setMembersRoute(req, { params: paramsOf({ id: target.id }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown group ID', async () => {
    const req = jsonRequest('/api/groups/nonexistent/members', 'PUT', {
      sensors: ['a'],
    })
    const res = await setMembersRoute(req, { params: paramsOf({ id: 'nonexistent' }) })
    expect(res.status).toBe(404)
  })

  it('clears all members when sensors is empty', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const target = groups.find((g: { name: string }) => g.name === 'News')

    // News should have members from seeding
    expect(target.sensors.length).toBeGreaterThan(0)

    const req = jsonRequest(`/api/groups/${target.id}/members`, 'PUT', {
      sensors: [],
    })
    const res = await setMembersRoute(req, { params: paramsOf({ id: target.id }) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.sensors).toEqual([])
  })
})

// ── POST /api/groups/:id/members ─────────────────────────────────────────

describe('POST /api/groups/:id/members', () => {
  it('adds a single sensor via sensor_key', async () => {
    // Create a fresh group with no members
    const createReq = jsonRequest('/api/groups', 'POST', {
      name: 'Empty Group',
      color: '#112233',
    })
    const createRes = await createRoute(createReq)
    const group = await createRes.json()

    const req = jsonRequest(`/api/groups/${group.id}/members`, 'POST', {
      sensor_key: 'new_sensor',
    })
    const res = await addMemberRoute(req, { params: paramsOf({ id: group.id }) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.sensors).toContain('new_sensor')
  })

  it('adds multiple sensors via sensors array', async () => {
    const createReq = jsonRequest('/api/groups', 'POST', {
      name: 'Batch Group',
      color: '#445566',
    })
    const createRes = await createRoute(createReq)
    const group = await createRes.json()

    const req = jsonRequest(`/api/groups/${group.id}/members`, 'POST', {
      sensors: ['a', 'b', 'c'],
    })
    const res = await addMemberRoute(req, { params: paramsOf({ id: group.id }) })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.sensors).toContain('a')
    expect(body.sensors).toContain('b')
    expect(body.sensors).toContain('c')
  })

  it('returns 400 when neither sensor_key nor sensors provided', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const target = groups[0]

    const req = jsonRequest(`/api/groups/${target.id}/members`, 'POST', {
      something_else: true,
    })
    const res = await addMemberRoute(req, { params: paramsOf({ id: target.id }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown group ID', async () => {
    const req = jsonRequest('/api/groups/nonexistent/members', 'POST', {
      sensor_key: 'test',
    })
    const res = await addMemberRoute(req, { params: paramsOf({ id: 'nonexistent' }) })
    expect(res.status).toBe(404)
  })
})

// ── DELETE /api/groups/:id/members/:key ──────────────────────────────────

describe('DELETE /api/groups/:id/members/:key', () => {
  it('removes a sensor from a group', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()
    const news = groups.find((g: { name: string }) => g.name === 'News')

    expect(news.sensors).toContain('hacker_news')

    const req = jsonRequest(`/api/groups/${news.id}/members/hacker_news`, 'DELETE')
    const res = await removeMemberRoute(req, {
      params: paramsOf({ id: news.id, key: 'hacker_news' }),
    })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)

    // Verify removal
    const updated = await getGroup(news.id)
    expect(updated!.sensors).not.toContain('hacker_news')
  })

  it('returns 404 for unknown group ID', async () => {
    const req = jsonRequest('/api/groups/nonexistent/members/test', 'DELETE')
    const res = await removeMemberRoute(req, {
      params: paramsOf({ id: 'nonexistent', key: 'test' }),
    })
    expect(res.status).toBe(404)
  })
})

// ── PUT /api/groups/reorder ──────────────────────────────────────────────

describe('PUT /api/groups/reorder', () => {
  it('updates sort order of groups', async () => {
    const groupsRes = await listRoute()
    const groups = await groupsRes.json()

    // Reverse the order
    const reversedIds = groups.map((g: { id: string }) => g.id).reverse()

    const req = jsonRequest('/api/groups/reorder', 'PUT', {
      ordered_ids: reversedIds,
    })
    const res = await reorderRoute(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toBe(true)

    // Verify the order changed — last group should now have sort_order 0
    const afterRes = await listRoute()
    const afterGroups = await afterRes.json()
    expect(afterGroups[0].id).toBe(reversedIds[0])
  })

  it('returns 400 when ordered_ids is not an array', async () => {
    const req = jsonRequest('/api/groups/reorder', 'PUT', {
      ordered_ids: 'not-an-array',
    })
    const res = await reorderRoute(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when ordered_ids contains non-strings', async () => {
    const req = jsonRequest('/api/groups/reorder', 'PUT', {
      ordered_ids: [1, 2, 3],
    })
    const res = await reorderRoute(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest(new URL('/api/groups/reorder', 'http://localhost:3000'), {
      method: 'PUT',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await reorderRoute(req)
    expect(res.status).toBe(400)
  })
})
