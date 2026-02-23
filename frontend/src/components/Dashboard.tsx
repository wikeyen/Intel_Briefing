// ABOUTME: Dashboard home page — intelligence terminal organized by domain with AI-generated briefs.
// ABOUTME: Two-column layout with sidebar, compact domain cards, slide-in detail panel.
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '@/api/client'
import type { IntelReport, IntelItem, BriefingSummary, PipelineStatus, SummaryProgress, OverallBriefing, BriefingSource, SentimentEntry } from '@/api/client'
import { SENSOR_LABELS, SENSOR_DISPLAY_MAP, CATEGORY_TO_DISPLAY } from '@/lib/sensors/taxonomy'
import type { CategoryKey, DisplayCategoryKey } from '@/lib/sensors/taxonomy'

// ---------------------------------------------------------------------------
// Animated height container — measures content and smoothly transitions height
// ---------------------------------------------------------------------------

function AnimatedHeight({ children, activeKey }: { children: React.ReactNode; activeKey: string }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')

  useEffect(() => {
    if (!contentRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.contentRect.height)
    })
    observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [activeKey])

  return (
    <motion.div
      animate={{ height }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      <div ref={contentRef}>
        <AnimatePresence initial={false} mode="wait">
          {children}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

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
              marginLeft: 2,
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

const DASH_CSS = `
@keyframes pulseDot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
`

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// ---------------------------------------------------------------------------
// Domain Definitions
// ---------------------------------------------------------------------------

/** Domain definition for compact cards and detail panel. */
type DomainDef = {
  key: string
  label: string
  accent: string
  sensors: string[]
  showSentiment?: boolean
}

const DOMAINS: DomainDef[] = [
  { key: 'macro', label: 'Macro & Finance', accent: 'var(--cat-news)', sensors: ['wallstreetcn', 'sources_36kr'] },
  { key: 'news', label: 'News & Tech', accent: 'var(--cat-news)', sensors: ['hacker_news', 'product_hunt', 'chrome_radar', 'github'] },
  { key: 'social', label: 'Social Pulse', accent: 'var(--cat-trend)', sensors: ['x', 'bluesky', 'mastodon'], showSentiment: true },
  { key: 'china-trend', label: 'China Trend', accent: 'var(--cat-trend)', sensors: ['weibo', 'xiaohongshu'] },
  { key: 'research', label: 'Research Radar', accent: 'var(--cat-research)', sensors: ['arxiv'] },
  { key: 'opinion', label: 'Opinion Digest', accent: 'var(--cat-opinion)', sensors: ['hn_blogs', 'rss_feeds'] },
  { key: 'china-community', label: 'China Community', accent: 'var(--cat-opinion)', sensors: ['v2ex', 'zhihu'] },
]

// ---------------------------------------------------------------------------
// Shared Components
// ---------------------------------------------------------------------------

/** Status-style card container — compact, bordered, interactive hover. */
function DashCard({ children, accent, style }: {
  children: React.ReactNode
  accent?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1rem 1.25rem',
        boxShadow: 'var(--shadow-card)',
        transition: 'box-shadow 200ms, border-color 200ms',
        overflow: 'hidden',
        ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
        ...style,
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
      {children}
    </div>
  )
}

/** Section label with optional status dot. */
function SectionLabel({ children, color, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
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
      ...style,
    }}>
      <span style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color ?? 'var(--ink-faint)',
        flexShrink: 0,
      }} />
      {children}
    </div>
  )
}

/** Stagger-fade on mount via CSS animation. */
function StaggerChild({ index, children, className }: { index: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      animation: `fadeSlideIn 300ms ease both`,
      animationDelay: `${index * 40}ms`,
    }}>
      {children}
    </div>
  )
}

/** Inline tab selector — replaces shadcn Tabs. */
function InlineTabs<T extends string>({ tabs, active, onChange }: {
  tabs: { key: T; label: string; count?: number; color?: string }[]
  active: T
  onChange: (key: T) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', height: 24 }}>
      {tabs.map(tab => {
        const isActive = tab.key === active
        return (
          <motion.button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            onMouseEnter={() => { if (!isActive) onChange(tab.key) }}
            layout
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: isActive ? '0.25rem 0.625rem' : '0.25rem 0.375rem',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: isActive ? 'var(--surface-inset)' : 'transparent',
              color: isActive ? 'var(--ink)' : 'var(--ink-faint)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
            whileHover={!isActive ? { background: 'var(--surface-inset)', scale: 1.08 } : {}}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <motion.span
              style={{
                borderRadius: '50%',
                background: tab.color ?? 'var(--ink-faint)',
                flexShrink: 0,
              }}
              animate={{ width: isActive ? 7 : 8, height: isActive ? 7 : 8, opacity: isActive ? 1 : 0.7 }}
              whileHover={{ opacity: 1, scale: 1.2 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
            <AnimatePresence mode="wait">
              {isActive && (
                <motion.span
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  style={{ overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (
                    <span style={{ fontSize: '0.625rem', color: tab.color ?? 'var(--ink-tertiary)' }}>
                      {tab.count}
                    </span>
                  )}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )
      })}
    </div>
  )
}

/** Social platform set for sentiment computation (ROW only). */
const SOCIAL = new Set(['x', 'bluesky', 'mastodon'])

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
      className="dashboard-ticker"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0 0.875rem',
        height: 36,
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-xs)',
        fontFamily: MONO,
        fontSize: '0.625rem',
        color: 'var(--ink-tertiary)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      {/* Pipeline state */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isActive ? 'var(--accent)' : 'var(--ink-tertiary)',
          ...(isActive ? { animation: 'pulseDot 1.6s ease-in-out infinite' } : {}),
        }} />
        <span style={{ fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--ink-tertiary)' }}>
          {isActive ? 'Updating' : 'Idle'}
        </span>
      </span>

      <span style={{ width: 1, height: 14, background: 'var(--border-subtle)', flexShrink: 0 }} />

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

      <span style={{ width: 1, height: 14, background: 'var(--border-subtle)', flexShrink: 0 }} />

      {/* Sources */}
      <span style={{ flexShrink: 0 }}>
        <span style={{ color: sourcesOk === sourcesTotal ? 'var(--ok-text)' : 'var(--warn-text)' }}>
          {sourcesOk}/{sourcesTotal}
        </span>
        {' '}src
      </span>

      {/* Items */}
      <span className="dashboard-ticker-hide-mobile" style={{ flexShrink: 0 }}>
        {allItems.length} items
      </span>

      {/* Mood */}
      {mood && (
        <>
          <span style={{ width: 1, height: 14, background: 'var(--border-subtle)', flexShrink: 0 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: moodDotColors[mood] ?? 'var(--ink-tertiary)' }} />
            <span style={{ fontWeight: 600, textTransform: 'capitalize' as const, color: moodColors[mood] ?? 'var(--ink-tertiary)' }}>
              {mood}
            </span>
          </span>
        </>
      )}

      {/* Risk flags */}
      {riskCount > 0 && (
        <span style={{
          fontWeight: 600,
          background: 'var(--sent-neg)',
          color: '#fff',
          borderRadius: 4,
          padding: '2px 6px',
          fontSize: '0.625rem',
          flexShrink: 0,
        }}>
          {riskCount} risk{riskCount !== 1 ? 's' : ''}
        </span>
      )}
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
  const paragraphs = overall.executive_summary.split(/\n\n+/).filter(p => p.trim())
  const isLong = paragraphs.length > 2

  return (
    <DashCard style={{ background: 'var(--accent-subtle)', borderColor: 'var(--accent-muted)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        <SectionLabel color="var(--accent)">Executive Summary</SectionLabel>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            ...(!expanded && isLong ? {
              maxHeight: 160,
              overflow: 'hidden',
              maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
            } : {}),
          }}
        >
          {paragraphs.map((para, i) => (
            <p
              key={i}
              style={{
                fontSize: '0.8125rem',
                lineHeight: 1.7,
                color: i === 0 ? 'var(--ink)' : 'var(--ink-secondary)',
                fontWeight: i === 0 ? 500 : 400,
                margin: 0,
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
                ...(i > 0 ? {
                  paddingLeft: '0.75rem',
                  borderLeft: '2px solid var(--border-subtle)',
                } : {}),
              }}
            >
              <InlineRefs text={para.trim()} globalSources={overall.sources} />
            </p>
          ))}
        </div>
        {isLong && (
          <button
            onClick={() => setExpanded(prev => !prev)}
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'var(--accent)',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
        {(expanded || !isLong) && overall.quick_scan && overall.quick_scan.length > 0 && (
          <div style={{ paddingTop: '0.625rem', borderTop: '1px solid var(--border-subtle)' }}>
            <SectionLabel color="var(--accent)" style={{ marginBottom: '0.375rem' }}>Quick Scan</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {overall.quick_scan.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--ink-secondary)', lineHeight: 1.6 }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 8 }} />
                  <span><InlineRefs text={entry.text} globalSources={overall.sources} /></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashCard>
  )
}

// ---------------------------------------------------------------------------
// Widget: Risk & Intelligence Panel
// ---------------------------------------------------------------------------

function RiskIntelPanel({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall)) return null
  const sentiment = overall.sentiment
  if (!sentiment) return null

  const tabData = [
    { key: 'risk' as const, label: 'Risk', items: sentiment.risk_flags ?? [], color: 'var(--sent-neg-text)', dot: 'var(--sent-neg)' },
    { key: 'controversies' as const, label: 'Controversies', items: sentiment.controversies ?? [], color: 'var(--sent-mixed-text)', dot: 'var(--sent-mixed)' },
    { key: 'shifts' as const, label: 'Shifts', items: sentiment.opinion_shifts ?? [], color: 'var(--accent)', dot: 'var(--accent)' },
  ]

  const totalAlerts = tabData.reduce((n, t) => n + t.items.length, 0)
  const nonEmptyTabs = tabData.filter(t => t.items.length > 0)
  const defaultTab = nonEmptyTabs[0]?.key ?? 'risk'
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [paused, setPaused] = useState(false)
  const [slideDir, setSlideDir] = useState(1) // 1 = forward, -1 = back
  const current = tabData.find(t => t.key === activeTab) ?? tabData[0]

  const switchTab = useCallback((next: string) => {
    const prevIdx = tabData.findIndex(t => t.key === activeTab)
    const nextIdx = tabData.findIndex(t => t.key === next)
    setSlideDir(nextIdx >= prevIdx ? 1 : -1)
    setActiveTab(next)
  }, [activeTab, tabData])

  // Auto-rotate tabs every 7s, pause on hover
  useEffect(() => {
    if (paused || nonEmptyTabs.length <= 1) return
    const timer = setInterval(() => {
      setActiveTab(prev => {
        const idx = nonEmptyTabs.findIndex(t => t.key === prev)
        setSlideDir(1)
        return nonEmptyTabs[(idx + 1) % nonEmptyTabs.length].key
      })
    }, 7000)
    return () => clearInterval(timer)
  }, [paused, nonEmptyTabs.length])

  return (
    <DashCard>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel>Intelligence</SectionLabel>
          {totalAlerts > 0 && (
            <span style={{
              fontFamily: MONO,
              fontSize: '0.625rem',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 4,
              background: sentiment.risk_flags?.length ? 'var(--sent-neg-bg)' : 'var(--surface-inset)',
              color: sentiment.risk_flags?.length ? 'var(--sent-neg-text)' : 'var(--ink-tertiary)',
            }}>
              {totalAlerts} alert{totalAlerts !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Tab selector */}
        <InlineTabs
          tabs={tabData.map(t => ({ key: t.key, label: t.label, count: t.items.length, color: t.color }))}
          active={activeTab}
          onChange={switchTab}
        />

        {/* Tab content — slide + height animation */}
        <AnimatedHeight activeKey={activeTab}>
          <motion.div
            key={activeTab}
            custom={slideDir}
            initial={(dir: number) => ({ x: dir * 24, opacity: 0 })}
            animate={{ x: 0, opacity: 1 }}
            exit={(dir: number) => ({ x: dir * -24, opacity: 0 })}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}
          >
            {current.items.length === 0 ? (
              <div style={{ padding: '1rem 0', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-tertiary)' }}>
                None detected
              </div>
            ) : (
              current.items.map((entry: SentimentEntry, i: number) => (
                <div key={i} style={{
                  padding: '0.625rem 0.75rem',
                  borderRadius: 8,
                  background: 'var(--surface-inset)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: 3 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: current.dot, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>
                      {entry.topic}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--ink-secondary)', lineHeight: 1.6, paddingLeft: '1.0625rem', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                    <InlineRefs text={entry.analysis} globalSources={overall.sources} />
                  </div>
                </div>
              ))
            )}
          </motion.div>
        </AnimatedHeight>
      </div>
    </DashCard>
  )
}

// ---------------------------------------------------------------------------
// Widget: Sentiment Ring Gauge (SVG)
// ---------------------------------------------------------------------------

function SentimentRing({ positive, neutral, negative, size = 80 }: {
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
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }}
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
        style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: MONO, letterSpacing: '-0.02em' }}>
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
// Widget: Sentiment Overview
// ---------------------------------------------------------------------------

function SentimentWidget({ summary, report }: { summary: BriefingSummary; report: IntelReport | null }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall)) return null
  const sentiment = overall.sentiment
  if (!sentiment) return null

  const moodColors: Record<string, string> = {
    bullish: 'var(--sent-bullish-text)', bearish: 'var(--sent-bearish-text)',
    mixed: 'var(--sent-mixed-text)', neutral: 'var(--ink-tertiary)',
  }
  const moodDotColors: Record<string, string> = {
    bullish: 'var(--sent-bullish)', bearish: 'var(--sent-bearish)',
    mixed: 'var(--sent-mixed)', neutral: 'var(--ink-tertiary)',
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

  const PLATFORM_COLORS: Record<string, string> = {
    x: 'var(--ink)', bluesky: '#0085FF', mastodon: '#6364FF',
  }

  const totalSocial = totalPos + totalNeu + totalNeg
  const overallPosPct = totalSocial > 0 ? Math.round((totalPos / totalSocial) * 100) : 0
  const overallNegPct = totalSocial > 0 ? Math.round((totalNeg / totalSocial) * 100) : 0
  const overallNeuPct = 100 - overallPosPct - overallNegPct

  return (
    <DashCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {/* Header: mood pill */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel>Sentiment</SectionLabel>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 7px',
            borderRadius: 4,
            background: sentiment.overall_mood !== 'neutral'
              ? (sentiment.overall_mood === 'bullish' ? 'var(--sent-pos-bg)' : sentiment.overall_mood === 'bearish' ? 'var(--sent-neg-bg)' : 'var(--sent-neu-bg)')
              : 'var(--surface-inset)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: moodDotColors[sentiment.overall_mood] ?? 'var(--ink-tertiary)' }} />
            <span style={{
              fontFamily: MONO,
              fontSize: '0.625rem',
              fontWeight: 600,
              textTransform: 'capitalize' as const,
              color: moodColors[sentiment.overall_mood] ?? 'var(--ink-tertiary)',
            }}>
              {sentiment.overall_mood}
            </span>
          </div>
        </div>

        {/* Mood summary */}
        {sentiment.mood_summary && (
          <p style={{ fontSize: '0.75rem', color: 'var(--ink)', lineHeight: 1.6, margin: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            <InlineRefs text={sentiment.mood_summary} globalSources={overall.sources} />
          </p>
        )}

        {/* Overall sentiment bar */}
        {totalSocial > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', gap: 8, fontFamily: MONO, fontSize: '0.625rem' }}>
                <span style={{ color: 'var(--sent-pos-text)', fontWeight: 600 }}>{overallPosPct}% pos</span>
                <span style={{ color: 'var(--ink-tertiary)' }}>{overallNeuPct}% neu</span>
                <span style={{ color: 'var(--sent-neg-text)', fontWeight: 600 }}>{overallNegPct}% neg</span>
              </div>
              <span style={{ fontFamily: MONO, fontSize: '0.625rem', color: 'var(--ink-faint)' }}>{totalSocial} posts</span>
            </div>
            <div style={{ display: 'flex', overflow: 'hidden', height: 6, borderRadius: 3, background: 'var(--border-subtle)', gap: 1 }}>
              {overallPosPct > 0 && <div style={{ width: `${overallPosPct}%`, background: 'var(--sent-pos)', transition: 'width 400ms ease' }} />}
              {overallNeuPct > 0 && <div style={{ width: `${overallNeuPct}%`, background: 'var(--sent-neu)', transition: 'width 400ms ease' }} />}
              {overallNegPct > 0 && <div style={{ width: `${overallNegPct}%`, background: 'var(--sent-neg)', transition: 'width 400ms ease' }} />}
            </div>
          </div>
        )}

        {/* Per-platform breakdown */}
        {Object.keys(bySource).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {Object.entries(bySource).map(([source, counts]) => {
              const posPct = Math.round((counts.positive / counts.total) * 100)
              const negPct = Math.round((counts.negative / counts.total) * 100)
              const neuPct = 100 - posPct - negPct
              return (
                <div key={source} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 500, color: PLATFORM_COLORS[source] ?? 'var(--ink-secondary)', width: 56, flexShrink: 0 }}>
                    {SENSOR_LABELS[source] ?? source}
                  </span>
                  <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 3, borderRadius: 2, background: 'var(--border-subtle)', gap: 1 }}>
                    {posPct > 0 && <div style={{ width: `${posPct}%`, background: 'var(--sent-pos)', transition: 'width 400ms ease' }} />}
                    {neuPct > 0 && <div style={{ width: `${neuPct}%`, background: 'var(--sent-neu)', transition: 'width 400ms ease' }} />}
                    {negPct > 0 && <div style={{ width: `${negPct}%`, background: 'var(--sent-neg)', transition: 'width 400ms ease' }} />}
                  </div>
                  <div style={{ display: 'flex', gap: 4, fontFamily: MONO, fontSize: '0.5625rem', color: 'var(--ink-tertiary)', flexShrink: 0 }}>
                    <span style={{ color: 'var(--sent-pos-text)' }}>{posPct}</span>
                    <span>/</span>
                    <span>{neuPct}</span>
                    <span>/</span>
                    <span style={{ color: 'var(--sent-neg-text)' }}>{negPct}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashCard>
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
    <DashCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel>Distribution</SectionLabel>
          <span style={{ fontFamily: MONO, fontSize: '0.625rem', color: 'var(--ink-tertiary)' }}>{total} items</span>
        </div>
        {/* Segmented bar */}
        <div style={{ display: 'flex', overflow: 'hidden', height: 8, borderRadius: 4, gap: 2 }}>
          {segments.map(seg => seg.count > 0 ? (
            <div key={seg.key} style={{
              width: `${(seg.count / total) * 100}%`,
              background: seg.color,
              borderRadius: 4,
              transition: 'width 500ms cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          ) : null)}
        </div>
        {/* Legend */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.75rem' }}>
          {segments.map(seg => {
            const pct = Math.round((seg.count / total) * 100)
            return (
              <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.6875rem', color: 'var(--ink-secondary)' }}>{seg.label}</span>
                <span style={{ fontFamily: MONO, fontSize: '0.625rem', fontWeight: 600, color: 'var(--ink)', marginLeft: 'auto' }}>
                  {seg.count} <span style={{ color: 'var(--ink-tertiary)' }}>({pct}%)</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </DashCard>
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
    <DashCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel>Source Health</SectionLabel>
          <span style={{
            fontFamily: MONO,
            fontSize: '0.625rem',
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 4,
            background: hasFailed ? 'var(--sent-neg-bg)' : 'var(--sent-pos-bg)',
            color: hasFailed ? 'var(--sent-neg-text)' : 'var(--sent-pos-text)',
          }}>
            {healthPct}% ok
          </span>
        </div>
        {/* Health bar */}
        <div style={{ display: 'flex', overflow: 'hidden', height: 4, borderRadius: 2, background: 'var(--border-subtle)' }}>
          <div style={{
            width: `${healthPct}%`,
            background: hasFailed ? 'var(--sent-mixed)' : 'var(--sent-pos)',
            transition: 'width 400ms ease',
            borderRadius: 2,
          }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.75rem' }}>
          {all.map(source => (
            <div key={source} title={`${SENSOR_LABELS[source] ?? source}: ${okSet.has(source) ? 'OK' : 'Failed'}`}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: okSet.has(source) ? 'var(--sent-pos)' : 'var(--sent-neg)',
              }} />
              <span style={{ fontFamily: MONO, fontSize: '0.625rem', color: 'var(--ink-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(SENSOR_LABELS[source] ?? source).slice(0, 14)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </DashCard>
  )
}

// ---------------------------------------------------------------------------
// Widget: Domain Card (compact, opens detail panel on click)
// ---------------------------------------------------------------------------

function DomainCardCompact({ domain, summary, onClick }: {
  domain: DomainDef
  summary: BriefingSummary
  onClick: () => void
}) {
  const matchingSections = summary.sections.filter(s => domain.sensors.includes(s.sensor_name))
  if (matchingSections.length === 0) return null

  const totalItems = matchingSections.reduce((n, s) => n + s.item_count, 0)
  const totalNotable = matchingSections.reduce((n, s) => n + s.items.length, 0)

  return (
    <DashCard>
      <div
        onClick={onClick}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel color={domain.accent}>{domain.label}</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{
              fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 600,
              background: 'var(--surface-alt)', borderRadius: 4,
              padding: '1px 5px', color: 'var(--ink-faint)',
            }}>
              {totalItems}
            </span>
            {totalNotable > 0 && (
              <span style={{ fontFamily: MONO, fontSize: '0.5625rem', color: 'var(--ink-tertiary)' }}>
                {totalNotable} notable
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-tertiary)', lineHeight: 1 }}>&#8250;</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {matchingSections.map(section => (
            <p key={section.sensor_name} style={{
              fontSize: '0.75rem', color: 'var(--ink-secondary)', lineHeight: 1.6, margin: 0,
              overflowWrap: 'break-word', wordBreak: 'break-word',
            }}>
              {section.summary}
            </p>
          ))}
        </div>
      </div>
    </DashCard>
  )
}

// ---------------------------------------------------------------------------
// Widget: Trending & Momentum
// ---------------------------------------------------------------------------

function TrendingWidget({ report, summary }: { report: IntelReport; summary?: BriefingSummary | null }) {
  const briefMap = new Map<string, string>()
  if (summary) {
    for (const section of summary.sections) {
      for (const item of section.items) {
        if (item.brief && item.url) briefMap.set(item.url, item.brief)
      }
    }
  }

  const trendItems: IntelItem[] = []
  for (const [cat, items] of Object.entries(report.items)) {
    for (const item of items) {
      if (displayCategoryOf(item, cat) === 'trend' && item.velocity) trendItems.push(item)
    }
  }

  trendItems.sort((a, b) => Math.abs(b.velocity?.changePercent ?? 0) - Math.abs(a.velocity?.changePercent ?? 0))

  const top = trendItems.slice(0, 5)
  if (top.length === 0) return null

  return (
    <DashCard>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <SectionLabel>Trending & Momentum</SectionLabel>
          <Link href="/data" style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--accent)', textDecoration: 'none' }}>
            View all &#8250;
          </Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {top.map((item, idx) => {
            const v = item.velocity!
            const pctStr = v.changePercent != null ? `${v.changePercent > 0 ? '+' : ''}${v.changePercent}%` : null
            const pctColor = v.changePercent != null
              ? v.changePercent > 0 ? 'var(--sent-pos-text)' : v.changePercent < 0 ? 'var(--sent-neg-text)' : 'var(--ink-tertiary)'
              : 'var(--ink-tertiary)'
            const displayTitle = item.source === 'github' ? item.title.split(' — ')[0] : item.title
            const brief = briefMap.get(item.url)
            const isRapid = v.hoursOnTrend != null && v.hoursOnTrend <= 6

            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  textDecoration: 'none',
                  padding: '8px 1.25rem',
                  margin: '0 -1.25rem',
                  ...(idx < top.length - 1 ? { borderBottom: '1px solid var(--border-subtle)' } : {}),
                }}
              >
                {/* Rank */}
                <span style={{
                  fontFamily: MONO,
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  color: idx < 3 ? 'var(--accent)' : 'var(--ink-disabled)',
                  minWidth: '1rem',
                  flexShrink: 0,
                  marginTop: 2,
                }}>
                  {idx + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayTitle}
                  </div>
                  {brief && (
                    <div style={{ fontSize: '0.6875rem', color: 'var(--ink-tertiary)', lineHeight: 1.5, marginTop: 1 }}>
                      {brief}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: '0.5625rem', color: 'var(--ink-tertiary)' }}>
                    <span style={{
                      fontFamily: MONO,
                      fontWeight: 500,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: 'var(--surface-alt)',
                    }}>
                      {SENSOR_LABELS[item.source] ?? item.source}
                    </span>
                    {item.heat && <span>{item.heat}</span>}
                    {v.hoursOnTrend != null && (
                      <span style={{
                        fontFamily: MONO,
                        fontWeight: 600,
                        padding: '0 4px',
                        borderRadius: 4,
                        background: isRapid ? 'var(--cat-trend-bg)' : 'var(--surface-alt)',
                        color: isRapid ? 'var(--cat-trend)' : 'var(--ink-tertiary)',
                      }}>
                        {isRapid ? 'RAPID' : 'SUSTAINED'} &middot; {v.hoursOnTrend}h
                      </span>
                    )}
                  </div>
                </div>
                {pctStr && (
                  <span style={{ fontFamily: MONO, fontSize: '0.625rem', fontWeight: 700, color: pctColor, flexShrink: 0, marginTop: 2 }}>
                    {pctStr}
                  </span>
                )}
              </a>
            )
          })}
        </div>
      </div>
    </DashCard>
  )
}

// ---------------------------------------------------------------------------
// Detail Panel — slide-in overlay for domain deep-dive
// ---------------------------------------------------------------------------

function DetailPanel({ domain, summary, report, onClose }: {
  domain: DomainDef
  summary: BriefingSummary
  report: IntelReport | null
  onClose: () => void
}) {
  const matchingSections = summary.sections.filter(s => domain.sensors.includes(s.sensor_name))

  // Per-platform sentiment for social domains
  const platformSentiment: Record<string, { positive: number; negative: number; neutral: number; total: number }> = {}
  if (domain.showSentiment && report) {
    const allItems: IntelItem[] = Object.values(report.items).flat()
    for (const item of allItems) {
      if (domain.sensors.includes(item.source) && item.sentiment) {
        if (!platformSentiment[item.source]) platformSentiment[item.source] = { positive: 0, negative: 0, neutral: 0, total: 0 }
        platformSentiment[item.source][item.sentiment.label]++
        platformSentiment[item.source].total++
      }
    }
  }

  const overall = summary.overall
  const moodSummary = domain.showSentiment && isStructuredOverall(overall)
    ? overall.sentiment?.mood_summary ?? null
    : null

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
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 480, maxWidth: '90vw',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          zIndex: 101,
          padding: '1.5rem',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}
      >
        {/* Header with close button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionLabel color={domain.accent}>{domain.label}</SectionLabel>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface-inset)', color: 'var(--ink-tertiary)',
              fontSize: '1rem', lineHeight: 1,
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--ink)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-inset)'; e.currentTarget.style.color = 'var(--ink-tertiary)' }}
          >
            &times;
          </button>
        </div>

        {/* Mood summary for social domains */}
        {moodSummary && (
          <p style={{ fontSize: '0.75rem', color: 'var(--ink)', lineHeight: 1.6, margin: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            {moodSummary}
          </p>
        )}

        {/* Per-source sections */}
        {matchingSections.map((section, sIdx) => (
          <div key={section.sensor_name} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {/* Source header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink)' }}>
                {section.label}
              </span>
              <span style={{
                fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 600,
                background: 'var(--surface-alt)', borderRadius: 4,
                padding: '1px 5px', color: 'var(--ink-faint)',
              }}>
                {section.item_count}
              </span>
            </div>

            {/* AI summary */}
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)', lineHeight: 1.6, margin: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
              {section.summary}
            </p>

            {/* Sentiment bar */}
            {domain.showSentiment && platformSentiment[section.sensor_name] && (() => {
              const counts = platformSentiment[section.sensor_name]
              const posPct = Math.round((counts.positive / counts.total) * 100)
              const negPct = Math.round((counts.negative / counts.total) * 100)
              const neuPct = 100 - posPct - negPct
              return (
                <div>
                  <div style={{ display: 'flex', gap: 6, fontFamily: MONO, fontSize: '0.625rem', color: 'var(--ink-tertiary)', marginBottom: 2 }}>
                    <span style={{ color: 'var(--sent-pos-text)' }}>{posPct}% pos</span>
                    <span>{neuPct}% neu</span>
                    <span style={{ color: 'var(--sent-neg-text)' }}>{negPct}% neg</span>
                  </div>
                  <div style={{ display: 'flex', overflow: 'hidden', height: 4, borderRadius: 2, background: 'var(--border-subtle)', gap: 1 }}>
                    {posPct > 0 && <div style={{ width: `${posPct}%`, background: 'var(--sent-pos)', transition: 'width 400ms ease' }} />}
                    {neuPct > 0 && <div style={{ width: `${neuPct}%`, background: 'var(--sent-neu)', opacity: 0.4, transition: 'width 400ms ease' }} />}
                    {negPct > 0 && <div style={{ width: `${negPct}%`, background: 'var(--sent-neg)', transition: 'width 400ms ease' }} />}
                  </div>
                </div>
              )
            })()}

            {/* Notable items */}
            {section.items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {section.items.map((item, idx) => (
                  <a
                    key={idx}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', gap: '0.5rem', textDecoration: 'none',
                      borderRadius: 6, padding: '6px 10px', margin: '0 -10px',
                      transition: 'background 150ms ease',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: domain.accent, flexShrink: 0, marginTop: 6 }} />
                    <div style={{ flex: 1, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.5 }}>
                        {item.title}
                      </div>
                      {item.brief && (
                        <div style={{ fontSize: '0.6875rem', color: 'var(--ink-tertiary)', lineHeight: 1.5, marginTop: 1 }}>
                          {item.brief}
                        </div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}

            {/* Divider between sources */}
            {sIdx < matchingSections.length - 1 && (
              <div style={{ borderBottom: '1px solid var(--border-subtle)', marginTop: 2 }} />
            )}
          </div>
        ))}

        {/* Empty state */}
        {matchingSections.length === 0 && (
          <div style={{ padding: '2rem 0', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-tertiary)' }}>
            No data available for this domain
          </div>
        )}
      </motion.div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Dashboard Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div>
      {/* Ticker skeleton */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '0 0.875rem',
        height: 36,
        alignItems: 'center',
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-xs)',
      }}>
        <div className="skeleton-shimmer" style={{ width: 80, height: 10 }} />
        <div className="skeleton-shimmer" style={{ width: 96, height: 10 }} />
        <div className="skeleton-shimmer" style={{ width: 64, height: 10 }} />
      </div>
      <div className="dashboard-columns" style={{ marginTop: '0.75rem' }}>
        {/* Main column */}
        <div className="dashboard-main">
          {/* Exec summary */}
          <DashCard style={{ background: 'var(--accent-subtle)', borderColor: 'var(--accent-muted)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="skeleton-shimmer" style={{ width: 112, height: 10 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton-shimmer" style={{ width: '100%', height: 10 }} />
                <div className="skeleton-shimmer" style={{ width: '90%', height: 10 }} />
              </div>
              <div style={{ paddingLeft: 12, borderLeft: '2px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton-shimmer" style={{ width: '95%', height: 10 }} />
                <div className="skeleton-shimmer" style={{ width: '75%', height: 10 }} />
              </div>
            </div>
          </DashCard>
          <hr className="dash-divider" />
          {/* Domain cards */}
          <div className="dashboard-domains">
            {[0, 1, 2, 3].map(i => (
              <DashCard key={i}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="skeleton-shimmer" style={{ width: 112, height: 10 }} />
                  <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
                  <div className="skeleton-shimmer" style={{ width: '60%', height: 12 }} />
                </div>
              </DashCard>
            ))}
          </div>
        </div>
        {/* Sidebar */}
        <div className="dashboard-sidebar">
          {/* Intelligence */}
          <DashCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="skeleton-shimmer" style={{ width: 80, height: 10 }} />
              {[0, 1].map(i => (
                <div key={i} style={{ padding: '0.5rem 0.625rem', borderRadius: 8, background: 'var(--surface-inset)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div className="skeleton-shimmer" style={{ width: 7, height: 7, borderRadius: '50%' }} />
                    <div className="skeleton-shimmer" style={{ width: 100, height: 10 }} />
                  </div>
                  <div className="skeleton-shimmer" style={{ width: '90%', height: 9, marginLeft: 13 }} />
                </div>
              ))}
            </div>
          </DashCard>
          <hr className="dash-divider" />
          {/* Sentiment */}
          <DashCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div className="skeleton-shimmer" style={{ width: 64, height: 10 }} />
                <div className="skeleton-shimmer" style={{ width: 48, height: 16, borderRadius: 4 }} />
              </div>
              <div className="skeleton-shimmer" style={{ width: '100%', height: 10 }} />
              <div className="skeleton-shimmer" style={{ width: '100%', height: 6, borderRadius: 3 }} />
              {[0, 1, 2].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="skeleton-shimmer" style={{ width: 48, height: 8 }} />
                  <div className="skeleton-shimmer" style={{ flex: 1, height: 3, borderRadius: 2 }} />
                </div>
              ))}
            </div>
          </DashCard>
          <hr className="dash-divider" />
          {/* Trending */}
          <DashCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skeleton-shimmer" style={{ width: 96, height: 10 }} />
              {[0, 1, 2].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="skeleton-shimmer" style={{ width: '70%', height: 10 }} />
                  <div className="skeleton-shimmer" style={{ width: 40, height: 8 }} />
                </div>
              ))}
            </div>
          </DashCard>
          <hr className="dash-divider" />
          {/* Distribution */}
          <DashCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skeleton-shimmer" style={{ width: 80, height: 10 }} />
              <div className="skeleton-shimmer" style={{ width: '100%', height: 8, borderRadius: 4 }} />
            </div>
          </DashCard>
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
  const [selectedDomain, setSelectedDomain] = useState<DomainDef | null>(null)

  const [showUpdatedBanner, setShowUpdatedBanner] = useState(false)
  const lastPipelineCompletedAt = useRef<string | null>(null)
  const lastSummaryAt = useRef<string | null>(null)
  const prevFetchedAtRef = useRef<string | null>(null)

  const markViewed = useCallback((fetchedAt: string) => {
    try { localStorage.setItem('ib:dashboard:lastViewedFetch', fetchedAt) } catch {}
  }, [])

  useEffect(() => {
    if (!report?.fetched_at) return
    const prev = prevFetchedAtRef.current
    prevFetchedAtRef.current = report.fetched_at
    markViewed(report.fetched_at)
    if (prev && prev !== report.fetched_at) setShowUpdatedBanner(true)
  }, [report?.fetched_at, markViewed])

  useEffect(() => {
    if (!showUpdatedBanner) return
    const t = setTimeout(() => setShowUpdatedBanner(false), 4000)
    return () => clearTimeout(t)
  }, [showUpdatedBanner])

  useEffect(() => {
    Promise.all([
      api.getLatest().then(setReport).catch(() => {}),
      api.getSummary().then(r => setSummary(r.summary)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const isActive = !!(summaryProgress?.running) || !!(pipelineStatus?.running && pipelineStatus.alive !== false)

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
    <div className="dashboard-root page-padding" style={{ maxWidth: 1360, margin: '0 auto', paddingLeft: '2.5rem', paddingRight: '2.5rem' }}>
      <style>{DASH_CSS}</style>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <DashboardSkeleton />
          </motion.div>
        ) : !hasSummary && !hasReport ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <DashCard style={{ padding: '4rem 2rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink-tertiary)' }}>
                  No briefing data yet
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--ink-secondary)', margin: 0 }}>
                  Run the pipeline from the{' '}
                  <Link href="/status" style={{ textDecoration: 'underline', textUnderlineOffset: 2, color: 'var(--accent)' }}>
                    Status page
                  </Link>
                  {' '}to fetch data and generate your first briefing.
                </p>
              </div>
            </DashCard>
          </motion.div>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            {/* "Briefing updated" flash */}
            <AnimatePresence>
              {showUpdatedBanner && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.375rem 0.875rem',
                    borderRadius: 6,
                    background: 'var(--accent-subtle)',
                    border: '1px solid var(--accent-muted)',
                    marginBottom: 8,
                    fontFamily: MONO,
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    color: 'var(--accent)',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                  Briefing updated
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status Ticker — sticky at top */}
            <div className="dashboard-ticker-sticky">
              <StaggerChild index={0}>
                <StatusTicker
                  report={report}
                  summary={summary}
                  pipelineStatus={pipelineStatus}
                  summaryProgress={summaryProgress}
                />
              </StaggerChild>
            </div>

            {/* Two-column layout: Main + Sidebar */}
            <div className="dashboard-columns" style={{ marginTop: '0.75rem' }}>
              {/* Main column */}
              <div className="dashboard-main">
                {summary && (
                  <>
                    {/* Executive Summary */}
                    <StaggerChild index={1}>
                      <ExecSummaryWidget summary={summary} />
                    </StaggerChild>

                    <hr className="dash-divider" />

                    {/* Domain cards grid */}
                    <div className="dashboard-domains">
                      {DOMAINS.map((domain, i) => (
                        <StaggerChild key={domain.key} index={5 + i}>
                          <DomainCardCompact
                            domain={domain}
                            summary={summary}
                            onClick={() => setSelectedDomain(domain)}
                          />
                        </StaggerChild>
                      ))}
                    </div>
                  </>
                )}

                {/* Footer link */}
                <div style={{ textAlign: 'center', paddingTop: 2, paddingBottom: 4 }}>
                  <Link href="/data" style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--accent)', textDecoration: 'none' }}>
                    View full feed &#8250;
                  </Link>
                </div>
              </div>

              {/* Sidebar */}
              <div className="dashboard-sidebar">
                {summary && (
                  <>
                    <StaggerChild index={3}>
                      <RiskIntelPanel summary={summary} />
                    </StaggerChild>
                    <hr className="dash-divider" />
                    <StaggerChild index={4}>
                      <SentimentWidget summary={summary} report={report} />
                    </StaggerChild>
                    <hr className="dash-divider" />
                  </>
                )}
                {report && (
                  <>
                    <StaggerChild index={12}>
                      <TrendingWidget report={report} summary={summary} />
                    </StaggerChild>
                    <hr className="dash-divider" />
                    <StaggerChild index={13}>
                      <CategoryDistributionWidget report={report} />
                    </StaggerChild>
                    <hr className="dash-divider" />
                    <StaggerChild index={14}>
                      <SourceHealthWidget report={report} />
                    </StaggerChild>
                  </>
                )}
              </div>
            </div>

            {/* Detail panel overlay */}
            <AnimatePresence>
              {selectedDomain && summary && (
                <DetailPanel
                  domain={selectedDomain}
                  summary={summary}
                  report={report}
                  onClose={() => setSelectedDomain(null)}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
