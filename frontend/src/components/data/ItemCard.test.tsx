// ABOUTME: Tests for ItemCard component — verifies NLP chips, sentiment, entities, and group color.
// ABOUTME: Covers keyword chips, sentiment chip labels, entity badge rendering, and groupColor left border.
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

describe('ItemCard sentiment chip', () => {
  it('renders positive sentiment label', () => {
    const item = makeItem({ sentiment: { label: 'positive', score: 0.92 } })
    renderWithI18n(<ItemCard item={item} />)
    expect(screen.getByText('Positive')).toBeInTheDocument()
  })

  it('renders negative sentiment label', () => {
    const item = makeItem({ sentiment: { label: 'negative', score: 0.85 } })
    renderWithI18n(<ItemCard item={item} />)
    expect(screen.getByText('Negative')).toBeInTheDocument()
  })

  it('renders neutral sentiment label', () => {
    const item = makeItem({ sentiment: { label: 'neutral', score: 0.6 } })
    renderWithI18n(<ItemCard item={item} />)
    expect(screen.getByText('Neutral')).toBeInTheDocument()
  })

  it('does not render sentiment chip when sentiment is absent', () => {
    const item = makeItem()
    renderWithI18n(<ItemCard item={item} />)
    expect(screen.queryByText('Positive')).not.toBeInTheDocument()
    expect(screen.queryByText('Negative')).not.toBeInTheDocument()
    expect(screen.queryByText('Neutral')).not.toBeInTheDocument()
  })
})

describe('ItemCard NLP entity badges', () => {
  it('renders people entity badges', () => {
    const item = makeItem({
      nlp_entities: { people: ['Alice', 'Bob'], orgs: [], places: [] },
    })
    renderWithI18n(<ItemCard item={item} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders org entity badges in purple', () => {
    const item = makeItem({
      nlp_entities: { people: [], orgs: ['Google'], places: [] },
    })
    const { container } = renderWithI18n(<ItemCard item={item} />)
    const badge = screen.getByText('Google')
    expect(badge).toBeInTheDocument()
    expect(badge.style.color).toBe('rgb(139, 92, 246)')
  })

  it('renders place entity badges in green', () => {
    const item = makeItem({
      nlp_entities: { people: [], orgs: [], places: ['Tokyo'] },
    })
    renderWithI18n(<ItemCard item={item} />)
    const badge = screen.getByText('Tokyo')
    expect(badge).toBeInTheDocument()
    expect(badge.style.color).toBe('rgb(16, 185, 129)')
  })

  it('shows +N overflow when more than 2 entities per category', () => {
    const item = makeItem({
      nlp_entities: {
        people: ['Alice', 'Bob', 'Charlie', 'Diana'],
        orgs: [],
        places: [],
      },
    })
    renderWithI18n(<ItemCard item={item} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('does not render entity badges when nlp_entities is absent', () => {
    const item = makeItem()
    renderWithI18n(<ItemCard item={item} />)
    // No entity badge elements should exist
    expect(screen.queryByText('+1')).not.toBeInTheDocument()
  })
})

describe('ItemCard groupColor prop', () => {
  it('applies left border when groupColor is provided', () => {
    const item = makeItem()
    const { container } = renderWithI18n(<ItemCard item={item} groupColor="#e63946" />)
    const article = container.querySelector('article') as HTMLElement
    expect(article.style.borderLeft).toBe('3px solid rgb(230, 57, 70)')
  })

  it('does not apply left border when groupColor is absent', () => {
    const item = makeItem()
    const { container } = renderWithI18n(<ItemCard item={item} />)
    const article = container.querySelector('article') as HTMLElement
    expect(article.style.borderLeft).toBe('')
  })
})
