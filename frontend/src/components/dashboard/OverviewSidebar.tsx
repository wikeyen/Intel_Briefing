// ABOUTME: Sidebar panel for the Overview tab showing aggregate sentiment ring and source distribution by group.
// ABOUTME: Renders a donut chart with dominant sentiment % and horizontal bar chart of items per source group.
'use client'

import { useMemo } from 'react'
import type { IntelItem } from '@/api/client'
import type { SourceGroupTree } from '@/lib/groups/types'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const SECTION_HEADER: React.CSSProperties = {
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
  boxShadow: 'var(--shadow-card)',
  borderRadius: 'var(--radius-card)',
  padding: '0.75rem',
  background: 'var(--surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
}

// ---------------------------------------------------------------------------
// Sentiment colors
// ---------------------------------------------------------------------------

const SENT_POS = '#3D9E85'
const SENT_NEG = '#C4606E'
const SENT_NEU = '#8D95A0'

// ---------------------------------------------------------------------------
// Sentiment helpers
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

// ---------------------------------------------------------------------------
// Sentiment Ring section
// ---------------------------------------------------------------------------

function SentimentSection({ items }: { items: IntelItem[] }) {
  const counts = useMemo(() => computeSentimentCounts(items), [items])
  const total = counts.positive + counts.negative + counts.neutral

  const circumference = 2 * Math.PI * 45

  const segments = useMemo(() => {
    if (total === 0) return []
    const raw = [
      { color: SENT_POS, fraction: counts.positive / total },
      { color: SENT_NEG, fraction: counts.negative / total },
      { color: SENT_NEU, fraction: counts.neutral / total },
    ]
    let cumulative = 0
    return raw.map(s => {
      const offset = cumulative
      cumulative += s.fraction
      return { ...s, offset }
    })
  }, [counts, total])

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
    <div style={CARD_STYLE} data-testid="sentiment-section">
      <span style={SECTION_HEADER}>Sentiment</span>
      {total === 0 ? (
        <span style={{ fontSize: '0.75rem', color: 'var(--ink-disabled)', padding: '0.5rem 0' }}>
          No sentiment data
        </span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg viewBox="0 0 110 110" style={{ width: 72, height: 72, flexShrink: 0 }} data-testid="sentiment-ring">
            {segments.map((slice, i) => {
              if (slice.fraction <= 0) return null
              const len = slice.fraction * circumference
              const gap = circumference - len
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
                  strokeDashoffset={-slice.offset * circumference}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <LegendRow color={SENT_POS} label="Positive" count={counts.positive} />
            <LegendRow color={SENT_NEG} label="Negative" count={counts.negative} />
            <LegendRow color={SENT_NEU} label="Neutral" count={counts.neutral} />
          </div>
        </div>
      )}
    </div>
  )
}

function LegendRow({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: MONO, fontSize: '0.625rem', color: 'var(--ink-tertiary)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ fontFamily: MONO, fontSize: '0.625rem', fontWeight: 600, color: 'var(--ink-secondary)' }}>
        {count}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sources by Group section
// ---------------------------------------------------------------------------

interface GroupBar {
  id: string
  name: string
  color: string
  count: number
}

function SourcesByGroupSection({ groups, groupItemMap }: {
  groups: SourceGroupTree[]
  groupItemMap: Record<string, IntelItem[]>
}) {
  const bars = useMemo(() => {
    const result: GroupBar[] = []
    const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order)
    for (const group of sorted) {
      const count = (groupItemMap[group.id] ?? []).length
      if (count > 0) {
        result.push({ id: group.id, name: group.name, color: group.color, count })
      }
    }
    return result
  }, [groups, groupItemMap])

  const maxCount = bars.length > 0 ? Math.max(...bars.map(b => b.count)) : 1

  return (
    <div style={CARD_STYLE} data-testid="sources-section">
      <span style={SECTION_HEADER}>Sources</span>
      {bars.length === 0 ? (
        <span style={{ fontSize: '0.75rem', color: 'var(--ink-disabled)', padding: '0.5rem 0' }}>
          No source data
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bars.map(bar => (
            <div key={bar.id} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{
                fontFamily: MONO,
                fontSize: '0.625rem',
                color: 'var(--ink-tertiary)',
                width: 70,
                textAlign: 'right',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {bar.name}
              </span>
              <div style={{
                flex: 1,
                height: 10,
                borderRadius: 5,
                background: `color-mix(in srgb, ${bar.color} 20%, transparent)`,
                overflow: 'hidden',
              }}>
                <div
                  data-testid={`bar-fill-${bar.id}`}
                  style={{
                    height: '100%',
                    width: `${(bar.count / maxCount) * 100}%`,
                    background: bar.color,
                    borderRadius: 5,
                    transition: 'width 300ms ease',
                  }}
                />
              </div>
              <span style={{
                fontFamily: MONO,
                fontSize: '0.625rem',
                fontWeight: 600,
                color: 'var(--ink-secondary)',
                width: 24,
                textAlign: 'right',
                flexShrink: 0,
              }}>
                {bar.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface OverviewSidebarProps {
  items: IntelItem[]
  groups: SourceGroupTree[]
  groupItemMap: Record<string, IntelItem[]>
}

export function OverviewSidebar({ items, groups, groupItemMap }: OverviewSidebarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <SentimentSection items={items} />
      <SourcesByGroupSection groups={groups} groupItemMap={groupItemMap} />
    </div>
  )
}
