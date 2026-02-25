// ABOUTME: Reusable static tag cloud component that visualizes tags with weighted sizes and sentiment coloring.
// ABOUTME: Renders tags as flex-wrapped pills with hover effects; used in intelligence cards and detail panels.
'use client'

import { useMemo } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TagCloudTag {
  text: string
  weight: number  // 0-1
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed'
}

export interface TagCloudProps {
  tags: TagCloudTag[]
  maxTags?: number  // default 30
  style?: React.CSSProperties
}

// ---------------------------------------------------------------------------
// Sentiment color mapping
// ---------------------------------------------------------------------------

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'var(--cat-trend)',
  negative: '#e74c3c',
  neutral:  'var(--ink-tertiary)',
  mixed:    'var(--accent)',
}

/** Resolve text color for a given sentiment, defaulting to neutral. */
function sentimentColor(sentiment?: string): string {
  return SENTIMENT_COLORS[sentiment ?? 'neutral'] ?? SENTIMENT_COLORS.neutral
}

/** Map weight (0-1) to a font size between min and max rem. */
function weightToSize(weight: number): string {
  const MIN = 0.65
  const MAX = 1.3
  const clamped = Math.max(0, Math.min(1, weight))
  return `${MIN + clamped * (MAX - MIN)}rem`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TagCloud({ tags, maxTags = 30, style }: TagCloudProps) {
  const sorted = useMemo(() => {
    return [...tags]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxTags)
  }, [tags, maxTags])

  if (sorted.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.3rem 0.4rem',
        lineHeight: 1.4,
        ...style,
      }}
    >
      {sorted.map((tag) => (
        <TagPill key={tag.text} tag={tag} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual tag pill
// ---------------------------------------------------------------------------

function TagPill({ tag }: { tag: TagCloudTag }) {
  const color = sentimentColor(tag.sentiment)
  const fontSize = weightToSize(tag.weight)

  return (
    <span
      style={{
        display: 'inline-block',
        fontSize,
        fontWeight: tag.weight > 0.6 ? 600 : 400,
        color,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        borderRadius: 9999,
        padding: '0.1rem 0.5rem',
        cursor: 'pointer',
        transition: 'filter 150ms ease, background 150ms ease',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = 'brightness(1.2)'
        e.currentTarget.style.background = `color-mix(in srgb, ${color} 15%, transparent)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = 'brightness(1)'
        e.currentTarget.style.background = `color-mix(in srgb, ${color} 8%, transparent)`
      }}
    >
      {tag.text}
    </span>
  )
}
