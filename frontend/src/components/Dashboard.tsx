// ABOUTME: Dashboard home page — fluid grid data terminal with sentiment, trending, heatmap, risk/intel panel.
// ABOUTME: Premium data platform aesthetic using shadcn/ui, Tailwind, and Framer Motion animations.
'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/api/client'
import type { IntelReport, IntelItem, BriefingSummary, PipelineStatus, SummaryProgress, OverallBriefing, BriefingSource, SentimentEntry } from '@/api/client'
import { SENSOR_LABELS, SENSOR_DISPLAY_MAP, CATEGORY_TO_DISPLAY } from '@/lib/sensors/taxonomy'
import type { CategoryKey, DisplayCategoryKey } from '@/lib/sensors/taxonomy'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
// Badge removed — replaced with styled spans for premium pill treatment
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'

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
            className="text-[0.5625rem] font-semibold text-primary align-super ml-0.5 leading-none no-underline"
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
function SectionLabel({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('text-[0.6875rem] font-semibold uppercase tracking-wider', className)}
      style={{ color: 'var(--ink-tertiary)', ...style }}>
      {children}
    </div>
  )
}

/** Stagger-fade each dashboard widget on mount. */
function StaggerChild({ index, children, className }: { index: number; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 28,
        delay: index * 0.04,
      }}
    >
      {children}
    </motion.div>
  )
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
    bullish: 'var(--sent-bullish-text)',
    bearish: 'var(--sent-bearish-text)',
    mixed: 'var(--sent-mixed-text)',
    neutral: 'var(--ink-tertiary)',
  }
  const moodDotColors: Record<string, string> = {
    bullish: 'var(--sent-bullish)',
    bearish: 'var(--sent-bearish)',
    mixed: 'var(--sent-mixed)',
    neutral: 'var(--ink-tertiary)',
  }

  return (
    <div
      className="dashboard-ticker flex items-center gap-5 px-5 font-mono overflow-hidden flex-nowrap"
      style={{
        height: 40,
        background: 'var(--surface)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-xs)',
        border: '1px solid var(--border-subtle)',
        fontSize: '0.625rem',
        color: 'var(--ink-tertiary)',
      }}
    >
      {/* Pipeline state */}
      <span className="inline-flex items-center gap-1.5 shrink-0">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: isActive ? 'var(--accent)' : 'var(--ink-tertiary)',
            ...(isActive ? { animation: 'pulseDot 1.6s ease-in-out infinite' } : {}),
          }}
        />
        <span className="font-semibold" style={{ color: isActive ? 'var(--accent)' : 'var(--ink-tertiary)' }}>
          {isActive ? 'Updating' : 'Idle'}
        </span>
      </span>

      <span className="shrink-0" style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />

      {/* Last fetch */}
      <span className="dashboard-ticker-hide-mobile shrink-0">
        {report ? `Fetched ${timeAgo(report.fetched_at)}` : 'No data'}
      </span>

      {/* Last summary */}
      {summary && (
        <span className="dashboard-ticker-hide-mobile shrink-0">
          Summary {timeAgo(summary.generated_at)}
        </span>
      )}

      <span className="shrink-0" style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />

      {/* Sources */}
      <span className="shrink-0">
        <span style={{ color: sourcesOk === sourcesTotal ? 'var(--ok-text)' : 'var(--warn-text)' }}>
          {sourcesOk}/{sourcesTotal}
        </span>
        {' '}sources
      </span>

      {/* Items */}
      <span className="dashboard-ticker-hide-mobile shrink-0">
        {allItems.length} items
      </span>

      {/* Mood */}
      {mood && (
        <>
          <span className="shrink-0" style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />
          <span className="inline-flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: moodDotColors[mood] ?? 'var(--ink-tertiary)' }} />
            <span className="font-semibold capitalize" style={{ color: moodColors[mood] ?? 'var(--ink-tertiary)' }}>
              {mood}
            </span>
          </span>
        </>
      )}

      {/* Risk flags */}
      {riskCount > 0 && (
        <span
          className="shrink-0 font-semibold"
          style={{
            background: 'var(--sent-neg)',
            color: '#fff',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: '0.625rem',
          }}
        >
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
  const moodStyles: Record<string, string> = {
    bullish: 'var(--sent-bullish-text)',
    bearish: 'var(--sent-bearish-text)',
    mixed: 'var(--sent-mixed-text)',
    neutral: 'var(--ink-tertiary)',
  }

  const stats: { value: string; label: string; colorStyle?: string }[] = [
    { value: totalItems.toLocaleString(), label: 'Items' },
    { value: String(sourcesOk), label: 'Sources' },
    { value: positivePct != null ? `${positivePct}%` : '--', label: 'Positive' },
    { value: mood ?? '--', label: 'Mood', colorStyle: mood ? moodStyles[mood] : undefined },
  ]

  return (
    <div
      className="dashboard-stats-strip overflow-hidden"
      style={{
        background: 'var(--surface)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="grid grid-cols-2 md:grid-cols-4">
        {stats.map((stat, i) => (
          <div key={stat.label} className={cn(
            'stat-cell text-center cursor-default',
            i % 2 === 0 && 'border-r',
            i < 2 && 'border-b md:border-b-0',
            i === 2 && 'md:border-r',
          )}
            style={{
              padding: '16px 0',
              borderColor: 'var(--border-subtle)',
              transition: 'background 150ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
          >
            <motion.div
              key={stat.value}
              className="stat-value"
              initial={{ opacity: 0.4, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <span
                className={cn(
                  'stat-number font-bold leading-tight tracking-tight font-mono',
                  stat.label === 'Mood' && 'capitalize',
                )}
                style={{
                  letterSpacing: '-0.03em',
                  color: stat.colorStyle ?? 'var(--ink)',
                }}
              >
                {stat.value}
              </span>
            </motion.div>
            <div
              className="font-semibold uppercase tracking-wider mt-1"
              style={{ fontSize: '0.6875rem', color: 'var(--ink-tertiary)' }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Widget: Executive Summary
// ---------------------------------------------------------------------------

function ExecSummaryWidget({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall) || !overall.executive_summary) return null

  const [expanded, setExpanded] = useState(false)
  const isLong = overall.executive_summary.length > 400

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 12,
      boxShadow: 'var(--shadow-card)',
      borderLeft: '3px solid var(--accent)',
      padding: 20,
      overflow: 'hidden',
    }}>
      <SectionLabel className="mb-3" style={{ color: 'var(--accent)' }}>Executive Summary</SectionLabel>
      <div
        className="whitespace-pre-wrap exec-summary-text"
        style={{
          fontSize: '0.875rem',
          lineHeight: 1.6,
          color: 'var(--ink)',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
          ...(!expanded && isLong ? {
            maxHeight: 160,
            overflow: 'hidden',
            maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
          } : {}),
        }}
      >
        <InlineRefs text={overall.executive_summary} globalSources={overall.sources} />
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="font-semibold mt-2 cursor-pointer"
          style={{
            fontSize: '0.75rem',
            color: 'var(--accent)',
            background: 'none',
            border: 'none',
            padding: 0,
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      {(expanded || !isLong) && overall.quick_scan && overall.quick_scan.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <SectionLabel className="mb-2" style={{ color: 'var(--accent)' }}>Quick Scan</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {overall.quick_scan.map((entry, i) => (
              <div key={i} className="flex gap-2" style={{ fontSize: '0.8125rem', color: 'var(--ink-secondary)', lineHeight: 1.6 }}>
                <span className="shrink-0 mt-2 rounded-full" style={{ width: 4, height: 4, background: 'var(--accent)' }} />
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

  const tabData = [
    { key: 'risk', label: 'Risk', items: sentiment.risk_flags ?? [], color: 'var(--sent-neg-text)', dot: 'var(--sent-neg)' },
    { key: 'controversies', label: 'Controversies', items: sentiment.controversies ?? [], color: 'var(--sent-mixed-text)', dot: 'var(--sent-mixed)' },
    { key: 'shifts', label: 'Shifts', items: sentiment.opinion_shifts ?? [], color: 'var(--accent)', dot: 'var(--accent)' },
  ] as const

  const totalAlerts = tabData.reduce((n, t) => n + t.items.length, 0)
  const defaultTab = tabData.find(t => t.items.length > 0)?.key ?? 'risk'

  return (
    <Card className="dashboard-card py-4 gap-3" style={{ borderRadius: 12 }}>
      <CardContent className="px-5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <SectionLabel>Intelligence</SectionLabel>
          {totalAlerts > 0 && (
            <span className="font-bold font-mono" style={{
              fontSize: '0.625rem',
              padding: '2px 7px',
              borderRadius: 5,
              background: sentiment.risk_flags?.length ? 'var(--sent-neg-bg)' : 'var(--surface-inset)',
              color: sentiment.risk_flags?.length ? 'var(--sent-neg-text)' : 'var(--ink-tertiary)',
            }}>
              {totalAlerts} alert{totalAlerts !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Pill-style Tabs */}
        <Tabs defaultValue={defaultTab}>
          <TabsList className="bg-transparent h-auto p-0 gap-1 w-full justify-start">
            {tabData.map(tab => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="text-[0.6875rem] px-3 py-1 rounded-[6px] data-[state=active]:shadow-none"
                style={{ transition: 'background 150ms ease' }}
              >
                {tab.label}
                {tab.items.length > 0 && (
                  <span
                    className="ml-1 font-semibold"
                    style={{ fontSize: '0.625rem', color: tab.color }}
                  >
                    {tab.items.length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabData.map(tab => (
            <TabsContent key={tab.key} value={tab.key} className="flex flex-col min-h-[60px] mt-2">
              {tab.items.length === 0 ? (
                <div className="py-4 text-center" style={{ fontSize: '0.75rem', color: 'var(--ink-tertiary)' }}>
                  None detected
                </div>
              ) : (
                tab.items.map((entry: SentimentEntry, i: number) => (
                  <div key={i} style={{
                    padding: '10px 0',
                    ...(i < tab.items.length - 1 ? { borderBottom: '1px solid var(--border-subtle)' } : {}),
                  }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="shrink-0 rounded-full" style={{
                        width: 5,
                        height: 5,
                        background: tab.dot,
                      }} />
                      <span className="font-semibold" style={{ fontSize: '0.8125rem', color: 'var(--ink)' }}>
                        {entry.topic}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)', lineHeight: 1.5, paddingLeft: '1.125rem' }}>
                      <InlineRefs text={entry.analysis} globalSources={overall.sources} />
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Widget: Sentiment Ring Gauge (SVG) — teal/rose/gray palette
// ---------------------------------------------------------------------------

function SentimentRing({ positive, neutral, negative, size = 96 }: {
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

  const posOffset = circumference * 0.25
  const neuOffset = posOffset - posArc
  const negOffset = neuOffset - neuArc

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0"
      role="img" aria-label={`Sentiment: ${Math.round(posPct * 100)}% positive, ${Math.round(neuPct * 100)}% neutral, ${Math.round((1 - posPct - neuPct) * 100)}% negative`}>
      <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border-subtle)" strokeWidth="6" />
      {posArc > 0 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--sent-pos)" strokeWidth="6"
          strokeDasharray={`${posArc} ${circumference - posArc}`}
          strokeDashoffset={posOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      {neuArc > 0.5 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--sent-neu)" strokeWidth="6" strokeOpacity={0.5}
          strokeDasharray={`${neuArc} ${circumference - neuArc}`}
          strokeDashoffset={neuOffset}
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      {negArc > 0.5 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--sent-neg)" strokeWidth="6"
          strokeDasharray={`${negArc} ${circumference - negArc}`}
          strokeDashoffset={negOffset}
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      <text x="50" y="47" textAnchor="middle" dominantBaseline="central" fill="var(--ink)"
        style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono, ui-monospace, monospace)', letterSpacing: '-0.02em' }}>
        {Math.round(posPct * 100)}%
      </text>
      <text x="50" y="62" textAnchor="middle" fill="var(--ink-tertiary)"
        style={{ fontSize: '0.5rem', fontWeight: 600, letterSpacing: '0.08em' }}>
        POSITIVE
      </text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Widget: Sentiment Overview (ring gauge + per-platform bars)
// ---------------------------------------------------------------------------

function SentimentWidget({ summary, report }: { summary: BriefingSummary; report: IntelReport | null }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall)) return null
  const sentiment = overall.sentiment
  if (!sentiment) return null

  const moodColors: Record<string, string> = {
    bullish: 'var(--sent-bullish-text)',
    bearish: 'var(--sent-bearish-text)',
    mixed: 'var(--sent-mixed-text)',
    neutral: 'var(--ink-tertiary)',
  }
  const moodDotColors: Record<string, string> = {
    bullish: 'var(--sent-bullish)',
    bearish: 'var(--sent-bearish)',
    mixed: 'var(--sent-mixed)',
    neutral: 'var(--ink-tertiary)',
  }

  const allItems: IntelItem[] = report ? Object.values(report.items).flat() : []
  const socialWithSentiment = allItems.filter(i => SOCIAL.has(i.source) && i.sentiment)

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
    <Card className="dashboard-card py-4 gap-3" style={{ borderRadius: 12 }}>
      <CardContent className="px-5 flex flex-col gap-3">
        {/* Header: mood pill */}
        <div className="flex items-center justify-between">
          <SectionLabel>Sentiment</SectionLabel>
          <div className="inline-flex items-center gap-1.5" style={{
            padding: '2px 8px',
            borderRadius: 6,
            background: sentiment.overall_mood !== 'neutral'
              ? (sentiment.overall_mood === 'bullish' ? 'var(--sent-pos-bg)' : sentiment.overall_mood === 'bearish' ? 'var(--sent-neg-bg)' : 'var(--sent-neu-bg)')
              : 'var(--surface-inset)',
          }}>
            <span className="rounded-full" style={{ width: 6, height: 6, background: moodDotColors[sentiment.overall_mood] ?? 'var(--ink-tertiary)' }} />
            <span className="font-semibold capitalize" style={{
              fontSize: '0.6875rem',
              color: moodColors[sentiment.overall_mood] ?? 'var(--ink-tertiary)',
            }}>
              {sentiment.overall_mood}
            </span>
          </div>
        </div>

        {/* Ring gauge + mood summary row */}
        <div className="flex gap-4 items-center flex-wrap">
          <SentimentRing positive={totalPos} neutral={totalNeu} negative={totalNeg} size={96} />
          {sentiment.mood_summary && (
            <p className="m-0 flex-1 min-w-[140px]" style={{ fontSize: '0.8125rem', color: 'var(--ink)', lineHeight: 1.5 }}>
              <InlineRefs text={sentiment.mood_summary} globalSources={overall.sources} />
            </p>
          )}
        </div>

        {/* Per-platform sentiment bars */}
        {Object.keys(bySource).length > 0 && (
          <div className="flex flex-col gap-2">
            {Object.entries(bySource).map(([source, counts]) => {
              const posPct = Math.round((counts.positive / counts.total) * 100)
              const negPct = Math.round((counts.negative / counts.total) * 100)
              const neuPct = 100 - posPct - negPct
              return (
                <div key={source}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono font-medium"
                      style={{ fontSize: '0.625rem', color: PLATFORM_COLORS[source] ?? 'var(--ink-secondary)' }}>
                      {SENSOR_LABELS[source] ?? source}
                    </span>
                    <div className="flex gap-2 font-mono" style={{ fontSize: '0.625rem', color: 'var(--ink-tertiary)' }}>
                      <span style={{ color: 'var(--sent-pos-text)' }}>{posPct}%</span>
                      <span>{neuPct}%</span>
                      <span style={{ color: 'var(--sent-neg-text)' }}>{negPct}%</span>
                    </div>
                  </div>
                  <div className="flex overflow-hidden" style={{ height: 6, borderRadius: 3, background: 'var(--border-subtle)', gap: 1 }}>
                    {posPct > 0 && (
                      <div title={`${counts.positive} positive (${posPct}%)`}
                        style={{ width: `${posPct}%`, background: 'var(--sent-pos)', transition: 'width 400ms ease' }} />
                    )}
                    {neuPct > 0 && (
                      <div title={`${counts.neutral} neutral (${neuPct}%)`}
                        style={{ width: `${neuPct}%`, background: 'var(--sent-neu)', opacity: 0.4, transition: 'width 400ms ease' }} />
                    )}
                    {negPct > 0 && (
                      <div title={`${counts.negative} negative (${negPct}%)`}
                        style={{ width: `${negPct}%`, background: 'var(--sent-neg)', transition: 'width 400ms ease' }} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
    <Card className="dashboard-card py-4 gap-3" style={{ borderRadius: 12 }}>
      <CardContent className="px-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Distribution</SectionLabel>
          <span className="font-mono" style={{ fontSize: '0.625rem', color: 'var(--ink-tertiary)' }}>{total} items</span>
        </div>
        {/* Segmented bar */}
        <div className="flex overflow-hidden" style={{ height: 10, borderRadius: 5, gap: 2 }}>
          {segments.map(seg => seg.count > 0 ? (
            <motion.div key={seg.key}
              initial={{ width: 0 }}
              animate={{ width: `${(seg.count / total) * 100}%` }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              style={{
                background: seg.color,
                borderRadius: 5,
              }}
            />
          ) : null)}
        </div>
        {/* Legend with percentages */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {segments.map(seg => {
            const pct = Math.round((seg.count / total) * 100)
            return (
              <div key={seg.key} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>{seg.label}</span>
                <span className="font-semibold font-mono ml-auto" style={{ fontSize: '0.625rem', color: 'var(--ink)' }}>
                  {seg.count} <span style={{ color: 'var(--ink-tertiary)' }}>({pct}%)</span>
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Widget: Source Activity Heatmap
// ---------------------------------------------------------------------------

function SourceActivityWidget({ report }: { report: IntelReport }) {
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

  const sorted = Object.entries(sourceHours)
    .map(([source, hours]) => ({ source, hours, total: hours.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  if (sorted.length === 0) return null

  const cellColor = (count: number): string => {
    if (count === 0) return 'var(--heat-0)'
    if (count <= 3) return 'var(--heat-1)'
    if (count <= 8) return 'var(--heat-2)'
    if (count <= 15) return 'var(--heat-3)'
    return 'var(--heat-4)'
  }

  return (
    <Card className="dashboard-card py-4 gap-3" style={{ borderRadius: 12 }}>
      <CardContent className="px-5 flex flex-col gap-3">
        <SectionLabel>Source Activity (24h)</SectionLabel>
        <div className="overflow-x-auto">
          <div className="flex flex-col gap-0.5 min-w-[400px]">
            {/* Hour labels */}
            <div className="flex items-center gap-1.5">
              <span className="shrink-0" style={{ width: 56 }} />
              <div className="grid grid-cols-[repeat(24,1fr)] gap-0.5 flex-1">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-center" style={{ fontSize: '0.625rem', fontFamily: 'var(--font-mono, ui-monospace, monospace)', color: 'var(--ink-tertiary)' }}>
                    {h % 6 === 0 ? `${h}h` : ''}
                  </div>
                ))}
              </div>
            </div>
            {/* Source rows */}
            {sorted.map(({ source, hours }) => (
              <div key={source} className="flex items-center gap-1.5">
                <span className="font-mono truncate shrink-0" style={{
                  width: 56,
                  fontSize: '0.625rem',
                  fontWeight: 500,
                  color: 'var(--ink-secondary)',
                }}>
                  {(SENSOR_LABELS[source] ?? source).slice(0, 12)}
                </span>
                <div className="grid grid-cols-[repeat(24,1fr)] gap-0.5 flex-1">
                  {hours.map((count, h) => (
                    <div key={h} title={`${SENSOR_LABELS[source] ?? source} — ${h}:00: ${count} items`}
                      style={{
                        minWidth: 8,
                        height: 12,
                        borderRadius: 2,
                        background: cellColor(count),
                        transition: 'background 200ms ease',
                        cursor: 'default',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.outline = '1px solid var(--accent)'; (e.currentTarget as HTMLElement).style.zIndex = '1' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.outline = ''; (e.currentTarget as HTMLElement).style.zIndex = '' }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div className="flex gap-2.5 font-mono" style={{ fontSize: '0.625rem', color: 'var(--ink-tertiary)' }}>
          {[
            { bg: 'var(--heat-0)', label: '0' },
            { bg: 'var(--heat-1)', label: '1-3' },
            { bg: 'var(--heat-2)', label: '4-8' },
            { bg: 'var(--heat-3)', label: '9-15' },
            { bg: 'var(--heat-4)', label: '16+' },
          ].map(({ bg, label }) => (
            <span key={label} className="inline-flex items-center gap-[3px]">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: bg }} /> {label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Widget: Source Health Dots
// ---------------------------------------------------------------------------

function SourceHealthWidget({ report }: { report: IntelReport }) {
  const okSet = new Set(report.sources_ok)
  const failedSorted = [...report.sources_failed].sort()
  const okSorted = [...report.sources_ok].sort()
  const all = [...failedSorted, ...okSorted]
  if (all.length === 0) return null

  const hasFailed = report.sources_failed.length > 0
  const healthPct = Math.round((report.sources_ok.length / all.length) * 100)

  return (
    <Card className="dashboard-card py-4 gap-3" style={{ borderRadius: 12 }}>
      <CardContent className="px-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Source Health</SectionLabel>
          <span className="font-mono font-semibold" style={{
            fontSize: '0.625rem',
            padding: '2px 7px',
            borderRadius: 5,
            background: hasFailed ? 'var(--sent-neg-bg)' : 'var(--sent-pos-bg)',
            color: hasFailed ? 'var(--sent-neg-text)' : 'var(--sent-pos-text)',
          }}>
            {healthPct}% operational
          </span>
        </div>
        {/* Health bar */}
        <div className="flex overflow-hidden" style={{ height: 4, borderRadius: 2, background: 'var(--border-subtle)' }}>
          <div style={{
            width: `${healthPct}%`,
            background: hasFailed ? 'var(--sent-mixed)' : 'var(--sent-pos)',
            transition: 'width 400ms ease',
            borderRadius: 2,
          }} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {all.map(source => (
            <div key={source} title={`${SENSOR_LABELS[source] ?? source}: ${okSet.has(source) ? 'OK' : 'Failed'}`}
              className="flex items-center gap-1.5">
              <span className="rounded-full shrink-0" style={{
                width: 7,
                height: 7,
                background: okSet.has(source) ? 'var(--sent-pos)' : 'var(--sent-neg)',
              }} />
              <span className="font-mono truncate" style={{ fontSize: '0.625rem', color: 'var(--ink-secondary)' }}>
                {(SENSOR_LABELS[source] ?? source).slice(0, 14)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
    <Card className="dashboard-card py-4 gap-3" style={{ borderRadius: 12 }}>
      <CardContent className="px-5 flex flex-col gap-0">
        <div className="flex items-center justify-between mb-2.5">
          <SectionLabel>Trending</SectionLabel>
          <Link href="/data" className="font-medium no-underline hover:underline" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>
            View all &#8250;
          </Link>
        </div>
        <div className="flex flex-col">
          {top.map((item, idx) => {
            const v = item.velocity!
            const pctStr = v.changePercent != null ? `${v.changePercent > 0 ? '+' : ''}${v.changePercent}%` : null
            const pctColor = v.changePercent != null
              ? v.changePercent > 0 ? 'var(--sent-pos-text)' : v.changePercent < 0 ? 'var(--sent-neg-text)' : 'var(--ink-tertiary)'
              : 'var(--ink-tertiary)'
            const displayTitle = item.source === 'github'
              ? item.title.split(' — ')[0]
              : item.title

            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 no-underline rounded-lg"
                style={{
                  padding: '10px 8px',
                  margin: '0 -8px',
                  transition: 'background 150ms ease',
                  ...(idx < top.length - 1 ? { borderBottom: '1px solid var(--border-subtle)' } : {}),
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
              >
                {/* Rank number */}
                <span className="w-5 text-right shrink-0 font-mono font-bold" style={{
                  fontSize: '0.6875rem',
                  color: idx < 3 ? 'var(--accent)' : 'var(--ink-disabled)',
                }}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate" style={{ fontSize: '0.8125rem', color: 'var(--ink)' }}>
                    {displayTitle}
                  </div>
                  <div className="flex items-center gap-1 mt-px" style={{ fontSize: '0.625rem', color: 'var(--ink-tertiary)' }}>
                    <span className="font-medium" style={{
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'var(--surface-inset)',
                    }}>
                      {SENSOR_LABELS[item.source] ?? item.source}
                    </span>
                    {item.heat && <span>{item.heat}</span>}
                    {v.hoursOnTrend != null && (
                      <span className="font-semibold" style={{
                        padding: '0 3px',
                        borderRadius: 4,
                        background: v.hoursOnTrend <= 6 ? 'var(--cat-trend-bg)' : 'var(--surface-inset)',
                        color: v.hoursOnTrend <= 6 ? 'var(--cat-trend)' : 'var(--ink-tertiary)',
                      }}>
                        {v.hoursOnTrend}h
                      </span>
                    )}
                  </div>
                </div>
                {pctStr && (
                  <span className="shrink-0 font-bold font-mono" style={{ fontSize: '0.6875rem', color: pctColor }}>
                    {pctStr}
                  </span>
                )}
              </a>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Widget: Section Summaries (Accordion)
// ---------------------------------------------------------------------------

function SectionSummariesWidget({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall)) return null
  const sections = overall.sections
  if (!sections || sections.length === 0) return null

  return (
    <Card className="dashboard-card py-2 gap-0" style={{ borderRadius: 12 }}>
      <CardContent className="px-5">
        <Accordion type="multiple" defaultValue={['section-0']}>
          {sections.map((section, i) => (
            <AccordionItem key={i} value={`section-${i}`} style={{ borderColor: 'var(--border-subtle)' }}>
              <AccordionTrigger className="hover:no-underline" style={{ padding: '14px 0', fontSize: '0.8125rem', fontWeight: 600 }}>
                <div className="flex items-center gap-2">
                  <span>{section.title}</span>
                  <span className="font-mono font-semibold" style={{
                    fontSize: '0.625rem',
                    background: 'var(--surface-inset)',
                    borderRadius: 4,
                    padding: '1px 6px',
                  }}>
                    {section.entries.length}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="flex flex-col gap-2">
                  {section.entries.map((entry, j) => (
                    <div key={j} style={{
                      fontSize: '0.8125rem',
                      color: 'var(--ink-secondary)',
                      lineHeight: 1.6,
                      paddingLeft: 12,
                      borderLeft: '2px solid var(--accent-subtle)',
                      overflowWrap: 'break-word',
                      wordBreak: 'break-word',
                    }}>
                      <InlineRefs text={entry.text} globalSources={overall.sources} />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Dashboard Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div>
      {/* Ticker skeleton */}
      <div className="flex gap-4 px-5" style={{
        height: 40,
        alignItems: 'center',
        background: 'var(--surface)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-xs)',
        border: '1px solid var(--border-subtle)',
      }}>
        <div className="skeleton-shimmer" style={{ width: 80, height: 10 }} />
        <div className="skeleton-shimmer" style={{ width: 96, height: 10 }} />
        <div className="skeleton-shimmer" style={{ width: 64, height: 10 }} />
      </div>
      <div className="dashboard-layout" style={{ marginTop: 14 }}>
        {/* Main skeleton */}
        <div className="dashboard-main flex flex-col" style={{ gap: 14 }}>
          {/* Stats strip skeleton */}
          <div className="overflow-hidden" style={{
            background: 'var(--surface)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-card)',
          }}>
            <div className="grid grid-cols-2 md:grid-cols-4">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={cn(
                  'flex flex-col items-center gap-1.5',
                  i % 2 === 0 && 'border-r',
                  i < 2 && 'border-b md:border-b-0',
                  i === 2 && 'md:border-r',
                )} style={{
                  padding: '16px 20px',
                  borderColor: 'var(--border-subtle)',
                }}>
                  <div className="skeleton-shimmer" style={{ width: 48, height: 24 }} />
                  <div className="skeleton-shimmer" style={{ width: 36, height: 8 }} />
                </div>
              ))}
            </div>
          </div>
          {/* Exec summary skeleton */}
          <div className="flex flex-col gap-2" style={{
            background: 'var(--surface)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-card)',
            borderLeft: '3px solid var(--accent)',
            padding: 20,
          }}>
            <div className="skeleton-shimmer" style={{ width: 96, height: 10 }} />
            <div className="skeleton-shimmer" style={{ width: '95%', height: 12 }} />
            <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
            <div className="skeleton-shimmer" style={{ width: '70%', height: 12 }} />
          </div>
          {/* Content cards */}
          <Card className="py-4" style={{ borderRadius: 12 }}><CardContent className="px-5 flex flex-col gap-2">
            <div className="skeleton-shimmer" style={{ width: 80, height: 10 }} />
            <div className="skeleton-shimmer" style={{ width: '100%', height: 16 }} />
            <div className="skeleton-shimmer" style={{ width: '80%', height: 12 }} />
            <div className="skeleton-shimmer" style={{ width: '60%', height: 12 }} />
          </CardContent></Card>
          <Card className="py-4" style={{ borderRadius: 12 }}><CardContent className="px-5 flex flex-col gap-2">
            <div className="skeleton-shimmer" style={{ width: 112, height: 10 }} />
            <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
            <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
            <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
          </CardContent></Card>
        </div>
        {/* Sidebar skeleton */}
        <div className="dashboard-sidebar flex flex-col" style={{ gap: 14 }}>
          <Card className="py-4" style={{ borderRadius: 12 }}><CardContent className="px-5 flex flex-col gap-2">
            <div className="skeleton-shimmer" style={{ width: 64, height: 10 }} />
            <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
            <div className="skeleton-shimmer" style={{ width: '70%', height: 12 }} />
          </CardContent></Card>
          <Card className="py-4" style={{ borderRadius: 12 }}><CardContent className="px-5 flex flex-col gap-2">
            <div className="skeleton-shimmer" style={{ width: 80, height: 10 }} />
            <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
          </CardContent></Card>
        </div>
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

  const hasReport = report && Object.values(report.items).some(arr => arr.length > 0)
  const hasSummary = summary && isStructuredOverall(summary.overall) && !!summary.overall.executive_summary

  return (
    <div className="dashboard-root page-padding" style={{ maxWidth: 1024, margin: '0 auto', padding: '0 3rem' }}>
      <style>{PULSE_CSS}</style>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <DashboardSkeleton />
          </motion.div>
        ) : !hasSummary && !hasReport ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="py-20 text-center" style={{ borderRadius: 12 }}>
              <CardContent className="flex flex-col items-center gap-2">
                <div className="text-lg font-semibold" style={{ color: 'var(--ink-tertiary)' }}>
                  No briefing data yet
                </div>
                <p className="text-sm" style={{ color: 'var(--ink-secondary)' }}>
                  Run the pipeline from the{' '}
                  <Link href="/status" className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
                    Status page
                  </Link>
                  {' '}to fetch data and generate your first briefing.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            {/* Status Ticker — full width above the two-column layout */}
            <StaggerChild index={0}>
              <StatusTicker
                report={report}
                summary={summary}
                pipelineStatus={pipelineStatus}
                summaryProgress={summaryProgress}
              />
            </StaggerChild>

            {/* Two-column layout: main content + right sidebar on xl screens */}
            <div className="dashboard-layout" style={{ marginTop: 14 }}>
              {/* ── Main Content Column ── */}
              <div className="dashboard-main flex flex-col" style={{ gap: 14 }}>
                {/* Stats Strip */}
                <StaggerChild index={1}>
                  <StatsStrip report={report} summary={summary} />
                </StaggerChild>

                {/* Executive Summary */}
                {summary && (
                  <StaggerChild index={2}>
                    <ExecSummaryWidget summary={summary} />
                  </StaggerChild>
                )}

                {/* Risk & Intel Panel */}
                {summary && (
                  <StaggerChild index={3}>
                    <RiskIntelPanel summary={summary} />
                  </StaggerChild>
                )}

                {/* Trending */}
                {report && (
                  <StaggerChild index={5}>
                    <TrendingWidget report={report} />
                  </StaggerChild>
                )}

                {/* Source Activity Heatmap */}
                {report && (
                  <StaggerChild index={6}>
                    <SourceActivityWidget report={report} />
                  </StaggerChild>
                )}

                {/* Section Summaries */}
                {summary && (
                  <StaggerChild index={7}>
                    <SectionSummariesWidget summary={summary} />
                  </StaggerChild>
                )}

                {/* Link to full feed */}
                <div className="text-center pt-0.5 pb-1">
                  <Link href="/data" className="font-medium no-underline hover:underline" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>
                    View full feed &#8250;
                  </Link>
                </div>
              </div>

              {/* ── Right Sidebar (visible on xl screens, stacks below on smaller) ── */}
              <div className="dashboard-sidebar flex flex-col" style={{ gap: 14 }}>
                {/* Sentiment */}
                {summary && (
                  <StaggerChild index={4}>
                    <SentimentWidget summary={summary} report={report} />
                  </StaggerChild>
                )}

                {/* Category Distribution */}
                {report && (
                  <StaggerChild index={8}>
                    <CategoryDistributionWidget report={report} />
                  </StaggerChild>
                )}

                {/* Source Health */}
                {report && (
                  <StaggerChild index={9}>
                    <SourceHealthWidget report={report} />
                  </StaggerChild>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
