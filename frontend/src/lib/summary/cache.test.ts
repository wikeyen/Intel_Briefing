// ABOUTME: Tests for the summary cache — read/write BriefingSummary to SQLite KV.
// ABOUTME: Uses in-memory SQLite for isolation.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb } from '../db'
import { writeSummary, readSummary, writeSummaryProgress, readSummaryProgress } from './cache'
import type { BriefingSummary, SummaryProgress } from '../models'

const SAMPLE: BriefingSummary = {
  generated_at: '2026-02-19T10:00:00Z',
  report_fetched_at: '2026-02-19T09:00:00Z',
  sections: [
    {
      sensor_name: 'hacker_news',
      label: 'Hacker News',
      source_url: 'https://news.ycombinator.com',
      summary: 'Top stories about AI.',
      item_count: 10,
      items: [
        { title: 'AI breakthrough', url: 'https://example.com/1', brief: 'Major advance in AI.' },
      ],
    },
  ],
  overall: {
    quick_scan: [
      { text: 'AI breakthroughs dominated today.', source: 'hacker_news', refs: [] },
    ],
    executive_summary: '',
    sections: [
      {
        title: 'Tech Highlights',
        entries: [
          { text: 'Tech world focused on AI breakthroughs today.', source: 'hacker_news', refs: [] },
        ],
      },
    ],
    sentiment: { overall_mood: 'neutral', mood_summary: '', controversies: [], opinion_shifts: [], risk_flags: [] },
  },
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
    const updatedOverall = {
      quick_scan: [{ text: 'Updated scan.', source: 'arxiv', refs: [] }],
      executive_summary: '',
      sections: [{ title: 'Updated', entries: [{ text: 'Updated briefing.', source: 'arxiv', refs: [] }] }],
      sentiment: { overall_mood: 'neutral' as const, mood_summary: '', controversies: [], opinion_shifts: [], risk_flags: [] },
    }
    const updated = { ...SAMPLE, overall: updatedOverall }
    await writeSummary(updated)
    const result = await readSummary()
    expect(result!.overall).toEqual(updatedOverall)
  })
})

const SAMPLE_PROGRESS: SummaryProgress = {
  running: true,
  started_at: '2026-02-19T10:00:00Z',
  completed_at: null,
  sensors: [
    { sensor_name: 'hacker_news', label: 'Hacker News', state: 'ok', error: null },
    { sensor_name: 'arxiv', label: 'ArXiv AI', state: 'running', error: null },
  ],
}

describe('summary progress cache', () => {
  beforeAll(async () => {
    await initDb(':memory:')
  })

  it('returns null when no progress cached', async () => {
    expect(await readSummaryProgress()).toBeNull()
  })

  it('writes and reads summary progress', async () => {
    await writeSummaryProgress(SAMPLE_PROGRESS)
    const result = await readSummaryProgress()
    expect(result).toEqual(SAMPLE_PROGRESS)
  })

  it('overwrites previous progress', async () => {
    const updated: SummaryProgress = {
      ...SAMPLE_PROGRESS,
      running: false,
      completed_at: '2026-02-19T10:05:00Z',
    }
    await writeSummaryProgress(updated)
    const result = await readSummaryProgress()
    expect(result!.running).toBe(false)
    expect(result!.completed_at).toBe('2026-02-19T10:05:00Z')
  })
})
