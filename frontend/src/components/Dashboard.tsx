// ABOUTME: Dashboard home page — executive summary, sentiment overview, trending items, and section summaries.
// ABOUTME: Polls report + summary + pipeline status; uses display categories from taxonomy.
'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { api } from '@/api/client'
import type { IntelReport, IntelItem, BriefingSummary, PipelineStatus, SummaryProgress, OverallBriefing, BriefingSource } from '@/api/client'
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

// ---------------------------------------------------------------------------
// Widget: Stats Strip
// ---------------------------------------------------------------------------

function StatsStrip({ report, summary }: { report: IntelReport | null; summary: BriefingSummary | null }) {
  const totalItems = report ? Object.values(report.items).flat().length : 0
  const sourcesOk = report ? report.sources_ok.length : 0

  // Compute positive sentiment %
  const SOCIAL = new Set(['x', 'bluesky', 'mastodon', 'weibo', 'xiaohongshu'])
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
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      background: 'var(--surface)',
      borderRadius: 10,
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {stats.map((stat, i) => (
        <div key={stat.label} style={{
          padding: '1.25rem 1.5rem',
          borderRight: i < 3 ? '1px solid var(--border-soft)' : 'none',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: stat.color ?? 'var(--ink)',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
            textTransform: stat.label === 'Mood' ? 'capitalize' : 'none',
          }}>
            {stat.value}
          </div>
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'var(--ink-faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginTop: '0.375rem',
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
      borderRadius: '0 10px 10px 0',
      padding: '1.5rem 2rem',
    }}>
      <SectionLabel style={{ color: 'var(--accent)', marginBottom: '0.875rem' }}>
        Executive Summary
      </SectionLabel>
      <div style={{
        fontSize: '0.9375rem',
        color: 'var(--ink)',
        lineHeight: 1.85,
        whiteSpace: 'pre-wrap',
      }}>
        <InlineRefs text={overall.executive_summary} globalSources={overall.sources} />
      </div>
      {overall.quick_scan && overall.quick_scan.length > 0 && (
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--accent-dim)' }}>
          <SectionLabel style={{ color: 'var(--accent)', marginBottom: '0.625rem' }}>
            Quick Scan
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {overall.quick_scan.map((entry, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: '0.625rem',
                fontSize: '0.8125rem',
                color: 'var(--ink)',
                lineHeight: 1.65,
              }}>
                <span style={{
                  width: 5,
                  height: 5,
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
// Widget: Sentiment Overview
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

  const SOCIAL = new Set(['x', 'bluesky', 'mastodon', 'weibo', 'xiaohongshu'])
  const allItems: IntelItem[] = report ? Object.values(report.items).flat() : []
  const socialWithSentiment = allItems.filter(i => SOCIAL.has(i.source) && i.sentiment)

  const bySource: Record<string, { positive: number; negative: number; neutral: number; total: number }> = {}
  for (const item of socialWithSentiment) {
    if (!bySource[item.source]) bySource[item.source] = { positive: 0, negative: 0, neutral: 0, total: 0 }
    bySource[item.source][item.sentiment!.label]++
    bySource[item.source].total++
  }

  const PLATFORM_COLORS: Record<string, string> = {
    x: 'var(--ink)',
    bluesky: '#0085FF',
    mastodon: '#6364FF',
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.875rem',
    }}>
      {/* Header: mood indicator as hero */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Sentiment</SectionLabel>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
        }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: moodColors[sentiment.overall_mood] ?? 'var(--ink-faint)',
          }} />
          <span style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: moodColors[sentiment.overall_mood] ?? 'var(--ink-faint)',
            textTransform: 'capitalize',
          }}>
            {sentiment.overall_mood}
          </span>
        </div>
      </div>

      {/* Mood summary */}
      {sentiment.mood_summary && (
        <p style={{
          fontSize: '0.8125rem',
          color: 'var(--ink)',
          lineHeight: 1.7,
          margin: 0,
        }}>
          <InlineRefs text={sentiment.mood_summary} globalSources={overall.sources} />
        </p>
      )}

      {/* Risk flags */}
      {sentiment.risk_flags.length > 0 && (
        <div>
          <SectionLabel style={{ color: 'var(--err)', marginBottom: '0.375rem' }}>
            Risk Flags
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {sentiment.risk_flags.map((flag, i) => (
              <div key={i} style={{
                fontSize: '0.8125rem',
                color: 'var(--ink)',
                lineHeight: 1.6,
                paddingLeft: '0.75rem',
                borderLeft: '2px solid var(--err)',
              }}>
                <strong style={{ fontSize: '0.75rem' }}>{flag.topic}</strong>
                <span style={{ color: 'var(--ink-muted)', marginLeft: '0.375rem' }}>
                  <InlineRefs text={flag.analysis} globalSources={overall.sources} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-platform sentiment bars */}
      {Object.keys(bySource).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {Object.entries(bySource).map(([source, counts]) => {
            const posPct = Math.round((counts.positive / counts.total) * 100)
            const negPct = Math.round((counts.negative / counts.total) * 100)
            const neuPct = 100 - posPct - negPct
            return (
              <div key={source}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.25rem',
                }}>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: PLATFORM_COLORS[source] ?? 'var(--ink-muted)',
                  }}>
                    {SENSOR_LABELS[source] ?? source}
                  </span>
                  <div style={{
                    display: 'flex',
                    gap: '0.625rem',
                    fontSize: '0.5625rem',
                    fontFamily: 'ui-monospace, monospace',
                    color: 'var(--ink-faint)',
                  }}>
                    <span><span style={{ color: '#22c55e' }}>{posPct}%</span></span>
                    <span><span style={{ color: '#9ca3af' }}>{neuPct}%</span></span>
                    <span><span style={{ color: '#ef4444' }}>{negPct}%</span></span>
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  height: 5,
                  borderRadius: 3,
                  overflow: 'hidden',
                  background: 'var(--border)',
                }}>
                  {posPct > 0 && (
                    <div
                      title={`${counts.positive} positive (${posPct}%)`}
                      style={{ width: `${posPct}%`, background: '#22c55e', transition: 'width 300ms' }}
                    />
                  )}
                  {neuPct > 0 && (
                    <div
                      title={`${counts.neutral} neutral (${neuPct}%)`}
                      style={{ width: `${neuPct}%`, background: '#9ca3af', transition: 'width 300ms' }}
                    />
                  )}
                  {negPct > 0 && (
                    <div
                      title={`${counts.negative} negative (${negPct}%)`}
                      style={{ width: `${negPct}%`, background: '#ef4444', transition: 'width 300ms' }}
                    />
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

  const top = trendItems.slice(0, 6)
  if (top.length === 0) return null

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '1.25rem 1.5rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.875rem',
      }}>
        <SectionLabel>Trending</SectionLabel>
        <Link href="/data" style={{
          fontSize: '0.6875rem',
          fontWeight: 500,
          color: 'var(--accent)',
          textDecoration: 'none',
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
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 0',
                textDecoration: 'none',
                borderBottom: idx < top.length - 1 ? '1px dotted var(--border-soft)' : 'none',
              }}
            >
              {/* Rank number */}
              <span style={{
                fontSize: '1.125rem',
                fontWeight: 700,
                color: 'var(--border)',
                width: 24,
                textAlign: 'right',
                flexShrink: 0,
                fontFamily: 'ui-monospace, monospace',
              }}>
                {idx + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--ink)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {displayTitle}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  fontSize: '0.5625rem',
                  color: 'var(--ink-faint)',
                  marginTop: '0.125rem',
                }}>
                  <span style={{
                    padding: '0.0625rem 0.3125rem',
                    borderRadius: 3,
                    background: 'var(--surface-alt)',
                    fontWeight: 500,
                  }}>
                    {SENSOR_LABELS[item.source] ?? item.source}
                  </span>
                  {item.heat && <span>{item.heat}</span>}
                  {v.hoursOnTrend != null && <span>{v.hoursOnTrend}h trending</span>}
                </div>
              </div>
              {pctStr && (
                <span style={{
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: pctColor,
                  fontFamily: 'ui-monospace, monospace',
                  flexShrink: 0,
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
// Widget: Section Summaries (collapsible)
// ---------------------------------------------------------------------------

function SectionSummariesWidget({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall)) return null
  const sections = overall.sections
  if (!sections || sections.length === 0) return null

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {sections.map((section, i) => {
        const isOpen = expanded.has(i)
        return (
          <div key={i} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setExpanded(prev => {
                const next = new Set(prev)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '0.875rem 1.5rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <span>{section.title}</span>
                <span style={{
                  fontSize: '0.5625rem',
                  fontWeight: 600,
                  color: 'var(--ink-faint)',
                  background: 'var(--surface-alt)',
                  padding: '0.125rem 0.4375rem',
                  borderRadius: 3,
                  fontFamily: 'ui-monospace, monospace',
                }}>
                  {section.entries.length}
                </span>
              </div>
              <span style={{
                fontSize: '0.625rem',
                color: 'var(--ink-faint)',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 200ms',
                display: 'inline-block',
              }}>
                &#9662;
              </span>
            </button>
            {isOpen && (
              <div style={{
                padding: '0 1.5rem 1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.625rem',
              }}>
                {section.entries.map((entry, j) => (
                  <div key={j} style={{
                    fontSize: '0.8125rem',
                    color: 'var(--ink)',
                    lineHeight: 1.75,
                    paddingLeft: '0.875rem',
                    borderLeft: '2px solid var(--border)',
                  }}>
                    <InlineRefs text={entry.text} globalSources={overall.sources} />
                  </div>
                ))}
              </div>
            )}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Stats strip skeleton */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            padding: '1.25rem 1.5rem',
            borderRight: i < 3 ? '1px solid var(--border-soft)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <Skeleton width={60} height={24} />
            <Skeleton width={40} height={8} />
          </div>
        ))}
      </div>
      {/* Exec summary skeleton */}
      <div style={{
        background: 'var(--accent-wash)',
        borderLeft: '3px solid var(--accent-dim)',
        borderRadius: '0 10px 10px 0',
        padding: '1.5rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
      }}>
        <Skeleton width={120} height={10} />
        <Skeleton width="95%" height={14} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="55%" height={14} />
      </div>
      {/* Two-column cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '0.75rem',
      }}>
        <SkeletonCard lines={5} style={{ borderRadius: 10 }} />
        <SkeletonCard lines={4} style={{ borderRadius: 10 }} />
      </div>
      {/* Section skeletons */}
      <SkeletonCard lines={3} style={{ borderRadius: 10 }} />
      <SkeletonCard lines={2} style={{ borderRadius: 10 }} />
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

  const isRunning = isActive

  // No data state
  const hasReport = report && Object.values(report.items).some(arr => arr.length > 0)
  const hasSummary = summary && isStructuredOverall(summary.overall) && !!summary.overall.executive_summary

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1060, margin: '0 auto' }}>
      <style>{PULSE_CSS}</style>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
      }}>
        <h1 style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          color: 'var(--ink-muted)',
          margin: 0,
          letterSpacing: '-0.01em',
        }}>
          Intel Briefing
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isRunning && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: 'var(--accent)',
              background: 'var(--accent-tint)',
              padding: '0.3rem 0.75rem',
              borderRadius: 4,
            }}>
              <span style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--accent)',
                animation: 'pulseDot 1.6s ease-in-out infinite',
              }} />
              Updating
            </span>
          )}
          {summary && (
            <span style={{
              fontSize: '0.6875rem',
              color: 'var(--ink-faint)',
              fontFamily: 'ui-monospace, monospace',
            }}>
              {timeAgo(summary.generated_at)}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : !hasSummary && !hasReport ? (
        <div style={{
          padding: '5rem 2rem',
          textAlign: 'center',
          color: 'var(--ink-faint)',
          fontSize: '0.875rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
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
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Stats Strip */}
          <StatsStrip report={report} summary={summary} />

          {/* Executive Summary */}
          {summary && <ExecSummaryWidget summary={summary} />}

          {/* Two-column layout: Sentiment + Trending */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '0.75rem',
          }}>
            {summary && <SentimentWidget summary={summary} report={report} />}
            {report && <TrendingWidget report={report} />}
          </div>

          {/* Section Summaries (collapsible) */}
          {summary && <SectionSummariesWidget summary={summary} />}

          {/* Link to full feed */}
          <div style={{ textAlign: 'center', paddingTop: '0.25rem', paddingBottom: '0.5rem' }}>
            <Link href="/data" style={{
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--accent)',
              textDecoration: 'none',
            }}>
              View full feed &#8250;
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
