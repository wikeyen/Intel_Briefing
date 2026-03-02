// ABOUTME: Tests for CitationText citation resolution component.
// ABOUTME: Verifies [N] markers are resolved to links, unresolvable markers are stripped.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { CitationText } from '../CitationText'
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
  makeSource({ id: 1, title: 'First Article', url: 'https://example.com/first' }),
  makeSource({ id: 2, title: 'Second Article', url: 'https://example.com/second' }),
  makeSource({ id: 3, title: 'Third Article', url: 'https://example.com/third' }),
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CitationText', () => {
  it('renders plain text with no citations unchanged', () => {
    render(createElement(CitationText, { text: 'No citations here.', sources: SOURCES }))
    expect(screen.getByText('No citations here.')).toBeTruthy()
  })

  it('resolves [1] to a clickable link when source with id=1 exists', () => {
    render(createElement(CitationText, { text: 'Check this[1] out.', sources: SOURCES }))
    const link = screen.getByRole('link', { name: '[1]' })
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('https://example.com/first')
  })

  it('strips [99] when source with id=99 does not exist', () => {
    const { container } = render(
      createElement(CitationText, { text: 'Missing ref[99] here.', sources: SOURCES }),
    )
    expect(container.textContent).toBe('Missing ref here.')
    expect(screen.queryByRole('link', { name: '[99]' })).toBeNull()
  })

  it('handles multiple adjacent citations [1][2][3]', () => {
    render(createElement(CitationText, { text: 'Data[1][2][3] shows growth.', sources: SOURCES }))
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(links[0].textContent).toBe('[1]')
    expect(links[1].textContent).toBe('[2]')
    expect(links[2].textContent).toBe('[3]')
  })

  it('renders correct href and title from source data', () => {
    render(createElement(CitationText, { text: 'See[2] for details.', sources: SOURCES }))
    const link = screen.getByRole('link', { name: '[2]' })
    expect(link.getAttribute('href')).toBe('https://example.com/second')
    expect(link.getAttribute('title')).toBe('Second Article')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('handles mixed text and citations with partial source coverage', () => {
    const partial = [SOURCES[0]] // Only source id=1
    const { container } = render(
      createElement(CitationText, { text: 'Hello [1] world [2]', sources: partial }),
    )
    // [1] should resolve, [2] should be stripped
    const link = screen.getByRole('link', { name: '[1]' })
    expect(link).toBeTruthy()
    expect(screen.queryByRole('link', { name: '[2]' })).toBeNull()
    // [1] resolves to a link whose text is "[1]", [2] is stripped entirely
    expect(container.textContent).toBe('Hello [1] world ')
  })
})
