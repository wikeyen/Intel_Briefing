// ABOUTME: Unit tests for the Markdown renderer in renderer/markdown.ts.
// ABOUTME: Covers all 7 sections, empty data, stale warning, and optional field handling.
import { describe, it, expect } from 'vitest'
import type { IntelItem, IntelReport } from '../models'
import { createReport, emptyItemsMap } from '../models'
import { renderMarkdown } from './markdown'

function makeReport(overrides: Partial<IntelReport> = {}): IntelReport {
  return createReport({
    date: '2026-01-01',
    fetched_at: '2026-01-01T07:00:00Z',
    ...overrides,
  })
}

function makeItem(id = '1', overrides: Partial<IntelItem> = {}): IntelItem {
  return { id, source: 'hn', title: 'Test Item', url: 'https://example.com', ...overrides }
}

describe('renderMarkdown', () => {
  it('header contains date', () => {
    const report = makeReport({ date: '2026-02-17' })
    const md = renderMarkdown(report)
    expect(md).toContain('2026-02-17')
  })

  it('all 7 section headers present', () => {
    const report = makeReport()
    const md = renderMarkdown(report)
    for (const header of ['Tech Trends', 'Research', 'Insights', 'Products',
      'Capital Flow', 'Community', 'Social']) {
      expect(md).toContain(header)
    }
  })

  it('empty section shows placeholder', () => {
    const report = makeReport()
    const md = renderMarkdown(report)
    expect(md).toContain('_No data available for this section._')
  })

  it('item title and url rendered', () => {
    const item = makeItem('1', { title: 'My Article', url: 'https://example.com/article' })
    const items = { ...emptyItemsMap(), tech_trends: [item] }
    const report = makeReport({ items })
    const md = renderMarkdown(report)
    expect(md).toContain('My Article')
    expect(md).toContain('https://example.com/article')
  })

  it('stale report shows warning', () => {
    const report = makeReport({ stale: true })
    const md = renderMarkdown(report)
    expect(md.toLowerCase()).toContain('stale')
  })

  it('footer contains sources', () => {
    const report = makeReport({ sources_ok: ['hn', 'arxiv'], sources_failed: ['github'] })
    const md = renderMarkdown(report)
    expect(md).toContain('hn')
    expect(md).toContain('arxiv')
    expect(md).toContain('github')
  })

  it('item with heat shows heat', () => {
    const item = makeItem('1', { heat: '1234 pts' })
    const items = { ...emptyItemsMap(), tech_trends: [item] }
    const report = makeReport({ items })
    const md = renderMarkdown(report)
    expect(md).toContain('1234 pts')
  })

  it('item with authors shows authors', () => {
    const item = makeItem('1', { authors: ['Alice', 'Bob'] })
    const items = { ...emptyItemsMap(), research: [item] }
    const report = makeReport({ items })
    const md = renderMarkdown(report)
    expect(md).toContain('Alice')
    expect(md).toContain('Bob')
  })

  it('long abstract is truncated', () => {
    const longAbstract = 'x'.repeat(500)
    const item = makeItem('1', { abstract: longAbstract })
    const items = { ...emptyItemsMap(), research: [item] }
    const report = makeReport({ items })
    const md = renderMarkdown(report)
    expect(md).toContain('…')
    expect(md).not.toContain('x'.repeat(401))
  })

  it('item with missing optional fields renders without error', () => {
    const item = makeItem()
    const items = { ...emptyItemsMap(), community: [item] }
    const report = makeReport({ items })
    const md = renderMarkdown(report)
    expect(md).toContain('Test Item')
  })

  it('pure function produces same output on repeated calls', () => {
    const report = makeReport()
    const md1 = renderMarkdown(report)
    const md2 = renderMarkdown(report)
    expect(md1).toBe(md2)
  })
})
