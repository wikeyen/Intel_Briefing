// ABOUTME: Tests for the summary cache — BriefingSummary, SummaryProgress, and per-sensor summary caching.
// ABOUTME: Uses in-memory SQLite for isolation.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb } from '../db'
import {
  writeSummary, readSummary, invalidateAllSummaries,
  writeSummaryProgress, readSummaryProgress,
  writeSensorSummary, readSensorSummary,
  invalidateSensorSummary, invalidateAllSensorSummaries,
} from './cache'
import type { BriefingSummary, SummaryProgress, SensorSummary } from '../models'

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
    executive_summary: 'AI breakthroughs dominated today.',
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
      executive_summary: 'Updated analysis.',
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

const SAMPLE_SENSOR_SUMMARY: SensorSummary = {
  sensor_name: 'hacker_news',
  label: 'Hacker News',
  source_url: 'https://news.ycombinator.com',
  summary: 'Top stories about AI.',
  item_count: 5,
  items: [{ title: 'AI breakthrough', url: 'https://example.com/1', brief: 'Notable' }],
}

describe('per-sensor summary cache', () => {
  beforeAll(async () => {
    await initDb(':memory:')
  })

  it('returns null when no sensor summary cached', async () => {
    expect(await readSensorSummary('nonexistent')).toBeNull()
  })

  it('writes and reads a sensor summary with content hash', async () => {
    await writeSensorSummary('hacker_news', 'abc123', SAMPLE_SENSOR_SUMMARY)
    const result = await readSensorSummary('hacker_news')
    expect(result).not.toBeNull()
    expect(result!.content_hash).toBe('abc123')
    expect(result!.sensor_summary).toEqual(SAMPLE_SENSOR_SUMMARY)
    expect(result!.generated_at).toBeTruthy()
  })

  it('overwrites previous sensor summary', async () => {
    const updated = { ...SAMPLE_SENSOR_SUMMARY, summary: 'Updated summary' }
    await writeSensorSummary('hacker_news', 'def456', updated)
    const result = await readSensorSummary('hacker_news')
    expect(result!.content_hash).toBe('def456')
    expect(result!.sensor_summary.summary).toBe('Updated summary')
  })

  it('stores sensors independently', async () => {
    const arxivSummary = { ...SAMPLE_SENSOR_SUMMARY, sensor_name: 'arxiv', label: 'ArXiv AI' }
    await writeSensorSummary('arxiv', 'hash789', arxivSummary)

    const hn = await readSensorSummary('hacker_news')
    const ax = await readSensorSummary('arxiv')
    expect(hn!.content_hash).toBe('def456') // from previous test
    expect(ax!.content_hash).toBe('hash789')
  })

  it('invalidates a single sensor summary', async () => {
    await invalidateSensorSummary('hacker_news')
    expect(await readSensorSummary('hacker_news')).toBeNull()
    // arxiv should still exist
    expect(await readSensorSummary('arxiv')).not.toBeNull()
  })

  it('invalidates all sensor summaries', async () => {
    // Re-add hacker_news
    await writeSensorSummary('hacker_news', 'new_hash', SAMPLE_SENSOR_SUMMARY)
    expect(await readSensorSummary('hacker_news')).not.toBeNull()
    expect(await readSensorSummary('arxiv')).not.toBeNull()

    await invalidateAllSensorSummaries()
    expect(await readSensorSummary('hacker_news')).toBeNull()
    expect(await readSensorSummary('arxiv')).toBeNull()
  })
})

describe('per-language summary cache', () => {
  beforeAll(async () => {
    await initDb(':memory:')
  })

  const EN_SUMMARY = { ...SAMPLE, overall: { ...SAMPLE.overall as object, executive_summary: 'English summary.' } } as BriefingSummary
  const ZH_SUMMARY = { ...SAMPLE, overall: { ...SAMPLE.overall as object, executive_summary: '中文摘要。' } } as BriefingSummary

  it('writes and reads summaries per language', async () => {
    await writeSummary(EN_SUMMARY, 'en')
    await writeSummary(ZH_SUMMARY, 'zh')

    const en = await readSummary('en')
    const zh = await readSummary('zh')

    expect((en!.overall as { executive_summary: string }).executive_summary).toBe('English summary.')
    expect((zh!.overall as { executive_summary: string }).executive_summary).toBe('中文摘要。')
  })

  it('language-specific reads do not cross-contaminate', async () => {
    const en = await readSummary('en')
    expect((en!.overall as { executive_summary: string }).executive_summary).not.toContain('中文')
  })

  it('falls back to legacy key when language-specific key missing', async () => {
    // Write a legacy (no language) summary
    await writeSummary(SAMPLE)
    // Read with a language that has no specific entry
    // Since 'en' was already written, let's invalidate first
    await invalidateAllSummaries()
    await writeSummary(SAMPLE) // legacy key (no language param)
    const result = await readSummary('en')
    // Should fall back to the legacy entry
    expect(result).not.toBeNull()
  })

  it('invalidateAllSummaries clears all language variants', async () => {
    await writeSummary(EN_SUMMARY, 'en')
    await writeSummary(ZH_SUMMARY, 'zh')
    expect(await readSummary('en')).not.toBeNull()
    expect(await readSummary('zh')).not.toBeNull()

    await invalidateAllSummaries()
    // With no fallback, both should be null
    expect(await readSummary('en')).toBeNull()
    expect(await readSummary('zh')).toBeNull()
  })

  it('writes sensor summary with language key', async () => {
    await writeSensorSummary('hacker_news', 'hash_en', SAMPLE_SENSOR_SUMMARY, 'en')
    const enResult = await readSensorSummary('hacker_news', 'en')
    expect(enResult).not.toBeNull()
    expect(enResult!.content_hash).toBe('hash_en')
  })

  it('invalidateSensorSummary clears all language variants', async () => {
    await writeSensorSummary('hacker_news', 'hash_en', SAMPLE_SENSOR_SUMMARY, 'en')
    await writeSensorSummary('hacker_news', 'hash_zh', SAMPLE_SENSOR_SUMMARY, 'zh')

    await invalidateSensorSummary('hacker_news')
    expect(await readSensorSummary('hacker_news', 'en')).toBeNull()
    expect(await readSensorSummary('hacker_news', 'zh')).toBeNull()
  })
})
