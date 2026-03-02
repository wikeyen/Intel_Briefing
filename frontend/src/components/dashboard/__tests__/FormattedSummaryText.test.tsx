// ABOUTME: Tests for FormattedSummaryText — verifies paragraph splitting, bullet list detection, and citation pass-through.
// ABOUTME: Covers plain text, multi-paragraph, bullet blocks, mixed content, empty input, and citation resolution.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { FormattedSummaryText } from '../FormattedSummaryText'
import type { BriefingSource } from '@/api/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSource(overrides: Partial<BriefingSource> & { id: number }): BriefingSource {
  return {
    title: `Source ${overrides.id}`,
    url: `https://example.com/${overrides.id}`,
    sensor: 'test_sensor',
    ...overrides,
  }
}

const SOURCES: BriefingSource[] = [
  makeSource({ id: 1, title: 'Bloomberg', url: 'https://bloomberg.com/1' }),
  makeSource({ id: 2, title: 'Reuters', url: 'https://reuters.com/2' }),
  makeSource({ id: 3, title: 'ArXiv Paper', url: 'https://arxiv.org/3' }),
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FormattedSummaryText', () => {
  it('renders plain text as a single paragraph', () => {
    const { container } = render(
      createElement(FormattedSummaryText, {
        text: 'A simple sentence with no formatting.',
        sources: [],
      }),
    )
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].textContent).toBe('A simple sentence with no formatting.')
  })

  it('splits on \\n\\n into multiple paragraphs', () => {
    const { container } = render(
      createElement(FormattedSummaryText, {
        text: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
        sources: [],
      }),
    )
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[0].textContent).toBe('First paragraph.')
    expect(paragraphs[1].textContent).toBe('Second paragraph.')
    expect(paragraphs[2].textContent).toBe('Third paragraph.')
  })

  it('renders bullet items as ul/li when all lines start with "- "', () => {
    const { container } = render(
      createElement(FormattedSummaryText, {
        text: '- First bullet\n- Second bullet\n- Third bullet',
        sources: [],
      }),
    )
    const lists = container.querySelectorAll('ul')
    expect(lists).toHaveLength(1)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toBe('First bullet')
    expect(items[1].textContent).toBe('Second bullet')
    expect(items[2].textContent).toBe('Third bullet')
  })

  it('resolves citation markers through CitationText', () => {
    const { container } = render(
      createElement(FormattedSummaryText, {
        text: 'Markets rallied [1] after announcement [2].',
        sources: SOURCES,
      }),
    )
    const supElements = container.querySelectorAll('sup')
    expect(supElements).toHaveLength(2)
    const links = container.querySelectorAll('sup a')
    expect(links).toHaveLength(2)
    expect((links[0] as HTMLAnchorElement).href).toBe('https://bloomberg.com/1')
    expect((links[1] as HTMLAnchorElement).href).toBe('https://reuters.com/2')
  })

  it('resolves citations within bullet items', () => {
    const { container } = render(
      createElement(FormattedSummaryText, {
        text: '- OpenAI announced GPT-5 [1]\n- Google published results [3]',
        sources: SOURCES,
      }),
    )
    const links = container.querySelectorAll('sup a')
    expect(links).toHaveLength(2)
    expect((links[0] as HTMLAnchorElement).href).toBe('https://bloomberg.com/1')
    expect((links[1] as HTMLAnchorElement).href).toBe('https://arxiv.org/3')
  })

  it('returns null for empty text', () => {
    const { container } = render(
      createElement(FormattedSummaryText, { text: '', sources: [] }),
    )
    expect(container.innerHTML).toBe('')
  })

  it('returns null for whitespace-only text', () => {
    const { container } = render(
      createElement(FormattedSummaryText, { text: '   \n\n   ', sources: [] }),
    )
    expect(container.innerHTML).toBe('')
  })

  it('handles mixed paragraphs and bullet blocks', () => {
    const text = [
      'Opening paragraph.',
      '',
      'Key highlights:',
      '',
      '- Bullet one',
      '- Bullet two',
      '',
      'Closing paragraph.',
    ].join('\n')

    const { container } = render(
      createElement(FormattedSummaryText, { text, sources: [] }),
    )

    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[0].textContent).toBe('Opening paragraph.')
    expect(paragraphs[1].textContent).toBe('Key highlights:')
    expect(paragraphs[2].textContent).toBe('Closing paragraph.')

    const lists = container.querySelectorAll('ul')
    expect(lists).toHaveLength(1)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
  })

  it('handles text with no newlines as a single paragraph', () => {
    const { container } = render(
      createElement(FormattedSummaryText, {
        text: 'Just one continuous line of text here.',
        sources: [],
      }),
    )
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(1)
    expect(container.querySelectorAll('ul')).toHaveLength(0)
  })

  it('removes bottom margin from the last block', () => {
    const { container } = render(
      createElement(FormattedSummaryText, {
        text: 'First.\n\nSecond.',
        sources: [],
      }),
    )
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(2)
    // Last paragraph should have margin: 0
    expect(paragraphs[1].style.margin).toBe('0px')
    // First paragraph should have bottom margin
    expect(paragraphs[0].style.margin).toBe('0px 0px 0.75rem')
  })

  it('does not treat lines with partial bullet syntax as bullets', () => {
    // Block where only some lines start with "- " should be a paragraph
    const text = 'A line\n- A bullet\nAnother line'
    const { container } = render(
      createElement(FormattedSummaryText, { text, sources: [] }),
    )
    // The whole block should render as a single paragraph, not a list
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(1)
    expect(container.querySelectorAll('ul')).toHaveLength(0)
  })
})
