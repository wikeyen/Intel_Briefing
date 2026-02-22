// ABOUTME: Dashboard home page — fluid grid data terminal with sentiment, trending, heatmap, risk/intel panel.
// ABOUTME: Grafana-style tile layout with responsive 3-col / 4-col breakpoints and Framer Motion animations.
'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/api/client'
import type { IntelReport, IntelItem, BriefingSummary, PipelineStatus, SummaryProgress, OverallBriefing, BriefingSource, SentimentEntry } from '@/api/client'
import { SENSOR_LABELS, SENSOR_DISPLAY_MAP, CATEGORY_TO_DISPLAY } from '@/lib/sensors/taxonomy'
import type { CategoryKey, DisplayCategoryKey } from '@/lib/sensors/taxonomy'
import { Skeleton, SkeletonCard } from './Skeleton'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function isStructuredOverall(overall: OverallBriefing | string): overall is OverallBriefing {
  return typeof overall === 'object' && overall !== null && 'executive_summary' in overall
}

/** Resolve an item's display category using per-sensor map with category fallback. */
function displayCategoryOf(item: IntelItem, sectionKey: string): DisplayCategoryKey {
  return SENSOR_DISPLAY_MAP[item.source] ?? CATEGORY_TO_DISPLAY[sectionKey as CategoryKey] ?? 'news'
}

/** Render text with inline [N] citation markers as superscript links. */
function InlineRefs({ text, globalSources }: { text: string; globalSources?: BriefingSource[] }) {
  if (!globalSources || globalSources.length === 0 || !/\[\d+\]/.test(text)) {
    return <>{text}</>
  }
  const parts: React.ReactNode[] = []
  const segments = text.split(/(\[\d+\])/)
  let key = 0
  for (const segment of segments) {
    const match = segment.match(/^\[(\d+)\]$/)
    if (match) {
      const num = parseInt(match[1], 10)
      const source = globalSources.find(s => s.id === num)
      if (source) {
        parts.push(
          <a
            key={`ref-${key++}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title}
            style={{
              fontSize: '0.5625rem',
              fontWeight: 600,
              color: 'var(--accent)',
              verticalAlign: 'super',
              marginLeft: '0.125rem',
              lineHeight: 1,
              textDecoration: 'none',
            }}
          >
            [{num}]
          </a>,
        )
      } else {
        parts.push(<span key={`ref-${key++}`}>{segment}</span>)
      }
    } else if (segment) {
      parts.push(<span key={`text-${key++}`}>{segment}</span>)
    }
  }
  return <>{parts}</>
}

const PULSE_CSS = `
@keyframes pulseDot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
`

/** Section label — consistent uppercase treatment across all widgets. */
function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: '0.625rem',
      fontWeight: 700,
      color: 'var(--ink-faint)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      ...style,
    }}>
      {children}
    </div>
  )
}

/** Stagger-fade each dashboard widget on mount. */
function StaggerChild({ index, children, className }: { index: number; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        delay: index * 0.06,
      }}
    >
      {children}
    </motion.div>
  )
}

/** Standard card chrome shared by all widget panels. */
const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
  boxShadow: 'var(--shadow-xs)',
}

/** Social platform set for sentiment computation. */
const SOCIAL = new Set(['x', 'bluesky', 'mastodon', 'weibo', 'xiaohongshu'])

// ---------------------------------------------------------------------------
// Widget: Status Ticker Bar
// ---------------------------------------------------------------------------

function StatusTicker({ report, summary, pipelineStatus, summaryProgress }: {
  report: IntelReport | null
  summary: BriefingSummary | null
  pipelineStatus: PipelineStatus | null
  summaryProgress: SummaryProgress | null
}) {
  const isActive = !!(summaryProgress?.running) || !!(pipelineStatus?.running && pipelineStatus.alive !== false)

  const allItems: IntelItem[] = report ? Object.values(report.items).flat() : []
  const sourcesOk = report ? report.sources_ok.length : 0
  const sourcesTotal = report ? report.sources_ok.length + report.sources_failed.length : 0

  const overall = summary?.overall
  const mood = overall && isStructuredOverall(overall) ? overall.sentiment?.overall_mood : null
  const riskCount = overall && isStructuredOverall(overall) ? (overall.sentiment?.risk_flags?.length ?? 0) : 0

  const moodColors: Record<string, string> = {
    bullish: 'var(--ok)',
    bearish: 'var(--err)',
    mixed: 'var(--warn)',
    neutral: 'var(--ink-faint)',
  }

  return (
    <div className="dashboard-ticker" style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1.25rem',
      padding: '0.5rem 1.25rem',
      background: 'var(--surface-alt)',
      borderRadius: 10,
      fontSize: '0.6875rem',
      fontFamily: 'ui-monospace, monospace',
      color: 'var(--ink-faint)',
      flexWrap: 'nowrap',
      overflow: 'hidden',
    }}>
      {/* Pipeline state */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isActive ? 'var(--accent)' : 'var(--ink-faint)',
          animation: isActive ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
        }} />
        <span style={{ color: isActive ? 'var(--accent)' : 'var(--ink-faint)', fontWeight: 600 }}>
          {isActive ? 'Updating' : 'Idle'}
        </span>
      </span>

      <span style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />

      {/* Last fetch */}
      <span className="dashboard-ticker-hide-mobile" style={{ flexShrink: 0 }}>
        {report ? `Fetched ${timeAgo(report.fetched_at)}` : 'No data'}
      </span>

      {/* Last summary */}
      {summary && (
        <span className="dashboard-ticker-hide-mobile" style={{ flexShrink: 0 }}>
          Summary {timeAgo(summary.generated_at)}
        </span>
      )}

      <span style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />

      {/* Sources */}
      <span style={{ flexShrink: 0 }}>
        <span style={{ color: sourcesOk === sourcesTotal ? 'var(--ok)' : 'var(--warn)' }}>
          {sourcesOk}/{sourcesTotal}
        </span>
        {' '}sources
      </span>

      {/* Items */}
      <span className="dashboard-ticker-hide-mobile" style={{ flexShrink: 0 }}>
        {allItems.length} items
      </span>

      {/* Mood */}
      {mood && (
        <>
          <span style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: moodColors[mood] ?? 'var(--ink-faint)',
            }} />
            <span style={{
              color: moodColors[mood] ?? 'var(--ink-faint)',
              fontWeight: 600,
              textTransform: 'capitalize',
            }}>
              {mood}
            </span>
          </span>
        </>
      )}

      {/* Risk flags */}
      {riskCount > 0 && (
        <span style={{
          background: 'var(--err-tint)',
          color: 'var(--err)',
          fontWeight: 700,
          padding: '0.125rem 0.4375rem',
          borderRadius: 3,
          flexShrink: 0,
        }}>
          {riskCount} risk{riskCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget: Stats Strip
// ---------------------------------------------------------------------------

function StatsStrip({ report, summary }: { report: IntelReport | null; summary: BriefingSummary | null }) {
  const totalItems = report ? Object.values(report.items).flat().length : 0
  const sourcesOk = report ? report.sources_ok.length : 0

  const allItems: IntelItem[] = report ? Object.values(report.items).flat() : []
  const withSentiment = allItems.filter(i => SOCIAL.has(i.source) && i.sentiment)
  const positiveCount = withSentiment.filter(i => i.sentiment!.label === 'positive').length
  const positivePct = withSentiment.length > 0 ? Math.round((positiveCount / withSentiment.length) * 100) : null

  const overall = summary?.overall
  const mood = overall && isStructuredOverall(overall) ? overall.sentiment?.overall_mood : null
  const moodColors: Record<string, string> = {
    bullish: 'var(--ok)',
    bearish: 'var(--err)',
    mixed: 'var(--warn)',
    neutral: 'var(--ink-faint)',
  }

  const stats: { value: string; label: string; color?: string }[] = [
    { value: totalItems.toLocaleString(), label: 'Items' },
    { value: String(sourcesOk), label: 'Sources' },
    { value: positivePct != null ? `${positivePct}%` : '--', label: 'Positive' },
    { value: mood ?? '--', label: 'Mood', color: mood ? moodColors[mood] : undefined },
  ]

  return (
    <div className="dashboard-stats-strip" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      background: 'var(--surface)',
      borderRadius: 12,
      border: '1px solid var(--border)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-xs)',
    }}>
      {stats.map((stat, i) => (
        <div key={stat.label} className="stat-cell" style={{
          padding: '1.125rem 1.25rem',
          borderRight: i < 3 ? '1px solid var(--border-soft)' : 'none',
          textAlign: 'center',
        }}>
          <motion.div
            key={stat.value}
            className="stat-value"
            initial={{ opacity: 0.4, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: stat.color ?? 'var(--ink)',
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              fontFamily: stat.label === 'Mood' ? 'inherit' : 'ui-monospace, monospace',
              textTransform: stat.label === 'Mood' ? 'capitalize' : 'none',
            }}
          >
            {stat.value}
          </motion.div>
          <div style={{
            fontSize: '0.5625rem',
            fontWeight: 600,
            color: 'var(--ink-faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginTop: '0.25rem',
          }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget: Executive Summary
// ---------------------------------------------------------------------------

function ExecSummaryWidget({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall) || !overall.executive_summary) return null

  return (
    <div style={{
      background: 'var(--accent-wash)',
      borderLeft: '3px solid var(--accent)',
      borderRadius: '0 12px 12px 0',
      padding: '1.25rem 1.5rem',
    }}>
      <SectionLabel style={{ color: 'var(--accent)', marginBottom: '0.75rem' }}>
        Executive Summary
      </SectionLabel>
      <div style={{
        fontSize: '0.875rem',
        color: 'var(--ink)',
        lineHeight: 1.8,
        whiteSpace: 'pre-wrap',
      }}>
        <InlineRefs text={overall.executive_summary} globalSources={overall.sources} />
      </div>
      {overall.quick_scan && overall.quick_scan.length > 0 && (
        <div style={{ marginTop: '1rem', paddingTop: '0.875rem', borderTop: '1px solid var(--accent-dim)' }}>
          <SectionLabel style={{ color: 'var(--accent)', marginBottom: '0.5rem' }}>
            Quick Scan
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {overall.quick_scan.map((entry, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: '0.5rem',
                fontSize: '0.8125rem',
                color: 'var(--ink)',
                lineHeight: 1.6,
              }}>
                <span style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  flexShrink: 0,
                  marginTop: '0.5rem',
                }} />
                <span><InlineRefs text={entry.text} globalSources={overall.sources} /></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget: Risk & Intelligence Panel (tabbed)
// ---------------------------------------------------------------------------

function RiskIntelPanel({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall)) return null
  const sentiment = overall.sentiment
  if (!sentiment) return null

  const tabs = [
    { key: 'risk', label: 'Risk', items: sentiment.risk_flags ?? [], color: 'var(--err)' },
    { key: 'controversies', label: 'Controversies', items: sentiment.controversies ?? [], color: 'var(--warn)' },
    { key: 'shifts', label: 'Shifts', items: sentiment.opinion_shifts ?? [], color: 'var(--accent)' },
  ] as const

  const totalAlerts = tabs.reduce((n, t) => n + t.items.length, 0)

  const [activeTab, setActiveTab] = useState(
    // Default to the first tab that has items, or 'risk'
    () => tabs.find(t => t.items.length > 0)?.key ?? 'risk'
  )

  const active = tabs.find(t => t.key === activeTab)!

  return (
    <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Intelligence</SectionLabel>
        {totalAlerts > 0 && (
          <span style={{
            fontSize: '0.5625rem', fontWeight: 700,
            color: sentiment.risk_flags?.length ? 'var(--err)' : 'var(--ink-faint)',
            fontFamily: 'ui-monospace, monospace',
          }}>
            {totalAlerts} alert{totalAlerts !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: activeTab === tab.key ? 'var(--ink)' : 'var(--ink-faint)',
              borderBottom: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
              marginBottom: -1,
              transition: 'color 150ms, border-color 150ms',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {tab.label}
            {tab.items.length > 0 && (
              <span style={{
                marginLeft: '0.25rem',
                fontSize: '0.5rem',
                fontFamily: 'ui-monospace, monospace',
                color: tab.color,
              }}>
                {tab.items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 60 }}>
        {active.items.length === 0 ? (
          <div style={{
            fontSize: '0.75rem', color: 'var(--ink-faint)',
            padding: '1rem 0', textAlign: 'center',
          }}>
            None detected
          </div>
        ) : (
          active.items.map((entry: SentimentEntry, i: number) => (
            <div key={i} style={{
              padding: '0.5rem 0',
              borderBottom: i < active.items.length - 1 ? '1px dotted var(--border-soft)' : 'none',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                marginBottom: '0.25rem',
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: active.color, flexShrink: 0,
                }} />
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink)' }}>
                  {entry.topic}
                </span>
              </div>
              <div style={{
                fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.6,
                paddingLeft: '1.125rem',
              }}>
                <InlineRefs text={entry.analysis} globalSources={overall.sources} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget: Sentiment Ring Gauge (SVG)
// ---------------------------------------------------------------------------

function SentimentRing({ positive, neutral, negative, size = 140 }: {
  positive: number; neutral: number; negative: number; size?: number
}) {
  const total = positive + neutral + negative
  if (total === 0) return null

  const posPct = positive / total
  const neuPct = neutral / total

  const circumference = 2 * Math.PI * 45

  const posArc = posPct * circumference
  const neuArc = neuPct * circumference
  const negArc = circumference - posArc - neuArc

  // Start at top (12 o'clock position)
  const posOffset = circumference * 0.25
  const neuOffset = posOffset - posArc
  const negOffset = neuOffset - neuArc

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }}
      role="img" aria-label={`Sentiment: ${Math.round(posPct * 100)}% positive, ${Math.round(neuPct * 100)}% neutral, ${Math.round((1 - posPct - neuPct) * 100)}% negative`}>
      {/* Track */}
      <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="8" />
      {/* Positive segment */}
      {posArc > 0 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--ok)" strokeWidth="8"
          strokeDasharray={`${posArc} ${circumference - posArc}`}
          strokeDashoffset={posOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      {/* Neutral segment */}
      {neuArc > 0.5 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--ink-faint)" strokeWidth="8"
          strokeDasharray={`${neuArc} ${circumference - neuArc}`}
          strokeDashoffset={neuOffset}
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      {/* Negative segment */}
      {negArc > 0.5 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--err)" strokeWidth="8"
          strokeDasharray={`${negArc} ${circumference - negArc}`}
          strokeDashoffset={negOffset}
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      {/* Center percentage */}
      <text x="50" y="47" textAnchor="middle" dominantBaseline="central" fill="var(--ink)"
        style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
        {Math.round(posPct * 100)}%
      </text>
      <text x="50" y="62" textAnchor="middle" fill="var(--ink-faint)"
        style={{ fontSize: '0.4375rem', fontWeight: 600, letterSpacing: '0.08em' }}>
        POSITIVE
      </text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Widget: Sentiment Overview (with ring gauge)
// ---------------------------------------------------------------------------

function SentimentWidget({ summary, report }: { summary: BriefingSummary; report: IntelReport | null }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall)) return null
  const sentiment = overall.sentiment
  if (!sentiment) return null

  const moodColors: Record<string, string> = {
    bullish: 'var(--ok)',
    bearish: 'var(--err)',
    mixed: 'var(--warn)',
    neutral: 'var(--ink-faint)',
  }

  const allItems: IntelItem[] = report ? Object.values(report.items).flat() : []
  const socialWithSentiment = allItems.filter(i => SOCIAL.has(i.source) && i.sentiment)

  // Aggregate counts for ring gauge
  let totalPos = 0, totalNeu = 0, totalNeg = 0
  const bySource: Record<string, { positive: number; negative: number; neutral: number; total: number }> = {}
  for (const item of socialWithSentiment) {
    const label = item.sentiment!.label
    if (label === 'positive') totalPos++
    else if (label === 'neutral') totalNeu++
    else totalNeg++
    if (!bySource[item.source]) bySource[item.source] = { positive: 0, negative: 0, neutral: 0, total: 0 }
    bySource[item.source][label]++
    bySource[item.source].total++
  }

  // Brand colors — intentionally static, meet WCAG AA on both light/dark surfaces
  const PLATFORM_COLORS: Record<string, string> = {
    x: 'var(--ink)',
    bluesky: '#0085FF',
    mastodon: '#6364FF',
  }

  return (
    <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header: mood indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Sentiment</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: moodColors[sentiment.overall_mood] ?? 'var(--ink-faint)',
          }} />
          <span style={{
            fontSize: '0.75rem', fontWeight: 700,
            color: moodColors[sentiment.overall_mood] ?? 'var(--ink-faint)',
            textTransform: 'capitalize',
          }}>
            {sentiment.overall_mood}
          </span>
        </div>
      </div>

      {/* Ring gauge + mood summary row */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <SentimentRing positive={totalPos} neutral={totalNeu} negative={totalNeg} size={100} />
        {sentiment.mood_summary && (
          <p style={{
            fontSize: '0.75rem', color: 'var(--ink)', lineHeight: 1.65,
            margin: 0, flex: 1, minWidth: 140,
          }}>
            <InlineRefs text={sentiment.mood_summary} globalSources={overall.sources} />
          </p>
        )}
      </div>

      {/* Per-platform sentiment bars */}
      {Object.keys(bySource).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {Object.entries(bySource).map(([source, counts]) => {
            const posPct = Math.round((counts.positive / counts.total) * 100)
            const negPct = Math.round((counts.negative / counts.total) * 100)
            const neuPct = 100 - posPct - negPct
            return (
              <div key={source}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '0.125rem',
                }}>
                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 500,
                    color: PLATFORM_COLORS[source] ?? 'var(--ink-muted)',
                  }}>
                    {SENSOR_LABELS[source] ?? source}
                  </span>
                  <div style={{
                    display: 'flex', gap: '0.5rem',
                    fontSize: '0.5rem', fontFamily: 'ui-monospace, monospace', color: 'var(--ink-faint)',
                  }}>
                    <span style={{ color: 'var(--ok)' }}>{posPct}%</span>
                    <span>{neuPct}%</span>
                    <span style={{ color: 'var(--err)' }}>{negPct}%</span>
                  </div>
                </div>
                <div style={{
                  display: 'flex', height: 3, borderRadius: 2, overflow: 'hidden', background: 'var(--border)',
                }}>
                  {posPct > 0 && (
                    <div title={`${counts.positive} positive (${posPct}%)`}
                      style={{ width: `${posPct}%`, background: 'var(--ok)', transition: 'width 300ms' }} />
                  )}
                  {neuPct > 0 && (
                    <div title={`${counts.neutral} neutral (${neuPct}%)`}
                      style={{ width: `${neuPct}%`, background: 'var(--ink-faint)', transition: 'width 300ms' }} />
                  )}
                  {negPct > 0 && (
                    <div title={`${counts.negative} negative (${negPct}%)`}
                      style={{ width: `${negPct}%`, background: 'var(--err)', transition: 'width 300ms' }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget: Category Distribution Bar
// ---------------------------------------------------------------------------

function CategoryDistributionWidget({ report }: { report: IntelReport }) {
  const counts: Record<string, number> = { 'high-trust': 0, news: 0, trend: 0, opinions: 0 }
  for (const [cat, items] of Object.entries(report.items)) {
    for (const item of items) {
      const dc = displayCategoryOf(item, cat)
      counts[dc] = (counts[dc] || 0) + 1
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const segments: { key: string; label: string; count: number; color: string }[] = [
    { key: 'high-trust', label: 'Research', count: counts['high-trust'], color: 'var(--cat-research)' },
    { key: 'news', label: 'News', count: counts.news, color: 'var(--cat-news)' },
    { key: 'trend', label: 'Trend', count: counts.trend, color: 'var(--cat-trend)' },
    { key: 'opinions', label: 'Opinion', count: counts.opinions, color: 'var(--cat-opinion)' },
  ]

  return (
    <div style={CARD}>
      <SectionLabel style={{ marginBottom: '0.75rem' }}>Distribution</SectionLabel>
      {/* Segmented bar */}
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
        {segments.map(seg => seg.count > 0 ? (
          <div key={seg.key} style={{
            width: `${(seg.count / total) * 100}%`,
            background: seg.color,
            transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        ) : null)}
      </div>
      {/* Legend */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '0.25rem 0.75rem', marginTop: '0.625rem',
      }}>
        {segments.map(seg => (
          <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: seg.color, flexShrink: 0,
            }} />
            <span style={{ fontSize: '0.625rem', fontWeight: 500, color: 'var(--ink-muted)' }}>
              {seg.label}
            </span>
            <span style={{
              fontSize: '0.625rem', fontWeight: 600, color: 'var(--ink)',
              fontFamily: 'ui-monospace, monospace', marginLeft: 'auto',
            }}>
              {seg.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget: Source Activity Heatmap
// ---------------------------------------------------------------------------

function SourceActivityWidget({ report }: { report: IntelReport }) {
  // Group items by source and hour
  const sourceHours: Record<string, number[]> = {}
  for (const items of Object.values(report.items)) {
    for (const item of items) {
      if (!sourceHours[item.source]) sourceHours[item.source] = new Array(24).fill(0)
      const hour = item.published_at
        ? new Date(item.published_at).getHours()
        : new Date(report.fetched_at).getHours()
      sourceHours[item.source][hour]++
    }
  }

  // Sort sources by total items, take top 8
  const sorted = Object.entries(sourceHours)
    .map(([source, hours]) => ({ source, hours, total: hours.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  if (sorted.length === 0) return null

  const cellColor = (count: number): string => {
    if (count === 0) return 'var(--border-soft)'
    if (count <= 5) return 'var(--accent-lo)'
    if (count <= 15) return 'var(--accent-mid)'
    return 'var(--accent)'
  }

  return (
    <div style={CARD}>
      <SectionLabel style={{ marginBottom: '0.625rem' }}>Source Activity (24h)</SectionLabel>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 320 }}>
          {sorted.map(({ source, hours }) => (
            <div key={source} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 56, fontSize: '0.5rem', fontWeight: 600,
                color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {(SENSOR_LABELS[source] ?? source).slice(0, 8)}
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2, flex: 1 }}>
                {hours.map((count, h) => (
                  <div key={h} title={`${SENSOR_LABELS[source] ?? source} — ${h}:00: ${count} items`}
                    style={{
                      width: '100%', aspectRatio: '1', minWidth: 5,
                      borderRadius: 2, background: cellColor(count),
                      transition: 'background 300ms',
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div style={{
        display: 'flex', gap: '0.625rem', marginTop: '0.375rem',
        fontSize: '0.5rem', color: 'var(--ink-faint)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 5, height: 5, borderRadius: 1, background: 'var(--border-soft)' }} /> 0
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 5, height: 5, borderRadius: 1, background: 'var(--accent-lo)' }} /> 1-5
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 5, height: 5, borderRadius: 1, background: 'var(--accent-mid)' }} /> 6-15
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 5, height: 5, borderRadius: 1, background: 'var(--accent)' }} /> 16+
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget: Source Health Dots
// ---------------------------------------------------------------------------

function SourceHealthWidget({ report }: { report: IntelReport }) {
  const okSet = new Set(report.sources_ok)
  const all = [...report.sources_ok, ...report.sources_failed].sort()
  if (all.length === 0) return null

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <SectionLabel>Source Health</SectionLabel>
        <span style={{
          fontSize: '0.5rem', fontFamily: 'ui-monospace, monospace',
          color: 'var(--ink-faint)',
        }}>
          {report.sources_ok.length}/{all.length} ok
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {all.map(source => (
          <div key={source} title={`${SENSOR_LABELS[source] ?? source}: ${okSet.has(source) ? 'OK' : 'Failed'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.1875rem' }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: okSet.has(source) ? 'var(--ok)' : 'var(--err)',
            }} />
            <span style={{
              fontSize: '0.5rem', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace',
            }}>
              {(SENSOR_LABELS[source] ?? source).slice(0, 8)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget: Trending Items
// ---------------------------------------------------------------------------

function TrendingWidget({ report }: { report: IntelReport }) {
  const trendItems: IntelItem[] = []
  for (const [cat, items] of Object.entries(report.items)) {
    for (const item of items) {
      if (displayCategoryOf(item, cat) === 'trend' && item.velocity) {
        trendItems.push(item)
      }
    }
  }

  trendItems.sort((a, b) => {
    const av = Math.abs(a.velocity?.changePercent ?? 0)
    const bv = Math.abs(b.velocity?.changePercent ?? 0)
    return bv - av
  })

  const top = trendItems.slice(0, 8)
  if (top.length === 0) return null

  return (
    <div style={CARD}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '0.625rem',
      }}>
        <SectionLabel>Trending</SectionLabel>
        <Link href="/data" style={{
          fontSize: '0.625rem', fontWeight: 500, color: 'var(--accent)', textDecoration: 'none',
        }}>
          View all &#8250;
        </Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {top.map((item, idx) => {
          const v = item.velocity!
          const pctStr = v.changePercent != null ? `${v.changePercent > 0 ? '+' : ''}${v.changePercent}%` : null
          const pctColor = v.changePercent != null
            ? v.changePercent > 0 ? 'var(--ok)' : v.changePercent < 0 ? 'var(--err)' : 'var(--ink-faint)'
            : 'var(--ink-faint)'
          const displayTitle = item.source === 'github'
            ? item.title.split(' — ')[0]
            : item.title

          return (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: '0.4375rem 0', textDecoration: 'none',
                borderBottom: idx < top.length - 1 ? '1px dotted var(--border-soft)' : 'none',
              }}
            >
              {/* Rank number — top 3 in accent */}
              <span style={{
                fontSize: '0.9375rem', fontWeight: 700,
                color: idx < 3 ? 'var(--accent-dim)' : 'var(--border)',
                width: 20, textAlign: 'right', flexShrink: 0,
                fontFamily: 'ui-monospace, monospace',
              }}>
                {idx + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {displayTitle}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                  fontSize: '0.5rem', color: 'var(--ink-faint)', marginTop: '0.0625rem',
                }}>
                  <span style={{
                    padding: '0 0.25rem', borderRadius: 2,
                    background: 'var(--surface-alt)', fontWeight: 500,
                  }}>
                    {SENSOR_LABELS[item.source] ?? item.source}
                  </span>
                  {item.heat && <span>{item.heat}</span>}
                  {v.hoursOnTrend != null && (
                    <span style={{
                      padding: '0 0.1875rem', borderRadius: 2,
                      background: v.hoursOnTrend <= 6 ? 'var(--cat-trend-tint)' : 'var(--surface-alt)',
                      color: v.hoursOnTrend <= 6 ? 'var(--cat-trend)' : 'var(--ink-faint)',
                      fontWeight: 600,
                    }}>
                      {v.hoursOnTrend}h
                    </span>
                  )}
                </div>
              </div>
              {pctStr && (
                <span style={{
                  fontSize: '0.75rem', fontWeight: 700, color: pctColor,
                  fontFamily: 'ui-monospace, monospace', flexShrink: 0,
                }}>
                  {pctStr}
                </span>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget: Section Summaries (collapsible with AnimatePresence)
// ---------------------------------------------------------------------------

function SectionSummariesWidget({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall)) return null
  const sections = overall.sections
  if (!sections || sections.length === 0) return null

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {sections.map((section, i) => {
        const isOpen = expanded.has(i)
        return (
          <div key={i} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-xs)',
          }}>
            <button
              onClick={() => setExpanded(prev => {
                const next = new Set(prev)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })}
              aria-expanded={isOpen}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '0.75rem 1.25rem',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--ink)', fontSize: '0.75rem', fontWeight: 600, textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{section.title}</span>
                <span style={{
                  fontSize: '0.5rem', fontWeight: 600, color: 'var(--ink-faint)',
                  background: 'var(--surface-alt)', padding: '0.0625rem 0.375rem',
                  borderRadius: 3, fontFamily: 'ui-monospace, monospace',
                }}>
                  {section.entries.length}
                </span>
              </div>
              <span style={{
                fontSize: '0.5625rem', color: 'var(--ink-faint)',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 200ms', display: 'inline-block',
              }}>
                &#9662;
              </span>
            </button>
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ height: { duration: 0.25 }, opacity: { duration: 0.15 } }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{
                    padding: '0 1.25rem 1rem',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                  }}>
                    {section.entries.map((entry, j) => (
                      <div key={j} style={{
                        fontSize: '0.75rem', color: 'var(--ink)', lineHeight: 1.7,
                        paddingLeft: '0.75rem', borderLeft: '2px solid var(--border)',
                      }}>
                        <InlineRefs text={entry.text} globalSources={overall.sources} />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="dashboard-grid">
      {/* Ticker skeleton */}
      <div className="dashboard-span-full" style={{
        background: 'var(--surface-alt)', borderRadius: 10,
        padding: '0.5rem 1.25rem', display: 'flex', gap: '1rem',
      }}>
        <Skeleton width={80} height={10} />
        <Skeleton width={100} height={10} />
        <Skeleton width={60} height={10} />
      </div>
      {/* Stats strip skeleton */}
      <div className="dashboard-span-full" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            padding: '1.125rem 1.25rem',
            borderRight: i < 3 ? '1px solid var(--border-soft)' : 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem',
          }}>
            <Skeleton width={50} height={24} />
            <Skeleton width={36} height={8} />
          </div>
        ))}
      </div>
      {/* Exec summary skeleton */}
      <div className="dashboard-span-2" style={{
        background: 'var(--accent-wash)',
        borderLeft: '3px solid var(--accent-dim)',
        borderRadius: '0 12px 12px 0',
        padding: '1.25rem 1.5rem',
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
      }}>
        <Skeleton width={100} height={10} />
        <Skeleton width="95%" height={12} />
        <Skeleton width="100%" height={12} />
        <Skeleton width="70%" height={12} />
      </div>
      {/* Intel panel skeleton */}
      <SkeletonCard lines={5} style={{ borderRadius: 12 }} />
      {/* Cards */}
      <SkeletonCard lines={4} style={{ borderRadius: 12 }} />
      <SkeletonCard lines={3} style={{ borderRadius: 12 }} />
      <SkeletonCard lines={6} style={{ borderRadius: 12 }} />
      {/* Heatmap skeleton */}
      <div className="dashboard-span-2">
        <SkeletonCard lines={5} style={{ borderRadius: 12 }} />
      </div>
      {/* Section skeletons */}
      <div className="dashboard-span-full">
        <SkeletonCard lines={3} style={{ borderRadius: 12 }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------

export function Dashboard() {
  const [report, setReport] = useState<IntelReport | null>(null)
  const [summary, setSummary] = useState<BriefingSummary | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [summaryProgress, setSummaryProgress] = useState<SummaryProgress | null>(null)
  const [loading, setLoading] = useState(true)

  const lastPipelineCompletedAt = useRef<string | null>(null)
  const lastSummaryAt = useRef<string | null>(null)

  // Initial data fetch
  useEffect(() => {
    Promise.all([
      api.getLatest().then(setReport).catch(() => {}),
      api.getSummary().then(r => setSummary(r.summary)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  // Derive whether any job is active
  const isActive = !!(summaryProgress?.running) || !!(pipelineStatus?.running && pipelineStatus.alive !== false)

  // Poll pipeline + summary status — fast when active, slow when idle
  useEffect(() => {
    const check = () => {
      api.getSummaryStatus().then(s => {
        setSummaryProgress(s)
        if (!s.running && s.completed_at && s.completed_at !== lastSummaryAt.current) {
          lastSummaryAt.current = s.completed_at
          api.getSummary().then(r => setSummary(r.summary)).catch(() => {})
        }
      }).catch(() => {})
      api.getPipelineStatus().then(ps => {
        setPipelineStatus(ps)
        if (!ps.running && ps.completed_at && ps.completed_at !== lastPipelineCompletedAt.current) {
          lastPipelineCompletedAt.current = ps.completed_at
          api.getLatest().then(setReport).catch(() => {})
          api.getSummary().then(r => {
            if (r.summary?.generated_at !== lastSummaryAt.current) {
              lastSummaryAt.current = r.summary?.generated_at ?? null
              setSummary(r.summary)
            }
          }).catch(() => {})
        }
      }).catch(() => {})
    }
    const interval = isActive ? 2_000 : 15_000
    const delay = isActive ? 0 : 3_000
    const timeout = setTimeout(check, delay)
    const iv = setInterval(check, interval)
    return () => { clearTimeout(timeout); clearInterval(iv) }
  }, [isActive])

  // No data state
  const hasReport = report && Object.values(report.items).some(arr => arr.length > 0)
  const hasSummary = summary && isStructuredOverall(summary.overall) && !!summary.overall.executive_summary

  return (
    <div className="dashboard-root" style={{ padding: '1.25rem', maxWidth: 1280, margin: '0 auto' }}>
      <style>{PULSE_CSS}</style>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <DashboardSkeleton />
          </motion.div>
        ) : !hasSummary && !hasReport ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{
              padding: '5rem 2rem', textAlign: 'center', color: 'var(--ink-faint)',
              fontSize: '0.875rem', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 12,
            }}>
              <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
                No briefing data yet
              </div>
              <p style={{ margin: 0, lineHeight: 1.6 }}>
                Run the pipeline from the{' '}
                <Link href="/status" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                  Status page
                </Link>
                {' '}to fetch data and generate your first briefing.
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <div className="dashboard-grid">
              {/* Status Ticker */}
              <StaggerChild index={0} className="dashboard-span-full">
                <StatusTicker
                  report={report}
                  summary={summary}
                  pipelineStatus={pipelineStatus}
                  summaryProgress={summaryProgress}
                />
              </StaggerChild>

              {/* Stats Strip */}
              <StaggerChild index={1} className="dashboard-span-full">
                <StatsStrip report={report} summary={summary} />
              </StaggerChild>

              {/* Executive Summary (span 2) */}
              {summary && (
                <StaggerChild index={2} className="dashboard-span-2">
                  <ExecSummaryWidget summary={summary} />
                </StaggerChild>
              )}

              {/* Risk & Intel Panel */}
              {summary && (
                <StaggerChild index={3}>
                  <RiskIntelPanel summary={summary} />
                </StaggerChild>
              )}

              {/* Sentiment */}
              {summary && (
                <StaggerChild index={4}>
                  <SentimentWidget summary={summary} report={report} />
                </StaggerChild>
              )}

              {/* Category Distribution */}
              {report && (
                <StaggerChild index={5}>
                  <CategoryDistributionWidget report={report} />
                </StaggerChild>
              )}

              {/* Trending */}
              {report && (
                <StaggerChild index={6}>
                  <TrendingWidget report={report} />
                </StaggerChild>
              )}

              {/* Source Activity Heatmap (span 2) */}
              {report && (
                <StaggerChild index={7} className="dashboard-span-2">
                  <SourceActivityWidget report={report} />
                </StaggerChild>
              )}

              {/* Section Summaries (full span) */}
              {summary && (
                <StaggerChild index={8} className="dashboard-span-full">
                  <SectionSummariesWidget summary={summary} />
                </StaggerChild>
              )}

              {/* Source Health */}
              {report && (
                <StaggerChild index={9}>
                  <SourceHealthWidget report={report} />
                </StaggerChild>
              )}

              {/* Link to full feed */}
              <div className="dashboard-span-full" style={{ textAlign: 'center', paddingTop: '0.125rem', paddingBottom: '0.25rem' }}>
                <Link href="/data" style={{
                  fontSize: '0.75rem', fontWeight: 500, color: 'var(--accent)', textDecoration: 'none',
                }}>
                  View full feed &#8250;
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
