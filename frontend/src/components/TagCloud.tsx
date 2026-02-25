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

/** Map weight (0-1) to a font size between min and max rem. Wider range for clearer hierarchy. */
function weightToSize(weight: number): string {
  const MIN = 0.5
  const MAX = 1.15
  const clamped = Math.max(0, Math.min(1, weight))
  return `${MIN + clamped * (MAX - MIN)}rem`
}

/** Threshold above which tags get a pill background. Below this, plain text only. */
const PILL_THRESHOLD = 0.5

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TagCloud({ tags, maxTags = 30, style }: TagCloudProps) {
  const sorted = useMemo(() => {
    const sliced = [...tags]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxTags)
    // Normalize weights to span 0-1 so visual hierarchy is always clear,
    // even when raw weights are bunched together (e.g. 0.69-0.95).
    if (sliced.length < 2) return sliced
    const max = sliced[0].weight
    const min = sliced[sliced.length - 1].weight
    const range = max - min
    if (range < 0.01) return sliced // all identical weights — skip
    return sliced.map(tag => ({
      ...tag,
      weight: (tag.weight - min) / range,
    }))
  }, [tags, maxTags])

  if (sorted.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.2rem 0.35rem',
        lineHeight: 1.3,
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
  const hasPill = tag.weight >= PILL_THRESHOLD
  const opacity = tag.weight < 0.3 ? 0.6 : tag.weight < PILL_THRESHOLD ? 0.8 : 1

  const restBg = hasPill ? `color-mix(in srgb, ${color} 8%, transparent)` : 'transparent'
  const hoverBg = hasPill ? `color-mix(in srgb, ${color} 15%, transparent)` : `color-mix(in srgb, ${color} 8%, transparent)`

  return (
    <span
      style={{
        display: 'inline-block',
        fontSize,
        fontWeight: tag.weight >= 0.7 ? 600 : tag.weight >= 0.4 ? 500 : 400,
        color,
        opacity,
        background: restBg,
        borderRadius: hasPill ? 9999 : 4,
        padding: hasPill ? '0.05rem 0.4rem' : '0.025rem 0.1rem',
        cursor: 'pointer',
        transition: 'filter 150ms ease, background 150ms ease, opacity 150ms ease',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = 'brightness(1.15)'
        e.currentTarget.style.background = hoverBg
        e.currentTarget.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = 'brightness(1)'
        e.currentTarget.style.background = restBg
        e.currentTarget.style.opacity = String(opacity)
      }}
    >
      {tag.text}
    </span>
  )
}
