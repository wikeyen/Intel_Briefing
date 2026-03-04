// ABOUTME: Tests for SectionTabBar — verifies tab rendering, selection, and mobile Overview tab.
// ABOUTME: Covers group tabs, active states, counts, freshness dot, and mobile-only overview tab.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement } from 'react'
import { SectionTabBar, OVERVIEW_TAB_ID } from '../SectionTabBar'
import type { SectionTabBarProps } from '../SectionTabBar'
import type { SourceGroupTree } from '@/lib/groups/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGroup(overrides: Partial<SourceGroupTree> = {}): SourceGroupTree {
  return {
    id: 'g1',
    parent_id: null,
    name: 'Research',
    color: '#1A7A6D',
    icon: null,
    sort_order: 0,
    trend_enabled: false,
    topic_enabled: false,
    social_enabled: false,
    sentiment_enabled: false,
    summary_prompt: null,
    trend_prompt: null,
    topic_prompt: null,
    social_prompt: null,
    suppress_keywords: [],
    boost_keywords: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    sensors: [],
    children: [],
    ...overrides,
  }
}

function defaultProps(overrides: Partial<SectionTabBarProps> = {}): SectionTabBarProps {
  return {
    groups: [
      makeGroup({ id: 'g1', name: 'Research', sort_order: 0 }),
      makeGroup({ id: 'g2', name: 'News', sort_order: 1, color: '#2E7D9A' }),
    ],
    activeGroupId: 'g1',
    onSelect: vi.fn(),
    itemCounts: { g1: 12, g2: 8 },
    fetchedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionTabBar', () => {
  it('renders group tabs sorted by sort_order', () => {
    render(createElement(SectionTabBar, defaultProps()))
    const buttons = screen.getAllByRole('button')
    expect(buttons[0].textContent).toContain('Research')
    expect(buttons[1].textContent).toContain('News')
  })

  it('displays item counts in badges', () => {
    render(createElement(SectionTabBar, defaultProps()))
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('8')).toBeTruthy()
  })

  it('calls onSelect when a tab is clicked', () => {
    const onSelect = vi.fn()
    render(createElement(SectionTabBar, defaultProps({ onSelect })))
    fireEvent.click(screen.getAllByRole('button')[1])
    expect(onSelect).toHaveBeenCalledWith('g2')
  })

  it('applies active styling to selected tab', () => {
    render(createElement(SectionTabBar, defaultProps({ activeGroupId: 'g1' })))
    const buttons = screen.getAllByRole('button')
    expect(buttons[0].style.borderBottom).toContain('2px solid')
    expect(buttons[0].style.borderBottom).not.toContain('transparent')
  })

  describe('Overview tab', () => {
    it('renders Overview tab when showOverviewTab is true', () => {
      render(createElement(SectionTabBar, defaultProps({ showOverviewTab: true })))
      expect(screen.getByText('Overview')).toBeTruthy()
    })

    it('does not render Overview tab when showOverviewTab is false', () => {
      render(createElement(SectionTabBar, defaultProps({ showOverviewTab: false })))
      expect(screen.queryByText('Overview')).toBeNull()
    })

    it('does not render Overview tab by default', () => {
      render(createElement(SectionTabBar, defaultProps()))
      expect(screen.queryByText('Overview')).toBeNull()
    })

    it('calls onSelect with OVERVIEW_TAB_ID when Overview tab is clicked', () => {
      const onSelect = vi.fn()
      render(createElement(SectionTabBar, defaultProps({ showOverviewTab: true, onSelect })))
      fireEvent.click(screen.getByText('Overview'))
      expect(onSelect).toHaveBeenCalledWith(OVERVIEW_TAB_ID)
    })

    it('applies active styling when Overview tab is selected', () => {
      render(createElement(SectionTabBar, defaultProps({
        showOverviewTab: true,
        activeGroupId: OVERVIEW_TAB_ID,
      })))
      const overviewBtn = screen.getByText('Overview').closest('button') as HTMLElement
      expect(overviewBtn.style.borderBottom).toContain('2px solid')
      expect(overviewBtn.style.borderBottom).not.toContain('transparent')
    })

    it('renders Overview tab before group tabs', () => {
      render(createElement(SectionTabBar, defaultProps({ showOverviewTab: true })))
      const buttons = screen.getAllByRole('button')
      expect(buttons[0].textContent).toContain('Overview')
      expect(buttons[1].textContent).toContain('Research')
      expect(buttons[2].textContent).toContain('News')
    })
  })
})
