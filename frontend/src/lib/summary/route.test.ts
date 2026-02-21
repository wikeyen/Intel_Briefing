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
    {
      sensor_name: 'hacker_news',
      label: 'Hacker News',
      source_url: 'https://news.ycombinator.com',
      summary: 'AI news dominated.',
      item_count: 10,
      items: [
        { title: 'AI story', url: 'https://example.com/1', brief: 'AI is big.' },
      ],
    },
  ],
  overall: {
    quick_scan: [
      { text: 'AI continues to dominate tech news.', source: 'hacker_news', refs: [] },
    ],
    executive_summary: '',
    sections: [
      {
        title: 'Key Developments',
        entries: [
          { text: 'AI continues to dominate tech news.', source: 'hacker_news', refs: [] },
        ],
      },
    ],
    sentiment: {
      overall_mood: 'neutral',
      mood_summary: '',
      controversies: [],
      opinion_shifts: [],
      risk_flags: [],
    },
  },
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
    expect(result!.overall.quick_scan[0].text).toBe('AI continues to dominate tech news.')
  })

})
