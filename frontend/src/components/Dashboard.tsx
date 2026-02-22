// ABOUTME: Dashboard home page — executive summary, sentiment overview, trending items, and section summaries.
// ABOUTME: Polls report + summary + pipeline status; uses display categories from taxonomy.
'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { api } from '@/api/client'
import type { IntelReport, IntelItem, BriefingSummary, PipelineStatus, SummaryProgress, OverallBriefing, BriefingSource } from '@/api/client'
import { SENSOR_LABELS, DISPLAY_CATEGORY_META, SENSOR_DISPLAY_MAP, CATEGORY_TO_DISPLAY } from '@/lib/sensors/taxonomy'
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

// ---------------------------------------------------------------------------
// Widget: Executive Summary
// ---------------------------------------------------------------------------

function ExecSummaryWidget({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall) || !overall.executive_summary) return null

  return (
    <div style={{
      background: 'var(--accent-wash, var(--surface-alt))',
      border: '1px solid var(--accent-dim, var(--border))',
      borderRadius: 8,
      padding: '1.25rem 1.5rem',
    }}>
      <div style={{
        fontSize: '0.6875rem',
        fontWeight: 600,
        color: 'var(--accent)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: '0.75rem',
      }}>
        Executive Summary
      </div>
      <div style={{
        fontSize: '0.875rem',
        color: 'var(--ink)',
        lineHeight: 1.8,
        whiteSpace: 'pre-wrap',
      }}>
        <InlineRefs text={overall.executive_summary} globalSources={overall.sources} />
      </div>
      {overall.quick_scan && overall.quick_scan.length > 0 && (
        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--accent-dim, var(--border))' }}>
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '0.5rem',
          }}>
            Quick Scan
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {overall.quick_scan.map((entry, i) => (
              <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--ink)', lineHeight: 1.6 }}>
                <InlineRefs text={entry.text} globalSources={overall.sources} />
              </li>
            ))}
          </ul>
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

  // LLM-generated mood analysis
  const moodColors: Record<string, string> = {
    bullish: 'var(--ok)',
    bearish: 'var(--err)',
    mixed: 'var(--warn)',
    neutral: 'var(--ink-faint)',
  }

  // Per-item sentiment bars from report data
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
      borderRadius: 8,
      padding: '1.25rem 1.5rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.75rem',
      }}>
        <div style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: 'var(--ink-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          Sentiment
        </div>
        <span style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: moodColors[sentiment.overall_mood] ?? 'var(--ink-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {sentiment.overall_mood}
        </span>
      </div>

      {/* Mood summary */}
      {sentiment.mood_summary && (
        <p style={{
          fontSize: '0.8125rem',
          color: 'var(--ink)',
          lineHeight: 1.7,
          margin: '0 0 0.75rem',
        }}>
          <InlineRefs text={sentiment.mood_summary} globalSources={overall.sources} />
        </p>
      )}

      {/* Risk flags */}
      {sentiment.risk_flags.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'var(--err)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '0.375rem',
          }}>
            Risk Flags
          </div>
          {sentiment.risk_flags.map((flag, i) => (
            <div key={i} style={{
              fontSize: '0.8125rem',
              color: 'var(--ink)',
              lineHeight: 1.6,
              marginBottom: '0.25rem',
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
      )}

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
                  <span style={{
                    fontSize: '0.625rem',
                    color: 'var(--ink-faint)',
                    fontFamily: 'ui-monospace, monospace',
                  }}>
                    {counts.total} posts
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  height: 6,
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
  // Collect items from the "trend" display category that have velocity data
  const trendItems: IntelItem[] = []
  for (const [cat, items] of Object.entries(report.items)) {
    for (const item of items) {
      if (displayCategoryOf(item, cat) === 'trend' && item.velocity) {
        trendItems.push(item)
      }
    }
  }

  // Sort by absolute change percent (highest velocity first), nulls last
  trendItems.sort((a, b) => {
    const av = Math.abs(a.velocity?.changePercent ?? 0)
    const bv = Math.abs(b.velocity?.changePercent ?? 0)
    return bv - av
  })

  const top = trendItems.slice(0, 8)
  if (top.length === 0) return null

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '1.25rem 1.5rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.75rem',
      }}>
        <div style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: 'var(--ink-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          Trending
        </div>
        <Link href="/data" style={{
          fontSize: '0.6875rem',
          color: 'var(--accent)',
          textDecoration: 'none',
        }}>
          View all
        </Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {top.map(item => {
          const v = item.velocity!
          const pctStr = v.changePercent != null ? `${v.changePercent > 0 ? '+' : ''}${v.changePercent}%` : null
          const pctColor = v.changePercent != null
            ? v.changePercent > 0 ? 'var(--ok)' : v.changePercent < 0 ? 'var(--err)' : 'var(--ink-faint)'
            : 'var(--ink-faint)'
          // Clean title: strip the "owner/repo — description" format for GitHub
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
                padding: '0.375rem 0',
                textDecoration: 'none',
                borderBottom: '1px solid var(--border-soft)',
              }}
            >
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
                  fontSize: '0.625rem',
                  color: 'var(--ink-faint)',
                  marginTop: '0.125rem',
                }}>
                  {SENSOR_LABELS[item.source] ?? item.source}
                  {item.heat && <> · {item.heat}</>}
                  {v.hoursOnTrend != null && <> · {v.hoursOnTrend}h on trend</>}
                </div>
              </div>
              {pctStr && (
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{
        fontSize: '0.6875rem',
        fontWeight: 600,
        color: 'var(--ink-faint)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        Sections
      </div>
      {sections.map((section, i) => {
        const isOpen = expanded.has(i)
        return (
          <div key={i} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
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
                padding: '0.75rem 1.25rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                textAlign: 'left',
              }}
            >
              <span>{section.title}</span>
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--ink-faint)',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 200ms',
              }}>
                &#9662;
              </span>
            </button>
            {isOpen && (
              <div style={{
                padding: '0 1.25rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}>
                {section.entries.map((entry, j) => (
                  <div key={j} style={{
                    fontSize: '0.8125rem',
                    color: 'var(--ink)',
                    lineHeight: 1.7,
                    paddingLeft: '0.75rem',
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
// Widget: Display Category Summary Cards
// ---------------------------------------------------------------------------

function CategoryCardsWidget({ summary }: { summary: BriefingSummary }) {
  const categories = Object.entries(DISPLAY_CATEGORY_META) as [DisplayCategoryKey, { label: string; desc: string }][]

  // Group sensor summaries by display category
  const byCat: Record<DisplayCategoryKey, typeof summary.sections> = {
    'high-trust': [],
    'news': [],
    'trend': [],
    'opinions': [],
  }
  for (const section of summary.sections) {
    const cat = SENSOR_DISPLAY_MAP[section.sensor_name] ?? 'news'
    byCat[cat].push(section)
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '0.75rem',
    }}>
      {categories.map(([key, meta]) => {
        const sections = byCat[key]
        const totalItems = sections.reduce((sum, s) => sum + s.item_count, 0)
        if (totalItems === 0) return null

        return (
          <div key={key} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '1rem 1.25rem',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.5rem',
            }}>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--ink)',
              }}>
                {meta.label}
              </span>
              <span style={{
                fontSize: '0.625rem',
                color: 'var(--ink-faint)',
                fontFamily: 'ui-monospace, monospace',
              }}>
                {totalItems} items
              </span>
            </div>
            <p style={{
              fontSize: '0.6875rem',
              color: 'var(--ink-muted)',
              margin: '0 0 0.5rem',
              lineHeight: 1.5,
            }}>
              {meta.desc}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {sections.map(s => (
                <span key={s.sensor_name} style={{
                  fontSize: '0.5625rem',
                  fontWeight: 500,
                  padding: '0.125rem 0.375rem',
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  color: 'var(--ink-muted)',
                  whiteSpace: 'nowrap',
                }}>
                  {SENSOR_LABELS[s.sensor_name] ?? s.sensor_name}
                </span>
              ))}
            </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Exec summary skeleton */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}>
        <Skeleton width={140} height={10} />
        <Skeleton width="95%" height={13} />
        <Skeleton width="100%" height={13} />
        <Skeleton width="80%" height={13} />
        <Skeleton width="60%" height={13} />
      </div>
      {/* Two-column cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '0.75rem',
      }}>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={5} />
        <SkeletonCard lines={3} />
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

  const isRunning = isActive

  // No data state
  const hasReport = report && Object.values(report.items).some(arr => arr.length > 0)
  const hasSummary = summary && isStructuredOverall(summary.overall) && !!summary.overall.executive_summary

  return (
    <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <style>{PULSE_CSS}</style>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
      }}>
        <h1 style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--ink)',
          margin: 0,
          letterSpacing: '-0.01em',
        }}>
          Dashboard
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
              padding: '0.25rem 0.625rem',
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
              {summary.generated_at.slice(0, 16).replace('T', ' ')} · {timeAgo(summary.generated_at)}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : !hasSummary && !hasReport ? (
        <div style={{
          padding: '4rem 2rem',
          textAlign: 'center',
          color: 'var(--ink-faint)',
          fontSize: '0.875rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
            No briefing data yet
          </div>
          <p style={{ margin: 0 }}>
            Run the pipeline from the{' '}
            <Link href="/status" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
              Status page
            </Link>
            {' '}to fetch data and generate your first briefing.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Executive Summary */}
          {summary && <ExecSummaryWidget summary={summary} />}

          {/* Two-column layout: Sentiment + Trending */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '0.75rem',
          }}>
            {summary && <SentimentWidget summary={summary} report={report} />}
            {report && <TrendingWidget report={report} />}
          </div>

          {/* Category overview cards */}
          {summary && <CategoryCardsWidget summary={summary} />}

          {/* Section Summaries (collapsible) */}
          {summary && <SectionSummariesWidget summary={summary} />}

          {/* Link to full feed */}
          <div style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
            <Link href="/data" style={{
              fontSize: '0.8125rem',
              color: 'var(--accent)',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}>
              View full feed and raw items
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
