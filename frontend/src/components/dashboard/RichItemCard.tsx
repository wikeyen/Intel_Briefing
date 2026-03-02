// ABOUTME: Detailed item card for displaying intel items in a 2-column grid layout.
// ABOUTME: Exports signal-scoring and time-formatting helpers for reuse across dashboard components.
'use client'

import type { IntelItem } from '@/api/client'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/** Format an ISO date string as a human-readable relative time. */
export function formatTimeAgo(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const diff = Date.now() - new Date(isoDate).getTime()
  if (diff < 0) return 'just now'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Compute a composite signal score for ranking items by importance.
 * Higher scores surface first. Factors: velocity change, newness, recency, sentiment extremeness.
 */
export function itemSignalScore(item: IntelItem): number {
  let score = 0

  // Velocity: cap at 500% to avoid single-item domination, scale to max 100
  if (item.velocity?.changePercent != null) {
    score += Math.min(Math.abs(item.velocity.changePercent), 500) / 5
  }

  // Brand-new items (velocity tracked but no previous data) get a flat boost
  if (item.velocity && item.velocity.changePercent == null) {
    score += 50
  }

  // Recency: full bonus within the first hour, decays over 25 hours to zero
  if (item.published_at) {
    const hoursOld = (Date.now() - new Date(item.published_at).getTime()) / 3600000
    score += Math.max(0, 100 - hoursOld * 4)
  }

  // Sentiment extremeness: strong opinions are more interesting
  if (item.sentiment && item.sentiment.label !== 'neutral') {
    score += Math.abs(item.sentiment.score) * 20
  }

  return score
}

// ---------------------------------------------------------------------------
// Velocity badge
// ---------------------------------------------------------------------------

function VelocityBadge({ velocity }: { velocity: NonNullable<IntelItem['velocity']> }) {
  const change = velocity.changePercent
  let text: string
  let bg: string
  let fg: string

  if (change != null && change > 0) {
    text = `\u25B2 +${Math.round(change)}%`
    bg = 'rgba(61,158,133,0.08)'
    fg = '#3D9E85'
  } else if (change != null && change < 0) {
    text = `\u25BC ${Math.round(change)}%`
    bg = 'rgba(196,96,110,0.08)'
    fg = '#C4606E'
  } else {
    // changePercent is null — brand-new item
    text = '\u25CF NEW'
    bg = 'rgba(142,142,147,0.08)'
    fg = 'var(--ink-tertiary)'
  }

  return (
    <span style={{
      fontFamily: MONO,
      fontSize: '0.625rem',
      fontWeight: 700,
      borderRadius: 'var(--radius-badge)',
      padding: '2px 6px',
      background: bg,
      color: fg,
      whiteSpace: 'nowrap',
      marginTop: '0.375rem',
      alignSelf: 'flex-start',
    }}>
      {text}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Sentiment chip
// ---------------------------------------------------------------------------

function SentimentChip({ sentiment }: { sentiment: NonNullable<IntelItem['sentiment']> }) {
  if (sentiment.label === 'neutral') return null
  const isPositive = sentiment.label === 'positive'
  const dotColor = isPositive ? '#3D9E85' : '#C4606E'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: dotColor, flexShrink: 0,
      }} />
      <span style={{
        fontSize: '0.625rem', color: 'var(--ink-tertiary)',
      }}>
        {sentiment.label}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface RichItemCardProps {
  item: IntelItem
  groupColor: string
  onClick: () => void
}

export default function RichItemCard({ item, groupColor, onClick }: RichItemCardProps) {
  const excerpt = item.content
    ? item.content.slice(0, 150)
    : item.title.slice(0, 150)

  const sourceLabel = item.source.replace(/_/g, ' ').toUpperCase()
  const timeAgo = formatTimeAgo(item.published_at)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{
        boxShadow: 'var(--shadow-card)',
        borderLeft: `2px solid ${groupColor}`,
        borderRadius: 'var(--radius-card)',
        padding: '1rem',
        background: 'var(--surface)',
        cursor: 'pointer',
        transition: 'box-shadow 200ms',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card-hover)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card)'
      }}
    >
      {/* Title — max 2 lines */}
      <div style={{
        fontSize: '0.875rem',
        fontWeight: 600,
        color: 'var(--ink)',
        lineHeight: 1.4,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as never,
        overflow: 'hidden',
      }}>
        {item.title}
      </div>

      {/* Excerpt — max 3 lines */}
      <div style={{
        fontSize: '0.75rem',
        color: 'var(--ink-secondary)',
        lineHeight: 1.5,
        marginTop: '0.375rem',
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical' as never,
        overflow: 'hidden',
      }}>
        {excerpt}
      </div>

      {/* Velocity badge */}
      {item.velocity && <VelocityBadge velocity={item.velocity} />}

      {/* Metadata row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginTop: '0.5rem',
        flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: MONO,
          fontSize: '0.625rem',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          color: 'var(--ink-tertiary)',
          letterSpacing: '0.04em',
        }}>
          {sourceLabel}
        </span>
        {timeAgo && (
          <span style={{
            fontSize: '0.625rem',
            color: 'var(--ink-tertiary)',
          }}>
            {timeAgo}
          </span>
        )}
        {item.sentiment && <SentimentChip sentiment={item.sentiment} />}
      </div>

      {/* Engagement metrics */}
      {(item.heat || item.authors) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginTop: '0.375rem',
        }}>
          {item.heat && (
            <span style={{
              fontFamily: MONO,
              fontSize: '0.5625rem',
              color: 'var(--ink-tertiary)',
            }}>
              {item.heat} points
            </span>
          )}
          {item.authors && item.authors.length > 0 && (
            <span style={{
              fontFamily: MONO,
              fontSize: '0.5625rem',
              color: 'var(--ink-tertiary)',
            }}>
              {item.authors.length} {item.authors.length === 1 ? 'author' : 'authors'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
