// ABOUTME: Dashboard home page — fluid grid data terminal with sentiment, trending, heatmap, risk/intel panel.
// ABOUTME: Grafana-style tile layout using shadcn/ui components, Tailwind, and Framer Motion animations.
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
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Skeleton } from '@/components/ui/skeleton'

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
function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('text-[0.625rem] font-bold text-muted-foreground uppercase tracking-wider', className)}>
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
    bullish: 'text-ok',
    bearish: 'text-err',
    mixed: 'text-warn',
    neutral: 'text-muted-foreground',
  }
  const moodDotColors: Record<string, string> = {
    bullish: 'bg-ok',
    bearish: 'bg-err',
    mixed: 'bg-warn',
    neutral: 'bg-muted-foreground',
  }

  return (
    <div className="dashboard-ticker flex items-center gap-5 px-5 py-2 bg-secondary rounded-[10px] text-[0.6875rem] font-mono text-muted-foreground overflow-hidden flex-nowrap">
      {/* Pipeline state */}
      <span className="inline-flex items-center gap-1.5 shrink-0">
        <span
          className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-primary' : 'bg-muted-foreground')}
          style={isActive ? { animation: 'pulseDot 1.6s ease-in-out infinite' } : undefined}
        />
        <span className={cn('font-semibold', isActive ? 'text-primary' : 'text-muted-foreground')}>
          {isActive ? 'Updating' : 'Idle'}
        </span>
      </span>

      <span className="w-px h-3.5 bg-border shrink-0" />

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

      <span className="w-px h-3.5 bg-border shrink-0" />

      {/* Sources */}
      <span className="shrink-0">
        <span className={sourcesOk === sourcesTotal ? 'text-ok' : 'text-warn'}>
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
          <span className="w-px h-3.5 bg-border shrink-0" />
          <span className="inline-flex items-center gap-1 shrink-0">
            <span className={cn('w-1.5 h-1.5 rounded-full', moodDotColors[mood] ?? 'bg-muted-foreground')} />
            <span className={cn('font-semibold capitalize', moodColors[mood] ?? 'text-muted-foreground')}>
              {mood}
            </span>
          </span>
        </>
      )}

      {/* Risk flags */}
      {riskCount > 0 && (
        <Badge variant="destructive" className="text-[0.625rem] px-1.5 py-0 rounded-sm shrink-0">
          {riskCount} risk{riskCount !== 1 ? 's' : ''}
        </Badge>
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
    bullish: 'text-ok',
    bearish: 'text-err',
    mixed: 'text-warn',
    neutral: 'text-muted-foreground',
  }

  const stats: { value: string; label: string; colorClass?: string }[] = [
    { value: totalItems.toLocaleString(), label: 'Items' },
    { value: String(sourcesOk), label: 'Sources' },
    { value: positivePct != null ? `${positivePct}%` : '--', label: 'Positive' },
    { value: mood ?? '--', label: 'Mood', colorClass: mood ? moodColors[mood] : undefined },
  ]

  return (
    <Card className="dashboard-stats-strip py-0 gap-0 overflow-hidden">
      <div className="grid grid-cols-4">
        {stats.map((stat, i) => (
          <div key={stat.label} className={cn(
            'stat-cell py-4 px-5 text-center',
            i < 3 && 'border-r border-border/50',
          )}>
            <motion.div
              key={stat.value}
              className="stat-value"
              initial={{ opacity: 0.4, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <span className={cn(
                'text-[1.75rem] font-bold leading-tight tracking-tight',
                stat.label !== 'Mood' && 'font-mono',
                stat.label === 'Mood' && 'capitalize',
                stat.colorClass ?? 'text-foreground',
              )}>
                {stat.value}
              </span>
            </motion.div>
            <div className="text-[0.5625rem] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Widget: Executive Summary
// ---------------------------------------------------------------------------

function ExecSummaryWidget({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall) || !overall.executive_summary) return null

  return (
    <div className="bg-[var(--accent-wash)] border-l-[3px] border-l-primary rounded-r-xl py-5 px-6">
      <SectionLabel className="text-primary mb-3">Executive Summary</SectionLabel>
      <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
        <InlineRefs text={overall.executive_summary} globalSources={overall.sources} />
      </div>
      {overall.quick_scan && overall.quick_scan.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-[var(--accent-dim)]">
          <SectionLabel className="text-primary mb-2">Quick Scan</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {overall.quick_scan.map((entry, i) => (
              <div key={i} className="flex gap-2 text-[0.8125rem] text-foreground leading-relaxed">
                <span className="w-1 h-1 rounded-full bg-primary shrink-0 mt-2" />
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
    { key: 'risk', label: 'Risk', items: sentiment.risk_flags ?? [], color: 'text-err' },
    { key: 'controversies', label: 'Controversies', items: sentiment.controversies ?? [], color: 'text-warn' },
    { key: 'shifts', label: 'Shifts', items: sentiment.opinion_shifts ?? [], color: 'text-primary' },
  ] as const

  const totalAlerts = tabData.reduce((n, t) => n + t.items.length, 0)
  const defaultTab = tabData.find(t => t.items.length > 0)?.key ?? 'risk'

  return (
    <Card className="py-4 gap-3">
      <CardContent className="px-5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <SectionLabel>Intelligence</SectionLabel>
          {totalAlerts > 0 && (
            <span className={cn(
              'text-[0.5625rem] font-bold font-mono',
              sentiment.risk_flags?.length ? 'text-err' : 'text-muted-foreground',
            )}>
              {totalAlerts} alert{totalAlerts !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue={defaultTab}>
          <TabsList variant="line" className="w-full justify-start">
            {tabData.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key} className="text-[0.6875rem] px-3 py-1.5">
                {tab.label}
                {tab.items.length > 0 && (
                  <Badge variant="secondary" className={cn('ml-1 text-[0.5rem] px-1.5 py-0', tab.color)}>
                    {tab.items.length}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabData.map(tab => (
            <TabsContent key={tab.key} value={tab.key} className="flex flex-col gap-2 min-h-[60px] mt-2">
              {tab.items.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  None detected
                </div>
              ) : (
                tab.items.map((entry: SentimentEntry, i: number) => (
                  <div key={i} className={cn(
                    'py-2',
                    i < tab.items.length - 1 && 'border-b border-dotted border-border/50',
                  )}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={cn('w-[5px] h-[5px] rounded-full shrink-0', {
                        'bg-err': tab.key === 'risk',
                        'bg-warn': tab.key === 'controversies',
                        'bg-primary': tab.key === 'shifts',
                      })} />
                      <span className="text-[0.8125rem] font-semibold text-foreground">
                        {entry.topic}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground leading-relaxed pl-[1.125rem]">
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

  const posOffset = circumference * 0.25
  const neuOffset = posOffset - posArc
  const negOffset = neuOffset - neuArc

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0"
      role="img" aria-label={`Sentiment: ${Math.round(posPct * 100)}% positive, ${Math.round(neuPct * 100)}% neutral, ${Math.round((1 - posPct - neuPct) * 100)}% negative`}>
      <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border)" strokeWidth="8" />
      {posArc > 0 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--ok)" strokeWidth="8"
          strokeDasharray={`${posArc} ${circumference - posArc}`}
          strokeDashoffset={posOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      {neuArc > 0.5 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--ink-faint)" strokeWidth="8"
          strokeDasharray={`${neuArc} ${circumference - neuArc}`}
          strokeDashoffset={neuOffset}
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      {negArc > 0.5 && (
        <circle cx="50" cy="50" r="45" fill="none"
          stroke="var(--err)" strokeWidth="8"
          strokeDasharray={`${negArc} ${circumference - negArc}`}
          strokeDashoffset={negOffset}
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      )}
      <text x="50" y="47" textAnchor="middle" dominantBaseline="central" fill="var(--ink)"
        className="text-[1.375rem] font-bold font-mono">
        {Math.round(posPct * 100)}%
      </text>
      <text x="50" y="62" textAnchor="middle" fill="var(--ink-faint)"
        className="text-[0.4375rem] font-semibold tracking-wider">
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
    bullish: 'text-ok',
    bearish: 'text-err',
    mixed: 'text-warn',
    neutral: 'text-muted-foreground',
  }
  const moodDotColors: Record<string, string> = {
    bullish: 'bg-ok',
    bearish: 'bg-err',
    mixed: 'bg-warn',
    neutral: 'bg-muted-foreground',
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
    <Card className="py-4 gap-3">
      <CardContent className="px-5 flex flex-col gap-3">
        {/* Header: mood indicator */}
        <div className="flex items-center justify-between">
          <SectionLabel>Sentiment</SectionLabel>
          <div className="flex items-center gap-1.5">
            <span className={cn('w-[7px] h-[7px] rounded-full', moodDotColors[sentiment.overall_mood] ?? 'bg-muted-foreground')} />
            <span className={cn('text-xs font-bold capitalize', moodColors[sentiment.overall_mood] ?? 'text-muted-foreground')}>
              {sentiment.overall_mood}
            </span>
          </div>
        </div>

        {/* Ring gauge + mood summary row */}
        <div className="flex gap-4 items-center flex-wrap">
          <SentimentRing positive={totalPos} neutral={totalNeu} negative={totalNeg} size={100} />
          {sentiment.mood_summary && (
            <p className="text-xs text-foreground leading-relaxed m-0 flex-1 min-w-[140px]">
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
                    <span className="text-[0.6875rem] font-medium"
                      style={{ color: PLATFORM_COLORS[source] ?? 'var(--ink-muted)' }}>
                      {SENSOR_LABELS[source] ?? source}
                    </span>
                    <div className="flex gap-2 text-[0.5rem] font-mono text-muted-foreground">
                      <span className="text-ok">{posPct}%</span>
                      <span>{neuPct}%</span>
                      <span className="text-err">{negPct}%</span>
                    </div>
                  </div>
                  <div className="flex h-[3px] rounded-sm overflow-hidden bg-border">
                    {posPct > 0 && (
                      <div title={`${counts.positive} positive (${posPct}%)`}
                        className="bg-ok transition-[width] duration-300" style={{ width: `${posPct}%` }} />
                    )}
                    {neuPct > 0 && (
                      <div title={`${counts.neutral} neutral (${neuPct}%)`}
                        className="bg-muted-foreground transition-[width] duration-300" style={{ width: `${neuPct}%` }} />
                    )}
                    {negPct > 0 && (
                      <div title={`${counts.negative} negative (${negPct}%)`}
                        className="bg-err transition-[width] duration-300" style={{ width: `${negPct}%` }} />
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
    <Card className="py-4 gap-3">
      <CardContent className="px-5 flex flex-col gap-3">
        <SectionLabel>Distribution</SectionLabel>
        {/* Segmented bar */}
        <div className="flex h-1.5 rounded-sm overflow-hidden gap-px">
          {segments.map(seg => seg.count > 0 ? (
            <div key={seg.key} style={{
              width: `${(seg.count / total) * 100}%`,
              background: seg.color,
              transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          ) : null)}
        </div>
        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {segments.map(seg => (
            <div key={seg.key} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: seg.color }} />
              <span className="text-[0.625rem] font-medium text-muted-foreground">{seg.label}</span>
              <span className="text-[0.625rem] font-semibold text-foreground font-mono ml-auto">{seg.count}</span>
            </div>
          ))}
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
    if (count === 0) return 'var(--border-soft)'
    if (count <= 5) return 'var(--accent-lo)'
    if (count <= 15) return 'var(--accent-mid)'
    return 'var(--accent)'
  }

  return (
    <Card className="py-4 gap-3">
      <CardContent className="px-5 flex flex-col gap-3">
        <SectionLabel>Source Activity (24h)</SectionLabel>
        <div className="overflow-x-auto">
          <div className="flex flex-col gap-[3px] min-w-[320px]">
            {sorted.map(({ source, hours }) => (
              <div key={source} className="flex items-center gap-1.5">
                <span className="w-14 text-[0.5rem] font-semibold text-muted-foreground font-mono truncate shrink-0">
                  {(SENSOR_LABELS[source] ?? source).slice(0, 8)}
                </span>
                <div className="grid grid-cols-[repeat(24,1fr)] gap-0.5 flex-1">
                  {hours.map((count, h) => (
                    <div key={h} title={`${SENSOR_LABELS[source] ?? source} — ${h}:00: ${count} items`}
                      className="w-full aspect-square min-w-[5px] rounded-sm transition-colors duration-300"
                      style={{ background: cellColor(count) }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div className="flex gap-2.5 text-[0.5rem] text-muted-foreground">
          {[
            { bg: 'var(--border-soft)', label: '0' },
            { bg: 'var(--accent-lo)', label: '1-5' },
            { bg: 'var(--accent-mid)', label: '6-15' },
            { bg: 'var(--accent)', label: '16+' },
          ].map(({ bg, label }) => (
            <span key={label} className="inline-flex items-center gap-[3px]">
              <span className="w-[5px] h-[5px] rounded-[1px]" style={{ background: bg }} /> {label}
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
  const all = [...report.sources_ok, ...report.sources_failed].sort()
  if (all.length === 0) return null

  return (
    <Card className="py-4 gap-3">
      <CardContent className="px-5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Source Health</SectionLabel>
          <span className="text-[0.5rem] font-mono text-muted-foreground">
            {report.sources_ok.length}/{all.length} ok
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {all.map(source => (
            <div key={source} title={`${SENSOR_LABELS[source] ?? source}: ${okSet.has(source) ? 'OK' : 'Failed'}`}
              className="flex items-center gap-[3px]">
              <span className={cn('w-[5px] h-[5px] rounded-full', okSet.has(source) ? 'bg-ok' : 'bg-err')} />
              <span className="text-[0.5rem] text-muted-foreground font-mono">
                {(SENSOR_LABELS[source] ?? source).slice(0, 8)}
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
    <Card className="py-4 gap-3">
      <CardContent className="px-5 flex flex-col gap-0">
        <div className="flex items-center justify-between mb-2.5">
          <SectionLabel>Trending</SectionLabel>
          <Link href="/data" className="text-[0.625rem] font-medium text-primary no-underline hover:underline">
            View all &#8250;
          </Link>
        </div>
        <div className="flex flex-col">
          {top.map((item, idx) => {
            const v = item.velocity!
            const pctStr = v.changePercent != null ? `${v.changePercent > 0 ? '+' : ''}${v.changePercent}%` : null
            const pctColor = v.changePercent != null
              ? v.changePercent > 0 ? 'text-ok' : v.changePercent < 0 ? 'text-err' : 'text-muted-foreground'
              : 'text-muted-foreground'
            const displayTitle = item.source === 'github'
              ? item.title.split(' — ')[0]
              : item.title

            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-2.5 py-[7px] no-underline',
                  idx < top.length - 1 && 'border-b border-dotted border-border/50',
                )}
              >
                {/* Rank number */}
                <span className={cn(
                  'text-[0.9375rem] font-bold w-5 text-right shrink-0 font-mono',
                  idx < 3 ? 'text-[var(--accent-dim)]' : 'text-border',
                )}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {displayTitle}
                  </div>
                  <div className="flex items-center gap-1 text-[0.5rem] text-muted-foreground mt-px">
                    <span className="px-1 rounded-sm bg-secondary font-medium">
                      {SENSOR_LABELS[item.source] ?? item.source}
                    </span>
                    {item.heat && <span>{item.heat}</span>}
                    {v.hoursOnTrend != null && (
                      <span className={cn(
                        'px-[3px] rounded-sm font-semibold',
                        v.hoursOnTrend <= 6
                          ? 'bg-[var(--cat-trend-tint)] text-[var(--cat-trend)]'
                          : 'bg-secondary text-muted-foreground',
                      )}>
                        {v.hoursOnTrend}h
                      </span>
                    )}
                  </div>
                </div>
                {pctStr && (
                  <span className={cn('text-xs font-bold font-mono shrink-0', pctColor)}>
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
    <Card className="py-2 gap-0">
      <CardContent className="px-5">
        <Accordion type="multiple" defaultValue={['section-0']}>
          {sections.map((section, i) => (
            <AccordionItem key={i} value={`section-${i}`} className="border-border/50">
              <AccordionTrigger className="py-3 text-xs font-semibold hover:no-underline">
                <div className="flex items-center gap-2">
                  <span>{section.title}</span>
                  <Badge variant="secondary" className="text-[0.5rem] px-1.5 py-0 font-mono">
                    {section.entries.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="flex flex-col gap-2">
                  {section.entries.map((entry, j) => (
                    <div key={j} className="text-xs text-foreground leading-relaxed pl-3 border-l-2 border-border">
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
    <div className="dashboard-grid">
      {/* Ticker skeleton */}
      <div className="dashboard-span-full bg-secondary rounded-[10px] px-5 py-2 flex gap-4">
        <Skeleton className="w-20 h-2.5" />
        <Skeleton className="w-24 h-2.5" />
        <Skeleton className="w-16 h-2.5" />
      </div>
      {/* Stats strip skeleton */}
      <Card className="dashboard-span-full py-0 gap-0 overflow-hidden">
        <div className="grid grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={cn(
              'py-4 px-5 flex flex-col items-center gap-1.5',
              i < 3 && 'border-r border-border/50',
            )}>
              <Skeleton className="w-12 h-6" />
              <Skeleton className="w-9 h-2" />
            </div>
          ))}
        </div>
      </Card>
      {/* Exec summary skeleton */}
      <div className="dashboard-span-2 bg-[var(--accent-wash)] border-l-[3px] border-l-[var(--accent-dim)] rounded-r-xl py-5 px-6 flex flex-col gap-2">
        <Skeleton className="w-24 h-2.5" />
        <Skeleton className="w-[95%] h-3" />
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-[70%] h-3" />
      </div>
      {/* Intel panel skeleton */}
      <Card className="py-4"><CardContent className="px-5 flex flex-col gap-2">
        <Skeleton className="w-20 h-2.5" />
        <Skeleton className="w-full h-4" />
        <Skeleton className="w-[80%] h-3" />
        <Skeleton className="w-[90%] h-3" />
        <Skeleton className="w-[60%] h-3" />
      </CardContent></Card>
      {/* Cards */}
      <Card className="py-4"><CardContent className="px-5 flex flex-col gap-2">
        <Skeleton className="w-20 h-2.5" />
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-[80%] h-3" />
        <Skeleton className="w-[60%] h-3" />
      </CardContent></Card>
      <Card className="py-4"><CardContent className="px-5 flex flex-col gap-2">
        <Skeleton className="w-16 h-2.5" />
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-[70%] h-3" />
      </CardContent></Card>
      <Card className="py-4"><CardContent className="px-5 flex flex-col gap-2">
        <Skeleton className="w-20 h-2.5" />
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-[80%] h-3" />
        <Skeleton className="w-full h-3" />
      </CardContent></Card>
      {/* Heatmap skeleton */}
      <Card className="dashboard-span-2 py-4"><CardContent className="px-5 flex flex-col gap-2">
        <Skeleton className="w-28 h-2.5" />
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-full h-3" />
      </CardContent></Card>
      {/* Section skeletons */}
      <Card className="dashboard-span-full py-4"><CardContent className="px-5 flex flex-col gap-2">
        <Skeleton className="w-32 h-2.5" />
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-[90%] h-3" />
      </CardContent></Card>
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
    <div className="dashboard-root p-5 max-w-[1280px] mx-auto">
      <style>{PULSE_CSS}</style>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <DashboardSkeleton />
          </motion.div>
        ) : !hasSummary && !hasReport ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="py-20 text-center">
              <CardContent className="flex flex-col items-center gap-2">
                <div className="text-lg font-semibold text-muted-foreground">
                  No briefing data yet
                </div>
                <p className="text-sm text-muted-foreground">
                  Run the pipeline from the{' '}
                  <Link href="/status" className="text-primary underline underline-offset-2">
                    Status page
                  </Link>
                  {' '}to fetch data and generate your first briefing.
                </p>
              </CardContent>
            </Card>
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
              <div className="dashboard-span-full text-center pt-0.5 pb-1">
                <Link href="/data" className="text-xs font-medium text-primary no-underline hover:underline">
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
