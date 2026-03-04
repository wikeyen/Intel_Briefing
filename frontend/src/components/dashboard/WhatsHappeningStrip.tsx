// ABOUTME: Dashboard strip showing the top 5-8 most important items across all groups.
// ABOUTME: Ranks items by composite signal score (velocity, sentiment, recency) with group-colored borders.
'use client'

import { useMemo } from 'react'
import type { IntelReport, IntelItem, BriefingSummary } from '@/api/client'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'
import type { SourceGroupTree } from '@/lib/groups/types'
import { useTranslation } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WhatsHappeningStripProps {
  report: IntelReport
  groups: SourceGroupTree[]
  summary: BriefingSummary | null
}

// ---------------------------------------------------------------------------
// Signal scoring — ranks items by composite importance
// ---------------------------------------------------------------------------

function signalScore(item: IntelItem): number {
  let score = 0
  // Velocity: high change = high signal
  if (item.velocity?.changePercent != null) {
    score += Math.min(Math.abs(item.velocity.changePercent), 100)
  }
  // New items get a boost
  if (item.velocity?.changePercent == null && item.velocity) {
    score += 50 // NEW items
  }
  // Sentiment extremes are interesting
  if (item.sentiment) {
    if (item.sentiment.label !== 'neutral') {
      score += item.sentiment.score * 30
    }
  }
  // Recency bonus (within last 6 hours)
  if (item.published_at) {
    const hoursAgo = (Date.now() - new Date(item.published_at).getTime()) / 3600000
    if (hoursAgo < 6) score += (6 - hoursAgo) * 5
  }
  return score
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a sensor-to-group lookup from loaded groups (traverses children). */
function buildSensorGroupMap(groups: SourceGroupTree[]): Map<string, SourceGroupTree> {
  const map = new Map<string, SourceGroupTree>()
  for (const g of groups) {
    for (const s of g.sensors) map.set(s, g)
    for (const child of g.children) {
      for (const s of child.sensors) map.set(s, child)
    }
  }
  return map
}

/** Format a relative time string for display. */
function relativeTime(
  isoString: string,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return t('time.seconds_ago', { n: String(diff) })
  if (diff < 3600) return t('time.minutes_ago', { n: String(Math.floor(diff / 60)) })
  if (diff < 86400) return t('time.hours_ago', { n: String(Math.floor(diff / 3600)) })
  return t('time.days_ago', { n: String(Math.floor(diff / 86400)) })
}

/** Scored item with its originating source key for group lookup. */
interface ScoredItem {
  item: IntelItem
  source: string
  score: number
}

const MIN_ITEMS = 5
const MAX_ITEMS = 8

// ---------------------------------------------------------------------------
// Sentiment chip colors
// ---------------------------------------------------------------------------

const SENTIMENT_COLORS: Record<string, { bg: string; fg: string }> = {
  positive: { bg: 'rgba(52,199,89,0.12)', fg: '#34c759' },
  negative: { bg: 'rgba(255,59,48,0.12)', fg: '#ff3b30' },
  neutral: { bg: 'rgba(142,142,147,0.10)', fg: 'var(--ink-faint)' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WhatsHappeningStrip({ report, groups }: WhatsHappeningStripProps) {
  const { t } = useTranslation()

  const sensorGroupMap = useMemo(() => buildSensorGroupMap(groups), [groups])

  const topItems = useMemo(() => {
    const all: ScoredItem[] = []
    for (const [source, items] of Object.entries(report.items)) {
      for (const item of items) {
        all.push({ item, source, score: signalScore(item) })
      }
    }
    all.sort((a, b) => b.score - a.score)
    // Take top MAX_ITEMS, but at least MIN_ITEMS if available
    return all.slice(0, Math.max(MIN_ITEMS, Math.min(all.length, MAX_ITEMS)))
  }, [report.items])

  if (topItems.length === 0) return null

  return (
    <section style={{
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
      padding: '0.75rem 0',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    }}>
      {/* Section label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        color: 'var(--accent)',
      }}>
        <span style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--accent)',
          flexShrink: 0,
        }} />
        {t('dashboard.whats_happening')}
      </div>

      {/* Item grid: horizontal scroll on mobile, 2-col grid on desktop */}
      <div
        className="whats-happening-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.625rem',
        }}
      >
        {topItems.map(({ item, source }) => {
          const group = sensorGroupMap.get(source)
          const groupColor = group?.color ?? 'var(--border)'
          return (
            <HappeningCard
              key={item.id}
              item={item}
              source={source}
              groupColor={groupColor}
              t={t}
            />
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Individual item card
// ---------------------------------------------------------------------------

function HappeningCard({ item, source, groupColor, t }: {
  item: IntelItem
  source: string
  groupColor: string
  t: (key: string, params?: Record<string, string>) => string
}) {
  const sentimentInfo = item.sentiment ? SENTIMENT_COLORS[item.sentiment.label] : null
  const velocityText = item.velocity?.changePercent != null
    ? `${item.velocity.changePercent > 0 ? '+' : ''}${Math.round(item.velocity.changePercent)}%`
    : item.velocity
      ? t('item.new')
      : null

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-card)',
        padding: '0.625rem 0.75rem',
        border: '1px solid var(--border)',
        transition: 'box-shadow 200ms, border-color 200ms',
        overflow: 'hidden',
        minWidth: 0,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card-hover)'
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = ''
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
      }}
    >
      {/* Title — single line, ellipsis */}
      <div style={{
        fontSize: '0.8125rem',
        fontWeight: 500,
        lineHeight: 1.35,
        color: 'var(--ink)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        marginBottom: '0.3rem',
      }}>
        {item.title}
      </div>

      {/* Meta row: source chip, sentiment chip, velocity badge, time ago */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        flexWrap: 'wrap',
        fontSize: '0.6875rem',
        lineHeight: 1,
      }}>
        {/* Source chip */}
        <span style={{
          display: 'inline-block',
          padding: '0.125rem 0.375rem',
          borderRadius: 4,
          background: 'var(--bg)',
          color: 'var(--ink-muted)',
          fontWeight: 500,
          fontSize: '0.625rem',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.03em',
          whiteSpace: 'nowrap',
        }}>
          {SENSOR_LABELS[source] ?? source}
        </span>

        {/* Sentiment chip */}
        {item.sentiment && item.sentiment.label !== 'neutral' && sentimentInfo && (
          <span style={{
            display: 'inline-block',
            padding: '0.125rem 0.375rem',
            borderRadius: 4,
            background: sentimentInfo.bg,
            color: sentimentInfo.fg,
            fontWeight: 600,
            fontSize: '0.625rem',
            textTransform: 'capitalize' as const,
          }}>
            {item.sentiment.label}
          </span>
        )}

        {/* Velocity badge */}
        {velocityText && (
          <span style={{
            display: 'inline-block',
            padding: '0.125rem 0.375rem',
            borderRadius: 4,
            background: item.velocity?.changePercent != null && item.velocity.changePercent > 0
              ? 'rgba(52,199,89,0.12)'
              : item.velocity?.changePercent != null && item.velocity.changePercent < 0
                ? 'rgba(255,59,48,0.12)'
                : 'rgba(0,122,255,0.12)',
            color: item.velocity?.changePercent != null && item.velocity.changePercent > 0
              ? '#34c759'
              : item.velocity?.changePercent != null && item.velocity.changePercent < 0
                ? '#ff3b30'
                : '#007aff',
            fontWeight: 600,
            fontSize: '0.625rem',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {velocityText}
          </span>
        )}

        {/* Time ago */}
        {item.published_at && (
          <>
            <span style={{ color: 'var(--ink-faint)' }}>&middot;</span>
            <span style={{ color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
              {relativeTime(item.published_at, t)}
            </span>
          </>
        )}
      </div>
    </a>
  )
}
