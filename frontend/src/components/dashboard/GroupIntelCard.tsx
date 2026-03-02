// ABOUTME: Compact card for a source group — shows group summary, top items, and analysis badges.
// ABOUTME: Used in the Dashboard grid; clicking opens the GroupDetailPanel.
'use client'

import type { SourceGroupTree } from '@/lib/groups/types'
import type { IntelItem, BriefingSummary } from '@/api/client'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'
import { useTranslation } from '@/lib/i18n'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export interface GroupIntelCardProps {
  group: SourceGroupTree
  items: IntelItem[]
  summary: BriefingSummary | null
  onClick: () => void
}

/** Compute a signal score for ranking items — combines velocity change and recency. */
function itemSignalScore(item: IntelItem): number {
  let score = 0
  if (item.velocity?.changePercent != null) {
    score += Math.min(Math.abs(item.velocity.changePercent), 500) / 5
  }
  if (item.published_at) {
    const ageHours = (Date.now() - new Date(item.published_at).getTime()) / 3600000
    score += Math.max(0, 100 - ageHours * 4)
  }
  return score
}

/** Build aggregate summary text from per-sensor sections matching this group. */
function buildGroupSummary(
  summary: BriefingSummary,
  sensorKeys: string[],
  limit: number,
): string {
  const matching = summary.sections.filter(s => sensorKeys.includes(s.sensor_name))
  const briefs = matching.map(s => s.brief_summary).filter(Boolean)
  if (briefs.length > 0) return briefs.slice(0, limit).join(' ')
  const raw = matching.map(s => s.summary).join(' ')
  const maxChars = limit * 200
  if (raw.length <= maxChars) return raw
  const cut = raw.slice(0, maxChars)
  const endMatch = cut.match(/^([\s\S]*[.!?。！？])\s/)
  return endMatch ? endMatch[1].trim() : cut.trim() + '\u2026'
}

/** Compute aggregate sentiment mood from items. */
function computeSentimentMood(items: IntelItem[]): 'positive' | 'negative' | 'neutral' | 'mixed' | null {
  let pos = 0, neg = 0, neu = 0
  for (const item of items) {
    if (!item.sentiment) continue
    if (item.sentiment.label === 'positive') pos++
    else if (item.sentiment.label === 'negative') neg++
    else neu++
  }
  const total = pos + neg + neu
  if (total === 0) return null
  if (pos > neg * 2 && pos > neu) return 'positive'
  if (neg > pos * 2 && neg > neu) return 'negative'
  if (pos > 0 && neg > 0 && Math.abs(pos - neg) < total * 0.2) return 'mixed'
  return 'neutral'
}

const MOOD_COLORS: Record<string, string> = {
  positive: 'var(--sent-pos)',
  negative: 'var(--sent-neg)',
  neutral: 'var(--sent-neu)',
  mixed: '#e6a23c',
}

export function GroupIntelCard({ group, items, summary, onClick }: GroupIntelCardProps) {
  const { t } = useTranslation()

  const sensorKeys = group.sensors
  const summaryText = summary ? buildGroupSummary(summary, sensorKeys, 2) : ''
  const topItems = [...items].sort((a, b) => itemSignalScore(b) - itemSignalScore(a)).slice(0, 3)

  const mood = group.sentiment_enabled ? computeSentimentMood(items) : null

  const analysisBadges: { key: string; label: string }[] = []
  if (group.trend_enabled) analysisBadges.push({ key: 'trend', label: t('dashboard.analysis_trend') })
  if (group.topic_enabled) analysisBadges.push({ key: 'topic', label: t('dashboard.analysis_topic') })
  if (group.social_enabled) analysisBadges.push({ key: 'social', label: t('dashboard.analysis_social') })
  if (group.sentiment_enabled) analysisBadges.push({ key: 'sentiment', label: t('dashboard.analysis_sentiment') })

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-card)',
        padding: '0.75rem 1rem',
        boxShadow: 'var(--shadow-card)',
        transition: 'box-shadow 200ms, border-color 200ms',
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card-hover)'
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card)'
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
      }}
    >
      {/* Header row: color dot, group name, sensor count pill, sentiment mood */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: 0 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: group.color,
          }} />
          <span style={{
            fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase' as const, color: group.color,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {group.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
          <span style={{
            fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 600,
            background: 'var(--surface-alt)', borderRadius: 4,
            padding: '1px 5px', color: 'var(--ink-faint)',
          }}>
            {t('dashboard.group_sources', { n: sensorKeys.length })}
          </span>
          {mood && (
            <span style={{
              fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700,
              padding: '1px 5px', borderRadius: 3,
              background: `color-mix(in srgb, ${MOOD_COLORS[mood]} 15%, transparent)`,
              color: MOOD_COLORS[mood],
              textTransform: 'uppercase' as const,
            }}>
              {t('sentiment.' + mood)}
            </span>
          )}
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-tertiary)', lineHeight: 1 }}>&#8250;</span>
        </div>
      </div>

      {/* Group summary or item count fallback */}
      {summaryText ? (
        <p style={{
          fontSize: '0.6875rem', color: 'var(--ink-secondary)', lineHeight: 1.5, margin: 0,
          overflowWrap: 'break-word', wordBreak: 'break-word',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {summaryText}
        </p>
      ) : (
        <p style={{ fontSize: '0.6875rem', color: 'var(--ink-tertiary)', lineHeight: 1.5, margin: 0 }}>
          {items.length > 0
            ? t('dashboard.group_items', { n: items.length })
            : t('dashboard.no_summary_yet')
          }
        </p>
      )}

      {/* Top 3 items */}
      {topItems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {topItems.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'baseline', gap: '0.375rem',
              padding: '2px 0',
            }}>
              <span style={{
                width: 3, height: 3, borderRadius: '50%', background: group.color,
                flexShrink: 0, marginTop: 5,
                alignSelf: 'flex-start',
              }} />
              <span style={{
                fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink)',
                lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1, minWidth: 0,
              }}>
                {item.title}
              </span>
              <span style={{
                fontFamily: MONO, fontSize: '0.5rem', color: 'var(--ink-disabled)',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}>
                {SENSOR_LABELS[item.source] ?? item.source}
              </span>
              {item.sentiment && (
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  background: item.sentiment.label === 'positive' ? 'var(--sent-pos)'
                    : item.sentiment.label === 'negative' ? 'var(--sent-neg)'
                    : 'var(--sent-neu)',
                }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Analysis badges row */}
      {analysisBadges.length > 0 && (
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: 2 }}>
          {analysisBadges.map(badge => (
            <span key={badge.key} style={{
              fontFamily: MONO, fontSize: '0.5rem', fontWeight: 600,
              padding: '1px 5px', borderRadius: 3,
              background: 'var(--surface-inset)', color: 'var(--ink-disabled)',
              letterSpacing: '0.04em', textTransform: 'uppercase' as const,
            }}>
              {badge.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
