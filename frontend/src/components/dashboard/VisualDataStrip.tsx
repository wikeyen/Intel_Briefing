// ABOUTME: Horizontal row of 4 compact SVG-based chart cards showing section analytics.
// ABOUTME: Renders sentiment ring, source distribution, activity timeline, and velocity indicators.
'use client'

import { useMemo } from 'react'
import type { IntelItem } from '@/api/client'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const CHART_HEADER: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: '0.5625rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-tertiary)',
  margin: 0,
  lineHeight: 1,
}

const CARD_STYLE: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0.75rem',
  background: 'var(--surface)',
  height: 120,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
  overflow: 'hidden',
}

// ---------------------------------------------------------------------------
// Sentiment colors
// ---------------------------------------------------------------------------

const SENT_POS = '#3D9E85'
const SENT_NEG = '#C4606E'
const SENT_NEU = '#8D95A0'

// ---------------------------------------------------------------------------
// Chart 1 — Sentiment Ring
// ---------------------------------------------------------------------------

interface SentimentCounts {
  positive: number
  negative: number
  neutral: number
}

function computeSentimentCounts(items: IntelItem[]): SentimentCounts {
  let positive = 0
  let negative = 0
  let neutral = 0
  for (const item of items) {
    if (!item.sentiment) continue
    if (item.sentiment.label === 'positive') positive++
    else if (item.sentiment.label === 'negative') negative++
    else neutral++
  }
  return { positive, negative, neutral }
}

function SentimentRing({ items }: { items: IntelItem[] }) {
  const counts = useMemo(() => computeSentimentCounts(items), [items])
  const total = counts.positive + counts.negative + counts.neutral

  const segments = useMemo(() => {
    if (total === 0) return []
    return [
      { color: SENT_POS, fraction: counts.positive / total },
      { color: SENT_NEG, fraction: counts.negative / total },
      { color: SENT_NEU, fraction: counts.neutral / total },
    ]
  }, [counts, total])

  const circumference = 2 * Math.PI * 45
  let dashOffset = 0

  // Determine dominant sentiment
  const dominant = useMemo(() => {
    if (total === 0) return { label: '-', pct: 0 }
    if (counts.positive >= counts.negative && counts.positive >= counts.neutral) {
      return { label: '+', pct: Math.round((counts.positive / total) * 100) }
    }
    if (counts.negative >= counts.positive && counts.negative >= counts.neutral) {
      return { label: '-', pct: Math.round((counts.negative / total) * 100) }
    }
    return { label: '~', pct: Math.round((counts.neutral / total) * 100) }
  }, [counts, total])

  return (
    <div style={CARD_STYLE}>
      <span style={CHART_HEADER}>SENTIMENT</span>
      {total === 0 ? (
        <span style={{ fontSize: '0.625rem', color: 'var(--ink-disabled)', margin: 'auto 0' }}>
          No sentiment data
        </span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minHeight: 0 }}>
          <svg viewBox="0 0 110 110" style={{ width: 56, height: 56, flexShrink: 0 }}>
            {segments.map((slice, i) => {
              if (slice.fraction <= 0) return null
              const len = slice.fraction * circumference
              const gap = circumference - len
              const currentOffset = dashOffset
              dashOffset += slice.fraction
              return (
                <circle
                  key={i}
                  cx={55}
                  cy={55}
                  r={45}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={10}
                  strokeDasharray={`${len} ${gap}`}
                  strokeDashoffset={-currentOffset * circumference}
                  transform="rotate(-90 55 55)"
                  strokeLinecap="butt"
                />
              )
            })}
            <text
              x={55}
              y={55}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fontFamily: MONO,
                fontSize: 20,
                fontWeight: 700,
                fill: 'var(--ink)',
              }}
            >
              {dominant.pct}%
            </text>
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <LegendRow color={SENT_POS} label="Pos" count={counts.positive} />
            <LegendRow color={SENT_NEG} label="Neg" count={counts.negative} />
            <LegendRow color={SENT_NEU} label="Neu" count={counts.neutral} />
          </div>
        </div>
      )}
    </div>
  )
}

function LegendRow({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: MONO, fontSize: '0.5rem', color: 'var(--ink-tertiary)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ fontFamily: MONO, fontSize: '0.5rem', fontWeight: 600, color: 'var(--ink-secondary)' }}>
        {count}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chart 2 — Source Distribution
// ---------------------------------------------------------------------------

interface SourceCount {
  key: string
  label: string
  count: number
}

function SourceDistribution({ items, sensorKeys, groupColor }: {
  items: IntelItem[]
  sensorKeys: string[]
  groupColor: string
}) {
  const sources = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      counts.set(item.source, (counts.get(item.source) ?? 0) + 1)
    }
    const result: SourceCount[] = []
    for (const key of sensorKeys) {
      const c = counts.get(key)
      if (c && c > 0) {
        result.push({ key, label: SENSOR_LABELS[key] ?? key, count: c })
      }
    }
    // Also include any sources not in sensorKeys (edge case: items from legacy sensors)
    for (const [key, c] of counts) {
      if (!sensorKeys.includes(key) && c > 0) {
        result.push({ key, label: SENSOR_LABELS[key] ?? key, count: c })
      }
    }
    result.sort((a, b) => b.count - a.count)
    return result
  }, [items, sensorKeys])

  const maxCount = sources.length > 0 ? sources[0].count : 1
  const visible = sources.slice(0, 5)
  const overflow = sources.length - 5

  return (
    <div style={CARD_STYLE}>
      <span style={CHART_HEADER}>SOURCES</span>
      {visible.length === 0 ? (
        <span style={{ fontSize: '0.625rem', color: 'var(--ink-disabled)', margin: 'auto 0' }}>
          No source data
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, justifyContent: 'center' }}>
          {visible.map(src => (
            <div key={src.key} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{
                fontFamily: MONO,
                fontSize: '0.5rem',
                color: 'var(--ink-tertiary)',
                width: 52,
                textAlign: 'right',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {src.label}
              </span>
              <div style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                background: `color-mix(in srgb, ${groupColor} 20%, transparent)`,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${(src.count / maxCount) * 100}%`,
                  background: groupColor,
                  borderRadius: 4,
                  transition: 'width 300ms ease',
                }} />
              </div>
              <span style={{
                fontFamily: MONO,
                fontSize: '0.5rem',
                fontWeight: 600,
                color: 'var(--ink-secondary)',
                width: 18,
                textAlign: 'right',
                flexShrink: 0,
              }}>
                {src.count}
              </span>
            </div>
          ))}
          {overflow > 0 && (
            <span style={{
              fontFamily: MONO,
              fontSize: '0.5rem',
              color: 'var(--ink-disabled)',
              textAlign: 'center',
            }}>
              +{overflow} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chart 3 — Activity Timeline
// ---------------------------------------------------------------------------

function ActivityTimeline({ items, groupColor }: { items: IntelItem[]; groupColor: string }) {
  const buckets = useMemo(() => {
    const now = Date.now()
    const counts = new Array<number>(24).fill(0)
    for (const item of items) {
      if (!item.published_at) continue
      const age = now - new Date(item.published_at).getTime()
      const hoursAgo = Math.floor(age / 3600000)
      if (hoursAgo >= 0 && hoursAgo < 24) {
        counts[23 - hoursAgo]++
      }
    }
    return counts
  }, [items])

  const maxVal = Math.max(1, ...buckets)
  const svgWidth = 200
  const svgHeight = 50
  const padX = 2
  const padY = 4
  const plotW = svgWidth - padX * 2
  const plotH = svgHeight - padY * 2

  const points = buckets.map((v, i) => {
    const x = padX + (i / 23) * plotW
    const y = padY + plotH - (v / maxVal) * plotH
    return `${x},${y}`
  })

  const areaPath = `M ${padX},${padY + plotH} ` +
    points.map(p => `L ${p}`).join(' ') +
    ` L ${padX + plotW},${padY + plotH} Z`

  const linePath = `M ${points.join(' L ')}`

  return (
    <div style={CARD_STYLE}>
      <span style={CHART_HEADER}>ACTIVITY</span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 44 }} preserveAspectRatio="none">
          <path d={areaPath} fill={groupColor} fillOpacity={0.15} />
          <path d={linePath} fill="none" stroke={groupColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
          <span style={{ fontFamily: MONO, fontSize: '0.5rem', color: 'var(--ink-disabled)' }}>24h</span>
          <span style={{ fontFamily: MONO, fontSize: '0.5rem', color: 'var(--ink-disabled)' }}>now</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chart 4 — Velocity Indicators
// ---------------------------------------------------------------------------

function VelocityIndicators({ items, groupColor }: { items: IntelItem[]; groupColor: string }) {
  const stats = useMemo(() => {
    let upCount = 0
    let downCount = 0
    let newCount = 0
    let upSum = 0
    let downSum = 0

    for (const item of items) {
      if (!item.velocity) continue
      const cp = item.velocity.changePercent
      if (cp === null || cp === undefined) {
        newCount++
      } else if (cp > 0) {
        upCount++
        upSum += cp
      } else if (cp < 0) {
        downCount++
        downSum += Math.abs(cp)
      }
    }

    return {
      upCount,
      downCount,
      newCount,
      upAvg: upCount > 0 ? Math.round(upSum / upCount) : 0,
      downAvg: downCount > 0 ? Math.round(downSum / downCount) : 0,
    }
  }, [items])

  const hasData = stats.upCount > 0 || stats.downCount > 0 || stats.newCount > 0

  return (
    <div style={CARD_STYLE}>
      <span style={CHART_HEADER}>VELOCITY</span>
      {!hasData ? (
        <span style={{ fontSize: '0.625rem', color: 'var(--ink-disabled)', margin: 'auto 0' }}>
          No velocity data
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, justifyContent: 'center' }}>
          {stats.upCount > 0 && (
            <VelocityRow
              icon={'\u25B2'}
              iconColor={groupColor}
              count={stats.upCount}
              label="rising"
              detail={`avg +${stats.upAvg}%`}
              detailColor={groupColor}
            />
          )}
          {stats.downCount > 0 && (
            <VelocityRow
              icon={'\u25BC'}
              iconColor="var(--err)"
              count={stats.downCount}
              label="falling"
              detail={`avg -${stats.downAvg}%`}
              detailColor="var(--err)"
            />
          )}
          {stats.newCount > 0 && (
            <VelocityRow
              icon={'\u25CF'}
              iconColor="var(--ink-tertiary)"
              count={stats.newCount}
              label="new"
              detail=""
              detailColor="var(--ink-tertiary)"
            />
          )}
        </div>
      )}
    </div>
  )
}

function VelocityRow({ icon, iconColor, count, label, detail, detailColor }: {
  icon: string
  iconColor: string
  count: number
  label: string
  detail: string
  detailColor: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
      <span style={{ fontSize: '0.5625rem', color: iconColor, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontFamily: MONO, fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink)' }}>
        {count}
      </span>
      <span style={{ fontFamily: MONO, fontSize: '0.5rem', color: 'var(--ink-tertiary)' }}>
        {label}
      </span>
      {detail && (
        <span style={{ fontFamily: MONO, fontSize: '0.5rem', fontWeight: 600, color: detailColor, marginLeft: 'auto' }}>
          {detail}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Responsive CSS for grid columns
// ---------------------------------------------------------------------------

const STRIP_CSS = `
.visual-data-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}
@media (max-width: 768px) {
  .visual-data-strip {
    grid-template-columns: repeat(2, 1fr);
  }
}
`

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface VisualDataStripProps {
  items: IntelItem[]
  groupColor: string
  sensorKeys: string[]
}

export function VisualDataStrip({ items, groupColor, sensorKeys }: VisualDataStripProps) {
  return (
    <>
      <style>{STRIP_CSS}</style>
      <div className="visual-data-strip">
        <SentimentRing items={items} />
        <SourceDistribution items={items} sensorKeys={sensorKeys} groupColor={groupColor} />
        <ActivityTimeline items={items} groupColor={groupColor} />
        <VelocityIndicators items={items} groupColor={groupColor} />
      </div>
    </>
  )
}
