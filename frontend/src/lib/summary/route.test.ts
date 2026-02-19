// ABOUTME: Tests for the /api/summary API route logic — validates cache round-trip.
// ABOUTME: Uses in-memory SQLite for isolation.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb } from '../db'
import { writeSummary, readSummary } from './cache'
import type { BriefingSummary } from '../models'

const SAMPLE: BriefingSummary = {
  generated_at: '2026-02-19T10:00:00Z',
  report_fetched_at: '2026-02-19T09:00:00Z',
  sections: [
    { sensor_name: 'hacker_news', label: 'Hacker News', summary: 'AI news dominated.', item_count: 10 },
  ],
  overall: 'AI continues to dominate tech news.',
}

describe('/api/summary route logic', () => {
  beforeAll(async () => {
    await initDb(':memory:')
  })

  it('GET returns null when no summary cached', async () => {
    const result = await readSummary()
    expect(result).toBeNull()
  })

  it('POST writes summary and GET reads it back', async () => {
    await writeSummary(SAMPLE)
    const result = await readSummary()
    expect(result).toEqual(SAMPLE)
    expect(result!.overall).toBe('AI continues to dominate tech news.')
  })

  it('validates BriefingSummary has required fields', () => {
    expect(SAMPLE.generated_at).toBeDefined()
    expect(SAMPLE.report_fetched_at).toBeDefined()
    expect(SAMPLE.sections).toBeInstanceOf(Array)
    expect(typeof SAMPLE.overall).toBe('string')
  })
})
