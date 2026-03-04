// ABOUTME: Mini snapshot card for a source group on the Overview tab.
// ABOUTME: Shows group name, item count, mini sentiment donut, top themes, and brief narrative.
'use client'

import { useMemo } from 'react'
import type { SourceGroupTree } from '@/lib/groups/types'
import type { IntelItem, IntelTag } from '@/api/client'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// ---------------------------------------------------------------------------
// Sentiment colors (same as VisualDataStrip)
// ---------------------------------------------------------------------------

const SENT_POS = '#3D9E85'
const SENT_NEG = '#C4606E'
const SENT_NEU = '#8D95A0'

// ---------------------------------------------------------------------------
// Responsive grid CSS for the parent container
// ---------------------------------------------------------------------------

export const SNAPSHOT_ROW_CSS = `
.group-snapshot-row {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding-bottom: 0.25rem;
}
.group-snapshot-row::-webkit-scrollbar { display: none; }
.group-snapshot-row > * {
  flex: 0 0 220px;
}
@media (max-width: 768px) {
  .group-snapshot-row > * { flex: 0 0 200px; }
}
`

// ---------------------------------------------------------------------------
// Mini Sentiment Donut (32px SVG)
// ---------------------------------------------------------------------------

function MiniSentimentDonut({ items }: { items: IntelItem[] }) {
  const counts = useMemo(() => {
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
  }, [items])

  const total = counts.positive + counts.negative + counts.neutral
  const radius = 12
  const circumference = 2 * Math.PI * radius
  const strokeWidth = 5

  if (total === 0) {
    return (
      <svg viewBox="0 0 32 32" width={32} height={32} style={{ flexShrink: 0 }}>
        <circle
          cx={16} cy={16} r={radius}
          fill="none" stroke={SENT_NEU} strokeWidth={strokeWidth}
          opacity={0.4}
        />
      </svg>
    )
  }

  const segments = [
    { color: SENT_POS, fraction: counts.positive / total },
    { color: SENT_NEG, fraction: counts.negative / total },
    { color: SENT_NEU, fraction: counts.neutral / total },
  ]

  let offset = 0

  return (
    <svg viewBox="0 0 32 32" width={32} height={32} style={{ flexShrink: 0 }} data-testid="sentiment-donut">
      {segments.map((seg, i) => {
        if (seg.fraction <= 0) return null
        const len = seg.fraction * circumference
        const gap = circumference - len
        const currentOffset = offset
        offset += seg.fraction
        return (
          <circle
            key={i}
            cx={16} cy={16} r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${len} ${gap}`}
            strokeDashoffset={-currentOffset * circumference}
            transform="rotate(-90 16 16)"
            strokeLinecap="butt"
          />
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Component interface
// ---------------------------------------------------------------------------

export interface GroupSnapshotCardProps {
  group: SourceGroupTree
  items: IntelItem[]
  narrative: string
  tags: IntelTag[]
  onClick: () => void
}

// ---------------------------------------------------------------------------
// GroupSnapshotCard
// ---------------------------------------------------------------------------

export function GroupSnapshotCard({ group, items, narrative, tags, onClick }: GroupSnapshotCardProps) {
  if (items.length === 0) return null

  const visibleTags = tags.slice(0, 3)

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-card)',
        padding: '1.25rem',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        transition: 'box-shadow 200ms',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card-hover)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card)'
      }}
    >
      {/* Top row: group name + item count badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: '0.875rem',
          fontWeight: 700,
          color: 'var(--ink)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {group.name}
        </span>
        <span style={{
          fontFamily: MONO,
          fontSize: '0.625rem',
          fontWeight: 600,
          background: `color-mix(in srgb, ${group.color} 16%, transparent)`,
          color: group.color,
          borderRadius: 'var(--radius-card)',
          padding: '1px 6px',
          flexShrink: 0,
          marginLeft: '0.5rem',
        }}>
          {items.length}
        </span>
      </div>

      {/* Middle row: mini sentiment donut + tag pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <MiniSentimentDonut items={items} />
        {visibleTags.length > 0 && (
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', minWidth: 0 }}>
            {visibleTags.map((tag, i) => (
              <span
                key={`${tag.text}-${i}`}
                style={{
                  background: `color-mix(in srgb, ${group.color} 14%, transparent)`,
                  color: 'var(--ink)',
                  borderRadius: 'var(--radius-badge)',
                  padding: '1px 6px',
                  fontSize: '0.5625rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {tag.text}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom: 1-line narrative */}
      {narrative && (
        <p style={{
          fontSize: '0.6875rem',
          color: 'var(--ink-secondary)',
          margin: 0,
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {narrative}
        </p>
      )}
    </div>
  )
}
