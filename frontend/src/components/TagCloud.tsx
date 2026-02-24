// ABOUTME: Reusable tag cloud component that visualizes tags with weighted sizes and sentiment coloring.
// ABOUTME: AnimatedTagCloud uses custom spiral placement with canvas text measurement and continuous floating drift.
'use client'

import { useMemo, useRef, useState, useEffect } from 'react'

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
// Animated tag cloud — custom spiral placement with floating drift animation
// ---------------------------------------------------------------------------

const CLOUD_HEIGHT = 120
const CLOUD_FONT = 'system-ui, -apple-system, sans-serif'

/** CSS keyframes for continuous breathing drift — words move closer and farther. */
const CLOUD_DRIFT_CSS = `
@keyframes cloudDrift {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(var(--drift-x), var(--drift-y)); }
  50% { transform: translate(calc(var(--drift-x) * -0.6), calc(var(--drift-y) * 0.8)); }
  75% { transform: translate(calc(var(--drift-x) * 0.4), calc(var(--drift-y) * -0.7)); }
}
`

// ---------------------------------------------------------------------------
// Text measurement via offscreen canvas
// ---------------------------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null = null

function measureTextWidth(text: string, fontSize: number): number {
  if (typeof document === 'undefined') return text.length * fontSize * 0.55
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d')
  }
  if (!measureCtx) return text.length * fontSize * 0.55
  measureCtx.font = `${Math.round(fontSize)}px ${CLOUD_FONT}`
  return measureCtx.measureText(text).width
}

// ---------------------------------------------------------------------------
// Spiral placement with collision detection
// ---------------------------------------------------------------------------

interface PlacedWord {
  text: string
  x: number
  y: number
  fontSize: number
  weight: number
  sentiment?: string
}

interface BBox {
  x: number
  y: number
  w: number
  h: number
}

function boxesOverlap(a: BBox, b: BBox, pad: number): boolean {
  return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x ||
           a.y + a.h + pad < b.y || b.y + b.h + pad < a.y)
}

/** Place words along an archimedean spiral from center, rejecting overlaps. */
function computeCloudLayout(
  tags: TagCloudTag[],
  cw: number,
  ch: number,
): PlacedWord[] {
  if (tags.length === 0 || cw <= 0) return []

  const maxFont = Math.max(8, Math.min(22, cw * 0.1))
  const minFont = Math.max(6, maxFont * 0.35)
  const cx = cw / 2
  const cy = ch / 2
  const boxes: BBox[] = []
  const result: PlacedWord[] = []

  for (const tag of tags) {
    const fontSize = minFont + tag.weight * (maxFont - minFont)
    const tw = measureTextWidth(tag.text, fontSize)
    const th = fontSize * 1.25

    for (let step = 0; step < 500; step++) {
      const angle = step * 0.35
      const radius = step * 0.5
      const x = cx + radius * Math.cos(angle) - tw / 2
      const y = cy + radius * Math.sin(angle) - th / 2
      const box: BBox = { x, y, w: tw, h: th }

      // Allow 2px bleed at edges to use full space
      if (x >= -2 && y >= -2 && x + tw <= cw + 2 && y + th <= ch + 2) {
        if (!boxes.some(b => boxesOverlap(box, b, 3))) {
          boxes.push(box)
          result.push({ text: tag.text, x, y, fontSize, weight: tag.weight, sentiment: tag.sentiment })
          break
        }
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnimatedTagCloud({ tags, maxTags = 15, style }: TagCloudProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const fadeTriggered = useRef(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const sorted = useMemo(() => {
    return [...tags].sort((a, b) => b.weight - a.weight).slice(0, maxTags)
  }, [tags, maxTags])

  const layout = useMemo(() => {
    if (!width) return []
    return computeCloudLayout(sorted, width, CLOUD_HEIGHT)
  }, [sorted, width])

  // Trigger staggered fade-in once after first layout
  useEffect(() => {
    if (layout.length > 0 && !fadeTriggered.current) {
      fadeTriggered.current = true
      requestAnimationFrame(() => setVisible(true))
    }
  }, [layout])

  // Deterministic per-word animation params (no Math.random in render)
  const driftProps = useMemo(() => {
    return layout.map((_, i) => ({
      dx: (2 + ((i * 7 + 3) % 4)) * (i % 2 === 0 ? 1 : -1),
      dy: (2 + ((i * 11 + 5) % 3)) * (i % 3 === 0 ? -1 : 1),
      duration: 5 + ((i * 13 + 7) % 5),
      delay: ((i * 3 + 1) % 4) * 0.7,
    }))
  }, [layout])

  if (sorted.length === 0) return null

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: CLOUD_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <style>{CLOUD_DRIFT_CSS}</style>
      {mounted && width > 0 && layout.map((word, i) => (
        <span
          key={word.text}
          style={{
            position: 'absolute',
            left: word.x,
            top: word.y,
            fontSize: `${word.fontSize}px`,
            fontWeight: word.weight > 0.6 ? 600 : 400,
            fontFamily: CLOUD_FONT,
            color: sentimentColor(word.sentiment),
            whiteSpace: 'nowrap',
            opacity: visible ? 1 : 0,
            transition: `opacity 0.4s ease ${i * 0.04}s`,
            animation: visible
              ? `cloudDrift ${driftProps[i].duration}s ease-in-out ${driftProps[i].delay}s infinite`
              : 'none',
            '--drift-x': `${driftProps[i].dx}px`,
            '--drift-y': `${driftProps[i].dy}px`,
            cursor: 'default',
            userSelect: 'none',
          } as React.CSSProperties}
        >
          {word.text}
        </span>
      ))}
    </div>
  )
}
