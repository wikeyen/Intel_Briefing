// ABOUTME: Reusable tag cloud component that visualizes tags with weighted sizes and sentiment coloring.
// ABOUTME: Tags are sorted by weight, rendered as inline pills with hover transitions. AnimatedTagCloud uses d3-cloud via @isoterik/react-word-cloud.
'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { WordCloud as WordCloudLib } from '@isoterik/react-word-cloud'

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

// ---------------------------------------------------------------------------
// Animated tag cloud — d3-cloud word cloud via @isoterik/react-word-cloud
// ---------------------------------------------------------------------------

const CLOUD_HEIGHT = 120

/** CSS keyframes for subtle floating drift on word cloud text elements. */
const CLOUD_FLOAT_CSS = `
@keyframes cloudFloat {
  0%, 100% { transform: var(--base-transform) translate(0, 0); }
  25% { transform: var(--base-transform) translate(var(--dx), var(--dy)); }
  50% { transform: var(--base-transform) translate(calc(var(--dx) * -0.5), calc(var(--dy) * 0.7)); }
  75% { transform: var(--base-transform) translate(calc(var(--dx) * 0.3), calc(var(--dy) * -0.8)); }
}
`

/** Unique ID counter for per-instance scoping. */
let cloudIdCounter = 0

export function AnimatedTagCloud({ tags, maxTags = 15, style }: TagCloudProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [mounted, setMounted] = useState(false)
  const scopeId = useRef(`cloud-${++cloudIdCounter}`)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Apply float animation to SVG text elements after render
  useEffect(() => {
    if (!mounted || !containerRef.current) return
    const texts = containerRef.current.querySelectorAll('svg text')
    texts.forEach((el, i) => {
      const textEl = el as SVGTextElement
      // Capture the existing transform as the base
      const baseTransform = textEl.getAttribute('transform') || ''
      textEl.style.setProperty('--base-transform', baseTransform ? `${baseTransform} ` : '')
      // Random drift offsets (small — 1-3px)
      const dx = (1 + Math.random() * 2) * (i % 2 === 0 ? 1 : -1)
      const dy = (1 + Math.random() * 2) * (i % 3 === 0 ? -1 : 1)
      textEl.style.setProperty('--dx', `${dx}px`)
      textEl.style.setProperty('--dy', `${dy}px`)
      // Staggered duration and delay for organic feel
      const duration = 4 + Math.random() * 4 // 4-8s
      const delay = Math.random() * 3 // 0-3s
      textEl.style.animation = `cloudFloat ${duration}s ease-in-out ${delay}s infinite`
      textEl.style.transformOrigin = 'center'
      // Fade in on entrance
      textEl.style.opacity = '0'
      setTimeout(() => {
        textEl.style.transition = 'opacity 0.5s ease'
        textEl.style.opacity = '1'
      }, i * 40)
    })
  }, [mounted, width, tags])

  const words = useMemo(() => {
    return [...tags]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxTags)
      .map(tag => ({ text: tag.text, value: Math.round(tag.weight * 100) }))
  }, [tags, maxTags])

  const sentimentMap = useMemo(() => {
    const map = new Map<string, string>()
    tags.forEach(t => map.set(t.text, t.sentiment ?? 'neutral'))
    return map
  }, [tags])

  if (words.length === 0) return null

  return (
    <div ref={containerRef} data-cloud={scopeId.current} style={{ width: '100%', height: CLOUD_HEIGHT, ...style }}>
      <style>{CLOUD_FLOAT_CSS}</style>
      {mounted && width > 0 && (
        <WordCloudLib
          words={words}
          width={width}
          height={CLOUD_HEIGHT}
          fill={(word) => sentimentColor(sentimentMap.get(word.text))}
          fontSize={(word) => {
            // Scale font sizes to container width — small cards get smaller text
            const maxFont = Math.max(8, Math.min(22, width * 0.1))
            const minFont = Math.max(6, maxFont * 0.35)
            return minFont + (word.value / 100) * (maxFont - minFont)
          }}
          rotate={() => 0}
          padding={1}
          font="system-ui, -apple-system, sans-serif"
          spiral="archimedean"
          enableTooltip={false}
          svgProps={{
            style: { width: '100%', height: '100%', overflow: 'visible' },
            preserveAspectRatio: 'xMidYMid meet',
          }}
        />
      )}
    </div>
  )
}
