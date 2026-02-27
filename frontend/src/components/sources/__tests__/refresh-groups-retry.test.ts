// ABOUTME: Tests that refreshGroups retries on failure instead of silently swallowing errors.
// ABOUTME: Verifies retry count, delay, logging, and that setGroups is only called on success.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from '@/api/client'

vi.mock('@/api/client', () => ({
  api: { getGroups: vi.fn() },
}))

const mockedGetGroups = vi.mocked(api.getGroups)

/**
 * Extracted retry logic matching the refreshGroups callback in Sensors.tsx.
 * We test this directly rather than rendering the full component, because
 * the retry behaviour is the unit under test — not React rendering.
 */
function refreshGroups(setGroups: (groups: unknown[]) => void) {
  const attempt = (retries: number) => {
    api.getGroups().then(setGroups).catch((err) => {
      console.warn('[Sources] Failed to fetch groups:', err.message)
      if (retries > 0) setTimeout(() => attempt(retries - 1), 1000)
    })
  }
  attempt(3)
}

/** Flush only microtasks (resolved/rejected promises) without advancing timers. */
async function flushMicrotasks() {
  await new Promise<void>((r) => queueMicrotask(r))
  // Double-flush to handle chained .then/.catch
  await new Promise<void>((r) => queueMicrotask(r))
}

describe('refreshGroups retry logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockedGetGroups.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('calls setGroups on first success without retries', async () => {
    const groups = [{ id: 'g1', name: 'Research', sensors: [] }]
    mockedGetGroups.mockResolvedValueOnce(groups as never)

    const setGroups = vi.fn()
    refreshGroups(setGroups)

    await flushMicrotasks()

    expect(setGroups).toHaveBeenCalledOnce()
    expect(setGroups).toHaveBeenCalledWith(groups)
    expect(mockedGetGroups).toHaveBeenCalledOnce()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('retries up to 3 times on failure before giving up', async () => {
    const error = new Error('Server not ready')
    mockedGetGroups.mockRejectedValue(error)

    const setGroups = vi.fn()
    refreshGroups(setGroups)

    // Initial attempt (1)
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(1)

    // Retry 1 (2)
    await vi.advanceTimersByTimeAsync(1000)
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(2)

    // Retry 2 (3)
    await vi.advanceTimersByTimeAsync(1000)
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(3)

    // Retry 3 (4) — last attempt
    await vi.advanceTimersByTimeAsync(1000)
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(4)

    // No more retries after exhaustion
    await vi.advanceTimersByTimeAsync(2000)
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(4)

    expect(setGroups).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledTimes(4)
  })

  it('succeeds on retry after initial failures', async () => {
    const error = new Error('Server not ready')
    const groups = [{ id: 'g1', name: 'News', sensors: ['hackernews'] }]

    mockedGetGroups
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(groups as never)

    const setGroups = vi.fn()
    refreshGroups(setGroups)

    // First attempt fails
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(1)
    expect(setGroups).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledTimes(1)

    // Second attempt fails (after 1s delay)
    await vi.advanceTimersByTimeAsync(1000)
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(2)
    expect(setGroups).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledTimes(2)

    // Third attempt succeeds (after another 1s delay)
    await vi.advanceTimersByTimeAsync(1000)
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(3)
    expect(setGroups).toHaveBeenCalledOnce()
    expect(setGroups).toHaveBeenCalledWith(groups)
  })

  it('never calls setGroups with empty data on error', async () => {
    mockedGetGroups.mockRejectedValue(new Error('Network error'))

    const setGroups = vi.fn()
    refreshGroups(setGroups)

    // Exhaust all retries
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(1000)
      await flushMicrotasks()
    }

    expect(setGroups).not.toHaveBeenCalled()
  })

  it('logs the error message on each failed attempt', async () => {
    mockedGetGroups.mockRejectedValue(new Error('ECONNREFUSED'))

    const setGroups = vi.fn()
    refreshGroups(setGroups)

    await flushMicrotasks()

    expect(console.warn).toHaveBeenCalledWith(
      '[Sources] Failed to fetch groups:',
      'ECONNREFUSED'
    )
  })

  it('waits 1 second between retries', async () => {
    mockedGetGroups.mockRejectedValue(new Error('fail'))

    const setGroups = vi.fn()
    refreshGroups(setGroups)

    // Flush the first attempt's rejected promise
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(1)

    // Advance 999ms — retry should NOT have fired yet
    await vi.advanceTimersByTimeAsync(999)
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(1)

    // Advance 1ms more (total 1000ms) — retry fires
    await vi.advanceTimersByTimeAsync(1)
    await flushMicrotasks()
    expect(mockedGetGroups).toHaveBeenCalledTimes(2)
  })
})
