// ABOUTME: Tests for ItemCard component — verifies NLP keyword chip rendering.
// ABOUTME: Covers chip presence, absence, and max-3 truncation behavior.
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { I18nProvider } from '@/lib/i18n/context'
import { ItemCard } from './ItemCard'
import type { IntelItem } from '@/api/client'

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider initialLocale="en">{ui}</I18nProvider>)
}

function makeItem(overrides: Partial<IntelItem> = {}): IntelItem {
  return {
    id: 'test-1',
    source: 'hacker_news',
    title: 'Test Item',
    url: 'https://example.com',
    ...overrides,
  }
}

describe('ItemCard NLP keyword chips', () => {
  it('renders keyword chips when nlp_keywords is present', () => {
    const item = makeItem({
      nlp_keywords: [
        { text: 'AI', weight: 0.9 },
        { text: 'Machine Learning', weight: 0.8 },
      ],
    })
    renderWithI18n(<ItemCard item={item} />)
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('Machine Learning')).toBeInTheDocument()
  })

  it('does not render keyword chips when nlp_keywords is absent', () => {
    const item = makeItem()
    const { container } = renderWithI18n(<ItemCard item={item} />)
    // No keyword chip elements — chips have fontSize 0.5625rem
    const chips = container.querySelectorAll('span[style*="0.5625rem"]')
    expect(chips).toHaveLength(0)
  })

  it('renders at most 3 keyword chips', () => {
    const item = makeItem({
      nlp_keywords: [
        { text: 'AI', weight: 0.9 },
        { text: 'ML', weight: 0.8 },
        { text: 'NLP', weight: 0.7 },
        { text: 'CV', weight: 0.6 },
        { text: 'RL', weight: 0.5 },
      ],
    })
    renderWithI18n(<ItemCard item={item} />)
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('ML')).toBeInTheDocument()
    expect(screen.getByText('NLP')).toBeInTheDocument()
    expect(screen.queryByText('CV')).not.toBeInTheDocument()
    expect(screen.queryByText('RL')).not.toBeInTheDocument()
  })

  it('does not render keyword chips when nlp_keywords is null', () => {
    const item = makeItem({ nlp_keywords: null })
    const { container } = renderWithI18n(<ItemCard item={item} />)
    const chips = container.querySelectorAll('span[style*="0.5625rem"]')
    expect(chips).toHaveLength(0)
  })

  it('does not render keyword chips when nlp_keywords is empty array', () => {
    const item = makeItem({ nlp_keywords: [] })
    const { container } = renderWithI18n(<ItemCard item={item} />)
    const chips = container.querySelectorAll('span[style*="0.5625rem"]')
    expect(chips).toHaveLength(0)
  })
})
