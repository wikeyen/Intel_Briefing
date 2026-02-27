// ABOUTME: Unit tests for the DragPreview component rendered inside DragOverlay.
// ABOUTME: Verifies correct preview rendering for both group and sensor drag operations.
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { DragPreview } from '@/components/Sensors'
import type { SourceGroupTree } from '@/lib/groups/types'

// Mock i18n — DragPreview doesn't use it directly but imports may trigger it
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

/** Workflow field defaults for test fixtures (all analysis off). */
const WORKFLOW_DEFAULTS = {
  trend_enabled: false,
  topic_enabled: false,
  social_enabled: false,
  sentiment_enabled: false,
  summary_prompt: null,
  trend_prompt: null,
  topic_prompt: null,
  social_prompt: null,
  suppress_keywords: [] as string[],
  boost_keywords: [] as string[],
} as const

const makeGroup = (overrides: Partial<SourceGroupTree> = {}): SourceGroupTree => ({
  id: 'g1',
  parent_id: null,
  name: 'Test Group',
  color: '#ff6600',
  icon: null,
  ...WORKFLOW_DEFAULTS,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  sensors: ['hacker_news', 'github'],
  children: [],
  ...overrides,
})

const sensorMap: Record<string, { key: string; label: string; desc: string }> = {
  hacker_news: { key: 'hacker_news', label: 'Hacker News', desc: 'Top stories from HN' },
  github: { key: 'github', label: 'GitHub Trending', desc: 'Daily trending repos' },
}

describe('DragPreview', () => {
  it('renders group preview when activeDragId starts with group:', () => {
    const groups = [makeGroup()]
    const { container } = render(
      <DragPreview activeDragId="group:g1" groups={groups} sensorMap={sensorMap} />
    )
    expect(screen.getByText('Test Group')).toBeTruthy()
    expect(screen.getByText('2 sensors')).toBeTruthy()
    // Color dot should use group color
    const dot = container.querySelector('span')
    expect(dot?.style.background).toBe('rgb(255, 102, 0)')
  })

  it('renders sensor preview when activeDragId is a sensor ref', () => {
    render(
      <DragPreview activeDragId="g1:hacker_news" groups={[]} sensorMap={sensorMap} />
    )
    expect(screen.getByText('Hacker News')).toBeTruthy()
  })

  it('returns null for group drag when group not found', () => {
    const { container } = render(
      <DragPreview activeDragId="group:nonexistent" groups={[makeGroup()]} sensorMap={sensorMap} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('returns null for sensor drag when sensor key not in map', () => {
    const { container } = render(
      <DragPreview activeDragId="g1:unknown_sensor" groups={[]} sensorMap={sensorMap} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders ungrouped sensor preview correctly', () => {
    render(
      <DragPreview activeDragId="ungrouped:github" groups={[]} sensorMap={sensorMap} />
    )
    expect(screen.getByText('GitHub Trending')).toBeTruthy()
  })

  it('shows correct sensor count for groups with many sensors', () => {
    const group = makeGroup({
      id: 'big',
      sensors: ['hacker_news', 'github', 'hacker_news', 'github', 'hacker_news'],
    })
    render(
      <DragPreview activeDragId="group:big" groups={[group]} sensorMap={sensorMap} />
    )
    expect(screen.getByText('5 sensors')).toBeTruthy()
  })
})
