// ABOUTME: Tests for the apiFetch function's cache-busting fetch options.
// ABOUTME: Verifies that all API requests include cache: 'no-store' to bypass browser caching.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from './client'

const mockFetch = vi.fn()
global.fetch = mockFetch

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('apiFetch cache-busting', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('passes cache: no-store on GET requests', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'ok', last_fetch: null }))

    await api.health()

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.cache).toBe('no-store')
  })

  it('passes cache: no-store on POST requests', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'accepted', mode: 'fetch_summarize' }))

    await api.triggerFetch()

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.cache).toBe('no-store')
  })

  it('passes cache: no-store on PUT requests', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'g1', name: 'Updated', sensors: [] }))

    await api.updateGroup('g1', { name: 'Updated' })

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.cache).toBe('no-store')
  })

  it('passes cache: no-store on DELETE requests', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

    await api.deleteGroup('g1')

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.cache).toBe('no-store')
  })

  it('includes Content-Type header alongside cache option', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'ok', last_fetch: null }))

    await api.health()

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.cache).toBe('no-store')
    expect(opts.headers['Content-Type']).toBe('application/json')
  })
})
