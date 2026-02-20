// ABOUTME: End-to-end style tests that verify integration between modules.
// ABOUTME: Tests cross-cutting concerns like report creation, rendering with items, and config flow.
import { describe, it, expect } from 'vitest'
import { createReport, emptyItemsMap, type IntelItem } from './models'
import { renderMarkdown } from './renderer/markdown'
import { dedupItems, dedupAcrossSections } from './pipeline/dedup'
import { isStale } from './pipeline/cache'

describe('end-to-end: report creation and rendering', () => {
  it('creates a report with items and renders to markdown', () => {
    const items: IntelItem[] = [
      { id: 'hn-1', source: 'hacker_news', title: 'Breaking: AI News', url: 'https://example.com/1', heat: '500 pts' },
      { id: 'arxiv-1', source: 'arxiv', title: 'Attention Is Still All You Need', url: 'https://arxiv.org/abs/1234', abstract: 'We study transformers.', authors: ['Alice'] },
    ]
    const report = createReport({
      date: '2026-02-18',
      fetched_at: '2026-02-18T07:00:00Z',
      sources_ok: ['hacker_news', 'arxiv'],
      items: { ...emptyItemsMap(), tech_trends: [items[0]], research: [items[1]] },
    })
    const md = renderMarkdown(report)
    expect(md).toContain('2026-02-18')
    expect(md).toContain('Breaking: AI News')
    expect(md).toContain('500 pts')
    expect(md).toContain('Attention Is Still All You Need')
    expect(md).toContain('Alice')
    expect(md).toContain('arxiv')
    expect(md).toContain('hacker_news')
  })

  it('dedup + render pipeline produces valid output', () => {
    const items: IntelItem[] = [
      { id: '1', source: 'hn', title: 'Same Title', url: 'u1' },
      { id: '2', source: 'hn', title: 'same title', url: 'u2' },
      { id: '3', source: 'hn', title: 'Different', url: 'u3' },
    ]
    const deduped = dedupItems(items)
    expect(deduped).toHaveLength(2)

    const report = createReport({
      date: '2026-01-01',
      fetched_at: '2026-01-01T07:00:00Z',
      items: { ...emptyItemsMap(), tech_trends: deduped },
    })
    const md = renderMarkdown(report)
    expect(md).toContain('Same Title')
    expect(md).toContain('Different')
  })

  it('social section dedup removes overlap between accounts and topics', () => {
    const sections = {
      social: [
        { id: 'x-accounts-2026-02-19-0', source: 'x', title: 'Post', url: 'https://x.com/post/1' } as IntelItem,
        { id: 'x-topics-2026-02-19-0', source: 'x', title: 'Same Post', url: 'https://x.com/post/1' } as IntelItem,
        { id: 'x-topics-2026-02-19-1', source: 'x', title: 'Unique Post', url: 'https://x.com/post/2' } as IntelItem,
      ],
    }
    const result = dedupAcrossSections(sections)
    expect(result.social).toHaveLength(2)
    expect(result.social[0].id).toBe('x-accounts-2026-02-19-0')
    expect(result.social[1].id).toBe('x-topics-2026-02-19-1')
  })

  it('isStale correctly detects fresh vs old reports', () => {
    const fresh = createReport({
      date: '2026-01-01',
      fetched_at: new Date().toISOString(),
    })
    expect(isStale(fresh, 6)).toBe(false)

    const old = createReport({
      date: '2025-01-01',
      fetched_at: '2025-01-01T07:00:00Z',
    })
    expect(isStale(old, 6)).toBe(true)
  })

})
