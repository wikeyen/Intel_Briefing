// ABOUTME: Tests for the source-groups API client methods (getGroups, createGroup, etc.).
// ABOUTME: Verifies each method calls the correct endpoint with the right HTTP method and body.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from './client'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api group methods', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('getGroups calls GET /api/groups', async () => {
    const tree = [{ id: 'g1', name: 'Research', sensors: [], children: [] }]
    mockFetch.mockResolvedValueOnce(jsonResponse(tree))

    const result = await api.getGroups()

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/groups')
    expect(opts.method).toBeUndefined()
    expect(result).toEqual(tree)
  })

  it('createGroup calls POST /api/groups with body', async () => {
    const payload = { name: 'News', color: '#ff0000' }
    const created = { id: 'g2', ...payload, sensors: [] }
    mockFetch.mockResolvedValueOnce(jsonResponse(created))

    const result = await api.createGroup(payload)

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/groups')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual(payload)
    expect(result).toEqual(created)
  })

  it('updateGroup calls PUT /api/groups/:id with body', async () => {
    const payload = { name: 'Updated' }
    const updated = { id: 'g1', name: 'Updated', sensors: [] }
    mockFetch.mockResolvedValueOnce(jsonResponse(updated))

    const result = await api.updateGroup('g1', payload)

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/groups/g1')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual(payload)
    expect(result).toEqual(updated)
  })

  it('deleteGroup calls DELETE /api/groups/:id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

    const result = await api.deleteGroup('g1')

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/groups/g1')
    expect(opts.method).toBe('DELETE')
    expect(result).toEqual({ ok: true })
  })

  it('setGroupMembers calls PUT /api/groups/:id/members', async () => {
    const sensors = ['github_trending', 'hackernews']
    const updated = { id: 'g1', sensors }
    mockFetch.mockResolvedValueOnce(jsonResponse(updated))

    const result = await api.setGroupMembers('g1', sensors)

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/groups/g1/members')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ sensors })
    expect(result).toEqual(updated)
  })

  it('addGroupMember calls POST /api/groups/:id/members', async () => {
    const updated = { id: 'g1', sensors: ['hackernews'] }
    mockFetch.mockResolvedValueOnce(jsonResponse(updated))

    const result = await api.addGroupMember('g1', 'hackernews')

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/groups/g1/members')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ sensor_key: 'hackernews' })
    expect(result).toEqual(updated)
  })

  it('removeGroupMember calls DELETE /api/groups/:id/members/:key', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

    const result = await api.removeGroupMember('g1', 'hackernews')

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/groups/g1/members/hackernews')
    expect(opts.method).toBe('DELETE')
    expect(result).toEqual({ ok: true })
  })

  it('reorderGroups calls PUT /api/groups/reorder', async () => {
    const orderedIds = ['g2', 'g1', 'g3']
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

    const result = await api.reorderGroups(orderedIds)

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/groups/reorder')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ ordered_ids: orderedIds })
    expect(result).toEqual({ ok: true })
  })
})
