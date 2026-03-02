// ABOUTME: Filter bar for narrowing items within a dashboard section — source, sentiment, time, search.
// ABOUTME: Exports FilterState type, DEFAULT_FILTERS constant, and applyFilters() helper for use by parent components.
'use client'

import { useState, useCallback } from 'react'
import type { IntelItem } from '@/api/client'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export interface FilterState {
  sources: string[]
  sentiment: 'all' | 'positive' | 'negative' | 'neutral'
  timeRange: '6h' | '12h' | '24h' | '48h' | 'all'
  search: string
}

export const DEFAULT_FILTERS: FilterState = {
  sources: [],
  sentiment: 'all',
  timeRange: '24h',
  search: '',
}

const TIME_RANGE_HOURS: Record<FilterState['timeRange'], number | null> = {
  '6h': 6,
  '12h': 12,
  '24h': 24,
  '48h': 48,
  all: null,
}

/** Filter an array of IntelItems by source, sentiment, time range, and search term. */
export function applyFilters(items: IntelItem[], filters: FilterState): IntelItem[] {
  let result = items

  if (filters.sources.length > 0) {
    const sourceSet = new Set(filters.sources)
    result = result.filter(item => sourceSet.has(item.source))
  }

  if (filters.sentiment !== 'all') {
    result = result.filter(item => item.sentiment?.label === filters.sentiment)
  }

  const hours = TIME_RANGE_HOURS[filters.timeRange]
  if (hours !== null) {
    const cutoff = Date.now() - hours * 3600000
    result = result.filter(item => {
      if (!item.published_at) return false
      return new Date(item.published_at).getTime() >= cutoff
    })
  }

  if (filters.search) {
    const needle = filters.search.toLowerCase()
    result = result.filter(item => item.title.toLowerCase().includes(needle))
  }

  return result
}

export interface SectionFilterBarProps {
  availableSources: string[]
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  totalCount: number
  filteredCount: number
}

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-badge)',
  padding: '0.375rem 0.625rem',
  fontSize: '0.75rem',
  fontWeight: 500,
  background: 'var(--surface)',
  color: 'var(--ink)',
  cursor: 'pointer',
  outline: 'none',
}

const inputStyle: React.CSSProperties = {
  ...selectStyle,
  cursor: 'text',
  minWidth: 140,
}

interface ActiveChip {
  key: string
  label: string
  onClear: () => void
}

export function SectionFilterBar({
  availableSources,
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
}: SectionFilterBarProps) {
  const [searchFocused, setSearchFocused] = useState(false)

  const update = useCallback(
    (partial: Partial<FilterState>) => {
      onFiltersChange({ ...filters, ...partial })
    },
    [filters, onFiltersChange],
  )

  // Build active filter chips
  const chips: ActiveChip[] = []

  if (filters.sources.length > 0) {
    for (const src of filters.sources) {
      chips.push({
        key: `source:${src}`,
        label: src,
        onClear: () => {
          update({ sources: filters.sources.filter(s => s !== src) })
        },
      })
    }
  }

  if (filters.sentiment !== 'all') {
    chips.push({
      key: 'sentiment',
      label: filters.sentiment,
      onClear: () => update({ sentiment: 'all' }),
    })
  }

  if (filters.timeRange !== DEFAULT_FILTERS.timeRange) {
    chips.push({
      key: 'timeRange',
      label: filters.timeRange === 'all' ? 'all time' : `last ${filters.timeRange}`,
      onClear: () => update({ timeRange: DEFAULT_FILTERS.timeRange }),
    })
  }

  if (filters.search) {
    chips.push({
      key: 'search',
      label: `"${filters.search}"`,
      onClear: () => update({ search: '' }),
    })
  }

  return (
    <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Filter controls row */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* Source filter */}
        <select
          value={filters.sources.length === 0 ? '__all__' : filters.sources.length === 1 ? filters.sources[0] : '__multi__'}
          onChange={e => {
            const val = e.target.value
            if (val === '__all__') {
              update({ sources: [] })
            } else {
              update({ sources: [val] })
            }
          }}
          style={selectStyle}
          aria-label="Filter by source"
        >
          <option value="__all__">All sources</option>
          {availableSources.map(src => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </select>

        {/* Sentiment filter */}
        <select
          value={filters.sentiment}
          onChange={e => update({ sentiment: e.target.value as FilterState['sentiment'] })}
          style={selectStyle}
          aria-label="Filter by sentiment"
        >
          <option value="all">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
          <option value="neutral">Neutral</option>
        </select>

        {/* Time range filter */}
        <select
          value={filters.timeRange}
          onChange={e => update({ timeRange: e.target.value as FilterState['timeRange'] })}
          style={selectStyle}
          aria-label="Filter by time range"
        >
          <option value="6h">Last 6h</option>
          <option value="12h">Last 12h</option>
          <option value="24h">Last 24h</option>
          <option value="48h">Last 48h</option>
          <option value="all">All time</option>
        </select>

        {/* Search input */}
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <span
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '0.75rem',
              color: 'var(--ink-disabled)',
              pointerEvents: 'none',
              lineHeight: 1,
            }}
          >
            &#x2315;
          </span>
          <input
            type="text"
            value={filters.search}
            onChange={e => update({ search: e.target.value })}
            placeholder="Search titles…"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              ...inputStyle,
              paddingLeft: '1.5rem',
              borderColor: searchFocused ? 'var(--accent)' : 'var(--border)',
            }}
            aria-label="Search items"
          />
        </div>

        {/* Count display (pushed right) */}
        <span
          style={{
            fontFamily: MONO,
            fontSize: '0.6875rem',
            color: 'var(--ink-tertiary)',
            marginLeft: 'auto',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {filteredCount} / {totalCount}
        </span>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '0.375rem',
            flexWrap: 'wrap',
            marginTop: '0.375rem',
          }}
        >
          {chips.map(chip => (
            <span
              key={chip.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                color: 'var(--accent)',
                borderRadius: 'var(--radius-badge)',
                padding: '2px 8px',
                fontSize: '0.625rem',
                fontWeight: 500,
                lineHeight: 1.4,
              }}
            >
              {chip.label}
              <button
                onClick={chip.onClear}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  background: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '0.75rem',
                  lineHeight: 1,
                  opacity: 0.7,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
                aria-label={`Clear ${chip.label} filter`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
