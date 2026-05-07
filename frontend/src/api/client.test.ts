// ABOUTME: Tests for the typed API client URL construction under basePath.
// ABOUTME: Locks in the contract that raw fetch calls include the deployment basePath exactly once.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('api client basePath construction', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchSpy)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('prepends basePath exactly once when NEXT_PUBLIC_BASE_PATH is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/intel-briefing')
    const { api } = await import('./client')

    await api.health()

    const calledUrl = fetchSpy.mock.calls[0][0]
    expect(calledUrl).toBe('/intel-briefing/api/health')
    expect(calledUrl).not.toMatch(/\/intel-briefing\/intel-briefing/)
  })

  it('omits the prefix when NEXT_PUBLIC_BASE_PATH is empty (root deployment)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '')
    const { api } = await import('./client')

    await api.health()

    expect(fetchSpy.mock.calls[0][0]).toBe('/api/health')
  })

  it('applies basePath to nested resource paths without doubling', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/intel-briefing')
    const { api } = await import('./client')

    await api.getPipelineStatus()
    await api.getGroups()

    const urls = fetchSpy.mock.calls.map(c => c[0] as string)
    expect(urls).toContain('/intel-briefing/api/fetch/status')
    expect(urls).toContain('/intel-briefing/api/groups')
    for (const url of urls) {
      expect(url).not.toMatch(/\/intel-briefing\/intel-briefing/)
    }
  })
})
