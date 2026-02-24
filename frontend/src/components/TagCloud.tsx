// ABOUTME: Reusable tag cloud component that visualizes tags with weighted sizes and sentiment coloring.
// ABOUTME: AnimatedTagCloud uses custom spiral placement with canvas text measurement and orbital tornado rotation.
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
// Animated tag cloud — spiral placement with rotating spotlight
// ---------------------------------------------------------------------------

const CLOUD_HEIGHT = 120
const CLOUD_FONT = 'system-ui, -apple-system, sans-serif'
const FOCUS_CYCLE_MS = 5000
const SPIN_SPEED = 0.08 // radians/second — ~78s per full revolution

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

  // Tighter font range to fit all tags
  const maxFont = Math.max(7, Math.min(16, cw * 0.085))
  const minFont = Math.max(5, maxFont * 0.35)
  const cx = cw / 2
  const cy = ch / 2
  const boxes: BBox[] = []
  const result: PlacedWord[] = []

  for (const tag of tags) {
    const fontSize = minFont + tag.weight * (maxFont - minFont)
    const tw = measureTextWidth(tag.text, fontSize)
    const th = fontSize * 1.2

    for (let step = 0; step < 600; step++) {
      const angle = step * 0.3
      const radius = step * 0.45
      const x = cx + radius * Math.cos(angle) - tw / 2
      const y = cy + radius * Math.sin(angle) - th / 2
      const box: BBox = { x, y, w: tw, h: th }

      if (x >= -2 && y >= -2 && x + tw <= cw + 2 && y + th <= ch + 2) {
        if (!boxes.some(b => boxesOverlap(box, b, 2))) {
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
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([])
  const animFrameRef = useRef<number>(0)
  const [width, setWidth] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [focusIdx, setFocusIdx] = useState(0)
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

  // Cycle spotlight through words every 5s
  useEffect(() => {
    if (layout.length <= 1) return
    const timer = setInterval(() => {
      setFocusIdx(prev => (prev + 1) % layout.length)
    }, FOCUS_CYCLE_MS)
    return () => clearInterval(timer)
  }, [layout.length])

  // Compute polar coordinates for each word relative to cloud center
  const polarCoords = useMemo(() => {
    if (!width) return []
    const cx = width / 2
    const cy = CLOUD_HEIGHT / 2
    return layout.map(word => {
      const halfW = measureTextWidth(word.text, word.fontSize) / 2
      const halfH = word.fontSize * 0.6
      const wx = word.x + halfW
      const wy = word.y + halfH
      const dx = wx - cx
      const dy = wy - cy
      return {
        radius: Math.sqrt(dx * dx + dy * dy),
        angle: Math.atan2(dy, dx),
        halfWidth: halfW,
        halfHeight: halfH,
      }
    })
  }, [layout, width])

  // Orbital animation loop — rotate all words around center
  useEffect(() => {
    if (!visible || layout.length === 0 || !width) return
    const cx = width / 2
    const cy = CLOUD_HEIGHT / 2
    let startTime: number | null = null

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsed = (timestamp - startTime) / 1000
      const angleOffset = elapsed * SPIN_SPEED

      polarCoords.forEach((polar, i) => {
        const el = wordRefs.current[i]
        if (!el) return
        const newAngle = polar.angle + angleOffset
        const x = cx + polar.radius * Math.cos(newAngle) - polar.halfWidth
        const y = cy + polar.radius * Math.sin(newAngle) - polar.halfHeight
        el.style.left = `${x}px`
        el.style.top = `${y}px`
      })

      animFrameRef.current = requestAnimationFrame(animate)
    }

    animFrameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [visible, layout, polarCoords, width])

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
      {mounted && width > 0 && layout.map((word, i) => {
        const focused = i === focusIdx
        return (
          // Outer: absolute position (updated by orbital animation loop)
          <span
            key={word.text}
            ref={el => { wordRefs.current[i] = el }}
            style={{
              position: 'absolute',
              left: word.x,
              top: word.y,
            }}
          >
            {/* Inner: spotlight scale + opacity transitions */}
            <span
              style={{
                display: 'inline-block',
                fontSize: `${word.fontSize}px`,
                fontWeight: focused ? 700 : (word.weight > 0.6 ? 600 : 400),
                fontFamily: CLOUD_FONT,
                color: sentimentColor(word.sentiment),
                whiteSpace: 'nowrap',
                opacity: visible ? (focused ? 1 : 0.35) : 0,
                transform: focused ? 'scale(1.25)' : 'scale(0.9)',
                transformOrigin: 'center',
                filter: focused ? 'brightness(1.15)' : 'none',
                transition: 'transform 1.5s ease, opacity 1.5s ease, filter 1.5s ease',
                cursor: 'default',
                userSelect: 'none',
              }}
            >
              {word.text}
            </span>
          </span>
        )
      })}
    </div>
  )
}
