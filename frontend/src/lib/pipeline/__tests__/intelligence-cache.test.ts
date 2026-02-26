// ABOUTME: Tests for intelligence cache — verifies merge-on-write preserves non-null fields.
// ABOUTME: Ensures transient LLM failures don't wipe out previously cached analysis results.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeIntelligence, readIntelligence } from '../intelligence-cache'
import type { IntelligenceReport } from '../intelligence'

// Mock the db module with an in-memory store
vi.mock('../../db', () => {
  let store: Record<string, unknown> = {}
  return {
    kvSet: vi.fn(async (key: string, value: unknown) => { store[key] = value }),
    kvGet: vi.fn(async (key: string) => store[key] ?? null),
    __resetStore: () => { store = {} },
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __resetStore } = await import('../../db') as any

const fullReport: IntelligenceReport = {
  trend: { topics: [], tags: [], summary: 'trends', generated_at: '2026-01-01' },
  topics: { topics: [], tags: [], summary: 'topics', generated_at: '2026-01-01' },
  accounts: { accounts: [], tags: [], summary: 'accounts', generated_at: '2026-01-01' },
}

describe('writeIntelligence merge behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetStore()
  })

  it('writes full report when cache is empty', async () => {
    await writeIntelligence(fullReport)
    const cached = await readIntelligence()
    expect(cached).toEqual(fullReport)
  })

  it('preserves cached accounts when new analysis returns null', async () => {
    // First write: full report
    await writeIntelligence(fullReport)

    // Second write: accounts failed (null)
    await writeIntelligence({
      trend: { topics: [], tags: [], summary: 'new trends', generated_at: '2026-01-02' },
      topics: { topics: [], tags: [], summary: 'new topics', generated_at: '2026-01-02' },
      accounts: null,
    })

    const cached = await readIntelligence()
    expect(cached!.trend!.summary).toBe('new trends')
    expect(cached!.topics!.summary).toBe('new topics')
    // accounts preserved from first write
    expect(cached!.accounts!.summary).toBe('accounts')
  })

  it('overwrites cached field when new value is non-null', async () => {
    await writeIntelligence(fullReport)

    const updated: IntelligenceReport = {
      trend: null,
      topics: null,
      accounts: { accounts: [], tags: [], summary: 'new accounts', generated_at: '2026-01-02' },
    }
    await writeIntelligence(updated)

    const cached = await readIntelligence()
    // trend and topics preserved
    expect(cached!.trend!.summary).toBe('trends')
    expect(cached!.topics!.summary).toBe('topics')
    // accounts updated
    expect(cached!.accounts!.summary).toBe('new accounts')
  })
})
