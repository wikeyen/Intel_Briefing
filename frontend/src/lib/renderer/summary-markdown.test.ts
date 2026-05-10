// ABOUTME: Unit tests for the BriefingSummary Markdown renderer.
// ABOUTME: Ensures generated summaries are ready to forward through external callers.
import { describe, expect, it } from 'vitest'
import type { BriefingSummary } from '../models'
import { renderSummaryMarkdown } from './summary-markdown'

const SAMPLE: BriefingSummary = {
  generated_at: '2026-05-09T12:00:00Z',
  report_fetched_at: '2026-05-09T11:00:00Z',
  sections: [],
  overall: {
    quick_scan: [
      {
        text: '快速扫描保留中文。',
        source: 'hacker_news',
        refs: [{ title: 'HN item', url: 'https://example.com/hn' }],
      },
    ],
    executive_summary: '今日核心摘要。\n\n- 一个重点。',
    sections: [
      {
        title: '关键动态',
        entries: [
          {
            text: 'MiniMax 负责生成简报。',
            source: 'summary',
            refs: [{ title: 'Source A', url: 'https://example.com/a' }],
          },
        ],
      },
    ],
    sentiment: {
      overall_mood: 'mixed',
      mood_summary: '市场信号分化。',
      controversies: [],
      opinion_shifts: [],
      risk_flags: [{ topic: 'AI', analysis: '估值风险升温。', refs: [] }],
    },
    sources: [
      { id: 1, title: 'Source A', url: 'https://example.com/a', sensor: 'hacker_news' },
    ],
  },
}

describe('renderSummaryMarkdown', () => {
  it('renders a forwardable markdown summary', () => {
    const md = renderSummaryMarkdown(SAMPLE)

    expect(md).toContain('# Info Aggregation Summary')
    expect(md).toContain('2026-05-09T12:00:00Z')
    expect(md).toContain('## Executive Summary')
    expect(md).toContain('今日核心摘要')
    expect(md).toContain('## Quick Scan')
    expect(md).toContain('快速扫描保留中文')
    expect(md).toContain('## 关键动态')
    expect(md).toContain('[Source A](https://example.com/a)')
    expect(md).toContain('## Sentiment')
    expect(md).toContain('Risk flags')
    expect(md).toContain('## Sources')
  })

  it('omits empty optional blocks without throwing', () => {
    const md = renderSummaryMarkdown({
      ...SAMPLE,
      overall: {
        executive_summary: 'Only summary.',
        sections: [],
        sentiment: {
          overall_mood: 'neutral',
          mood_summary: '',
          controversies: [],
          opinion_shifts: [],
          risk_flags: [],
        },
      },
    })

    expect(md).toContain('Only summary.')
    expect(md).not.toContain('## Quick Scan')
    expect(md).not.toContain('## Sources')
  })
})
