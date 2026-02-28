// ABOUTME: Slide-in detail panel for a source group — shows full summary, analysis, sensor breakdown, and all items.
// ABOUTME: Opens from the right side when a GroupIntelCard is clicked; uses framer-motion for animation.
'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { SourceGroupTree } from '@/lib/groups/types'
import type { IntelItem, BriefingSummary, IntelligenceReport } from '@/api/client'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'
import { useTranslation } from '@/lib/i18n'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export interface GroupDetailPanelProps {
  group: SourceGroupTree
  items: IntelItem[]
  summary: BriefingSummary | null
  intelligence: IntelligenceReport | null
  onClose: () => void
}

/** Build full summary text from per-sensor sections matching this group. */
function buildFullGroupSummary(
  summary: BriefingSummary,
  sensorKeys: string[],
): string {
  const matching = summary.sections.filter(s => sensorKeys.includes(s.sensor_name))
  return matching.map(s => s.summary).join(' ')
}

/** Compute sentiment distribution from items. */
function computeSentimentDistribution(items: IntelItem[]): {
  positive: number; negative: number; neutral: number; total: number
} {
  let positive = 0, negative = 0, neutral = 0
  for (const item of items) {
    if (!item.sentiment) continue
    if (item.sentiment.label === 'positive') positive++
    else if (item.sentiment.label === 'negative') negative++
    else neutral++
  }
  return { positive, negative, neutral, total: positive + negative + neutral }
}

/** Format a relative time string from an ISO timestamp. */
function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function GroupDetailPanel({ group, items, summary, intelligence, onClose }: GroupDetailPanelProps) {
  const { t } = useTranslation()
  const sensorKeys = group.sensors

  const fullSummary = summary ? buildFullGroupSummary(summary, sensorKeys) : ''
  const matchingSections = summary?.sections.filter(s => sensorKeys.includes(s.sensor_name)) ?? []
  const hasAnalysis = group.trend_enabled || group.topic_enabled || group.social_enabled || group.sentiment_enabled

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll while panel is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
      />
      {/* Panel */}
      <motion.div
        className="slide-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 560, maxWidth: '100vw',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          zIndex: 101,
          padding: '1.5rem',
          paddingBottom: 0,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              background: group.color,
            }} />
            <span style={{
              fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase' as const, color: group.color,
            }}>
              {group.name}
            </span>
            <span style={{
              fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 600,
              background: 'var(--surface-alt)', borderRadius: 4,
              padding: '1px 5px', color: 'var(--ink-faint)',
              marginLeft: 4,
            }}>
              {t('dashboard.group_sources', { n: sensorKeys.length })}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface-inset)', color: 'var(--ink-tertiary)',
              fontSize: '1rem', lineHeight: 1, border: 'none', cursor: 'pointer',
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--ink)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-inset)'; e.currentTarget.style.color = 'var(--ink-tertiary)' }}
          >
            &times;
          </button>
        </div>

        {/* Scrollable content — header stays fixed above */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch' as never,
          overscrollBehavior: 'contain',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
          paddingBottom: '1.5rem', marginTop: '0.75rem',
        }}>

        {/* Group summary */}
        {fullSummary && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: 8,
            background: `color-mix(in srgb, ${group.color} 8%, var(--surface))`,
            border: `1px solid color-mix(in srgb, ${group.color} 15%, transparent)`,
          }}>
            <p style={{
              fontSize: '0.8125rem', color: 'var(--ink)', lineHeight: 1.7, margin: 0,
              overflowWrap: 'break-word', wordBreak: 'break-word',
            }}>
              {fullSummary}
            </p>
          </div>
        )}

        {/* Analysis section */}
        {hasAnalysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {/* Trend intelligence */}
            {group.trend_enabled && intelligence?.trend && (
              <AnalysisBlock
                label={t('dashboard.analysis_trend')}
                color={group.color}
              >
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {intelligence.trend.summary}
                </p>
                {intelligence.trend.topics.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.375rem' }}>
                    {intelligence.trend.topics
                      .filter(topic => topic.sources.some(s => sensorKeys.includes(s)))
                      .slice(0, 6)
                      .map(topic => (
                        <span key={topic.name} style={{
                          fontFamily: MONO, fontSize: '0.5625rem',
                          padding: '2px 6px', borderRadius: 3,
                          background: 'var(--surface-inset)', color: 'var(--ink-faint)',
                        }}>
                          {topic.name}
                        </span>
                      ))
                    }
                  </div>
                )}
              </AnalysisBlock>
            )}

            {/* Topic intelligence */}
            {group.topic_enabled && intelligence?.topics && (
              <AnalysisBlock
                label={t('dashboard.analysis_topic')}
                color={group.color}
              >
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {intelligence.topics.summary}
                </p>
                {intelligence.topics.topics.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.375rem' }}>
                    {intelligence.topics.topics.slice(0, 5).map(topic => (
                      <div key={topic.topic} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <SentimentDot sentiment={topic.sentiment} />
                        <span style={{ fontSize: '0.6875rem', color: 'var(--ink)', fontWeight: 500 }}>
                          {topic.topic}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: '0.5rem', color: 'var(--ink-disabled)' }}>
                          {topic.postCount}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </AnalysisBlock>
            )}

            {/* Social / accounts intelligence */}
            {group.social_enabled && intelligence?.accounts && (
              <AnalysisBlock
                label={t('dashboard.analysis_social')}
                color={group.color}
              >
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {intelligence.accounts.summary}
                </p>
                {intelligence.accounts.accounts.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.375rem' }}>
                    {intelligence.accounts.accounts.slice(0, 5).map(acct => (
                      <div key={acct.handle} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <SentimentDot sentiment={acct.sentiment} />
                        <span style={{ fontSize: '0.6875rem', color: 'var(--ink)', fontWeight: 500 }}>
                          {acct.account}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: '0.5rem', color: 'var(--ink-disabled)' }}>
                          @{acct.handle}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </AnalysisBlock>
            )}

            {/* Sentiment distribution */}
            {group.sentiment_enabled && (() => {
              const dist = computeSentimentDistribution(items)
              if (dist.total === 0) return null
              const posPct = Math.round((dist.positive / dist.total) * 100)
              const negPct = Math.round((dist.negative / dist.total) * 100)
              const neuPct = 100 - posPct - negPct
              return (
                <AnalysisBlock
                  label={t('dashboard.analysis_sentiment')}
                  color={group.color}
                >
                  <div style={{ display: 'flex', gap: 8, fontFamily: MONO, fontSize: '0.625rem', color: 'var(--ink-tertiary)', marginBottom: 4 }}>
                    <span style={{ color: 'var(--sent-pos-text)' }}>{dist.positive} ({posPct}%) {t('dash.pos')}</span>
                    <span>{dist.neutral} ({neuPct}%) {t('dash.neu')}</span>
                    <span style={{ color: 'var(--sent-neg-text)' }}>{dist.negative} ({negPct}%) {t('dash.neg')}</span>
                  </div>
                  <div style={{ display: 'flex', overflow: 'hidden', height: 6, borderRadius: 3, background: 'var(--border-subtle)', gap: 1 }}>
                    {posPct > 0 && <div style={{ width: `${posPct}%`, background: 'var(--sent-pos)', transition: 'width 400ms ease' }} />}
                    {neuPct > 0 && <div style={{ width: `${neuPct}%`, background: 'var(--sent-neu)', opacity: 0.4, transition: 'width 400ms ease' }} />}
                    {negPct > 0 && <div style={{ width: `${negPct}%`, background: 'var(--sent-neg)', transition: 'width 400ms ease' }} />}
                  </div>
                </AnalysisBlock>
              )
            })()}
          </div>
        )}

        {/* Per-sensor breakdown */}
        {matchingSections.length > 0 && (
          <>
            <div style={{ borderBottom: '1px solid var(--border)', marginTop: '0.25rem' }} />
            <SectionLabel color={group.color}>{t('dashboard.sensor_breakdown')}</SectionLabel>
            {matchingSections.map((section, idx) => (
              <div key={section.sensor_name} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {/* Sensor header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                }}>
                  <span style={{
                    fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 700,
                    padding: '2px 6px', borderRadius: 3,
                    background: 'var(--surface-inset)', color: 'var(--ink-faint)',
                    letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                  }}>
                    {SENSOR_LABELS[section.sensor_name] ?? section.sensor_name}
                  </span>
                  <span style={{
                    fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 600,
                    background: 'var(--surface-alt)', borderRadius: 4,
                    padding: '1px 5px', color: 'var(--ink-faint)',
                  }}>
                    {section.item_count}
                  </span>
                </div>
                {/* Brief summary */}
                <p style={{
                  fontSize: '0.75rem', color: 'var(--ink-secondary)', lineHeight: 1.6, margin: 0,
                  overflowWrap: 'break-word', wordBreak: 'break-word',
                }}>
                  {section.brief_summary ?? section.summary}
                </p>
                {idx < matchingSections.length - 1 && (
                  <div style={{ borderBottom: '1px solid var(--border-subtle)', marginTop: 2 }} />
                )}
              </div>
            ))}
          </>
        )}

        {/* All items list */}
        {items.length > 0 && (
          <>
            <div style={{ borderBottom: '1px solid var(--border)', marginTop: '0.25rem' }} />
            <SectionLabel color={group.color}>
              {t('dashboard.all_items')} ({items.length})
            </SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {items.map(item => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', gap: '0.5rem', textDecoration: 'none',
                    borderRadius: 6, padding: '6px 10px', margin: '0 -10px',
                    transition: 'background 150ms ease',
                    alignItems: 'flex-start',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                >
                  <span style={{
                    width: 4, height: 4, borderRadius: '50%', background: group.color,
                    flexShrink: 0, marginTop: 6,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.5,
                      overflowWrap: 'break-word', wordBreak: 'break-word',
                    }}>
                      {item.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: 2 }}>
                      {/* Source chip */}
                      <span style={{
                        fontFamily: MONO, fontSize: '0.5rem', fontWeight: 600,
                        padding: '1px 4px', borderRadius: 3,
                        background: 'var(--surface-inset)', color: 'var(--ink-disabled)',
                        letterSpacing: '0.04em',
                      }}>
                        {SENSOR_LABELS[item.source] ?? item.source}
                      </span>
                      {/* Sentiment chip */}
                      {item.sentiment && (
                        <span style={{
                          fontFamily: MONO, fontSize: '0.5rem', fontWeight: 600,
                          padding: '1px 4px', borderRadius: 3,
                          background: item.sentiment.label === 'positive' ? 'var(--sent-pos-bg)'
                            : item.sentiment.label === 'negative' ? 'var(--sent-neg-bg)'
                            : 'var(--sent-neu-bg)',
                          color: item.sentiment.label === 'positive' ? 'var(--sent-pos-text)'
                            : item.sentiment.label === 'negative' ? 'var(--sent-neg-text)'
                            : 'var(--sent-neu-text)',
                        }}>
                          {item.sentiment.label}
                        </span>
                      )}
                      {/* Velocity */}
                      {item.velocity?.changePercent != null && (
                        <span style={{
                          fontFamily: MONO, fontSize: '0.5rem', color: 'var(--ink-disabled)',
                        }}>
                          {item.velocity.changePercent > 0 ? '+' : ''}{Math.round(item.velocity.changePercent)}%
                        </span>
                      )}
                      {/* Published time */}
                      {item.published_at && (
                        <span style={{
                          fontFamily: MONO, fontSize: '0.5rem', color: 'var(--ink-disabled)',
                        }}>
                          {formatTimeAgo(item.published_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {items.length === 0 && matchingSections.length === 0 && (
          <div style={{ padding: '2rem 0', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-tertiary)' }}>
            {t('dash.no_domain_data')}
          </div>
        )}
        </div>{/* end scrollable content */}
      </motion.div>
    </>
  )
}

/** Wrapper exported with AnimatePresence for controlled mount/unmount. */
export function GroupDetailPanelAnimated(props: GroupDetailPanelProps & { open: boolean }) {
  const { open, ...panelProps } = props
  return (
    <AnimatePresence>
      {open && <GroupDetailPanel {...panelProps} />}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Internal helper components
// ---------------------------------------------------------------------------

/** Section label with optional status dot — mirrors Dashboard.tsx SectionLabel. */
function SectionLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      fontSize: '0.6875rem',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
      color: color ?? 'var(--ink-faint)',
    }}>
      {children}
    </div>
  )
}

/** Labeled analysis block with subtle border. */
function AnalysisBlock({ label, color, children }: {
  label: string; color: string; children: React.ReactNode
}) {
  return (
    <div style={{
      padding: '0.5rem 0.75rem',
      borderRadius: 6,
      border: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <div style={{
        fontFamily: MONO, fontSize: '0.5rem', fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase' as const,
        color, marginBottom: '0.375rem',
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

/** Small colored dot for sentiment indicators. */
function SentimentDot({ sentiment }: { sentiment: string }) {
  const bg = sentiment === 'positive' ? 'var(--sent-pos)'
    : sentiment === 'negative' ? 'var(--sent-neg)'
    : sentiment === 'mixed' ? '#e6a23c'
    : 'var(--sent-neu)'
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: bg, flexShrink: 0 }} />
}
