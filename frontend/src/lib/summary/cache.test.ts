// ABOUTME: Tests for the summary cache — read/write BriefingSummary to SQLite KV.
// ABOUTME: Uses in-memory SQLite for isolation.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb } from '../db'
import { writeSummary, readSummary } from './cache'
import type { BriefingSummary } from '../models'

const SAMPLE: BriefingSummary = {
  generated_at: '2026-02-19T10:00:00Z',
  report_fetched_at: '2026-02-19T09:00:00Z',
  sections: [
    { sensor_name: 'hacker_news', label: 'Hacker News', summary: 'Top stories about AI.', item_count: 10 },
  ],
  overall: 'Tech world focused on AI breakthroughs today.',
}

describe('summary cache', () => {
  beforeAll(async () => {
    await initDb(':memory:')
  })

  it('returns null when no summary cached', async () => {
    expect(await readSummary()).toBeNull()
  })

  it('writes and reads a summary', async () => {
    await writeSummary(SAMPLE)
    const result = await readSummary()
    expect(result).toEqual(SAMPLE)
  })

  it('overwrites previous summary', async () => {
    const updated = { ...SAMPLE, overall: 'Updated briefing.' }
    await writeSummary(updated)
    const result = await readSummary()
    expect(result!.overall).toBe('Updated briefing.')
  })
})
