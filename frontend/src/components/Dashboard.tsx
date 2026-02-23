// ABOUTME: Dashboard home page — intelligence terminal organized by domain with AI-generated briefs.
// ABOUTME: Status-style design language — dense cards, monospace metrics, state-driven borders.
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '@/api/client'
import type { IntelReport, IntelItem, BriefingSummary, PipelineStatus, SummaryProgress, OverallBriefing, BriefingSource, SentimentEntry } from '@/api/client'
import { SENSOR_LABELS, SENSOR_DISPLAY_MAP, CATEGORY_TO_DISPLAY } from '@/lib/sensors/taxonomy'
import type { CategoryKey, DisplayCategoryKey } from '@/lib/sensors/taxonomy'

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
function StaggerChild({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div style={{
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
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {tabs.map(tab => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              fontSize: '0.6875rem',
              fontWeight: isActive ? 600 : 400,
              padding: '0.25rem 0.625rem',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: isActive ? 'var(--surface-inset)' : 'transparent',
              color: isActive ? 'var(--ink)' : 'var(--ink-faint)',
              transition: 'background 150ms ease, color 150ms ease',
            }}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span style={{ marginLeft: 4, fontSize: '0.625rem', fontWeight: 600, color: tab.color ?? 'var(--ink-tertiary)' }}>
                {tab.count}
              </span>
            )}
          </button>
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
  const isLong = overall.executive_summary.length > 400

  return (
    <DashCard accent="var(--accent)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        <SectionLabel color="var(--accent)">Executive Summary</SectionLabel>
        <div
          style={{
            fontSize: '0.8125rem',
            lineHeight: 1.6,
            color: 'var(--ink)',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            ...(!expanded && isLong ? {
              maxHeight: 140,
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
// Widget: Thematic Sections
// ---------------------------------------------------------------------------

function ThematicSectionsWidget({ summary }: { summary: BriefingSummary }) {
  const overall = summary.overall
  if (!isStructuredOverall(overall)) return null
  const sections = overall.sections
  if (!sections || sections.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <SectionLabel>Investment Themes</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.5rem' }}>
        {sections.map((section, i) => (
          <DashCard key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink)' }}>
                  {section.title}
                </span>
                <span style={{
                  fontFamily: MONO,
                  fontSize: '0.5625rem',
                  fontWeight: 600,
                  background: 'var(--surface-alt)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  color: 'var(--ink-faint)',
                }}>
                  {section.entries.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {section.entries.map((entry, j) => (
                  <div key={j} style={{
                    display: 'flex',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    color: 'var(--ink-secondary)',
                    lineHeight: 1.6,
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                  }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 8 }} />
                    <span><InlineRefs text={entry.text} globalSources={overall.sources} /></span>
                  </div>
                ))}
              </div>
            </div>
          </DashCard>
        ))}
      </div>
    </div>
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
  const defaultTab = tabData.find(t => t.items.length > 0)?.key ?? 'risk'
  const [activeTab, setActiveTab] = useState(defaultTab)
  const current = tabData.find(t => t.key === activeTab) ?? tabData[0]

  return (
    <DashCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
          onChange={setActiveTab}
        />

        {/* Tab content */}
        <div className="risk-grid" style={{ minHeight: 60 }}>
          {current.items.length === 0 ? (
            <div style={{ padding: '1rem 0', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-tertiary)' }}>
              None detected
            </div>
          ) : (
            current.items.map((entry: SentimentEntry, i: number) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '0.625rem 0.75rem',
                borderRadius: 6,
                background: 'var(--surface-inset)',
                borderLeft: `3px solid ${current.dot}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
                    {entry.topic}
                  </span>
                  <span style={{
                    fontFamily: MONO,
                    fontSize: '0.5625rem',
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: current.key === 'risk' ? 'var(--sent-neg-bg)' : current.key === 'controversies' ? 'var(--sent-neu-bg)' : 'var(--accent-subtle)',
                    color: current.color,
                    letterSpacing: '0.04em',
                    flexShrink: 0,
                  }}>
                    {current.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)', lineHeight: 1.6 }}>
                  <InlineRefs text={entry.analysis} globalSources={overall.sources} />
                </div>
              </div>
            ))
          )}
        </div>
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

        {/* Ring gauge + mood summary */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <SentimentRing positive={totalPos} neutral={totalNeu} negative={totalNeg} size={80} />
          {sentiment.mood_summary && (
            <p style={{ fontSize: '0.75rem', color: 'var(--ink)', lineHeight: 1.5, margin: 0, flex: 1, minWidth: 120 }}>
              <InlineRefs text={sentiment.mood_summary} globalSources={overall.sources} />
            </p>
          )}
        </div>

        {/* Per-platform sentiment bars */}
        {Object.keys(bySource).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {Object.entries(bySource).map(([source, counts]) => {
              const posPct = Math.round((counts.positive / counts.total) * 100)
              const negPct = Math.round((counts.negative / counts.total) * 100)
              const neuPct = 100 - posPct - negPct
              return (
                <div key={source}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontFamily: MONO, fontSize: '0.625rem', fontWeight: 500, color: PLATFORM_COLORS[source] ?? 'var(--ink-secondary)' }}>
                      {SENSOR_LABELS[source] ?? source}
                    </span>
                    <div style={{ display: 'flex', gap: 6, fontFamily: MONO, fontSize: '0.625rem', color: 'var(--ink-tertiary)' }}>
                      <span style={{ color: 'var(--sent-pos-text)' }}>{posPct}%</span>
                      <span>{neuPct}%</span>
                      <span style={{ color: 'var(--sent-neg-text)' }}>{negPct}%</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', overflow: 'hidden', height: 4, borderRadius: 2, background: 'var(--border-subtle)', gap: 1 }}>
                    {posPct > 0 && <div style={{ width: `${posPct}%`, background: 'var(--sent-pos)', transition: 'width 400ms ease' }} />}
                    {neuPct > 0 && <div style={{ width: `${neuPct}%`, background: 'var(--sent-neu)', opacity: 0.4, transition: 'width 400ms ease' }} />}
                    {negPct > 0 && <div style={{ width: `${negPct}%`, background: 'var(--sent-neg)', transition: 'width 400ms ease' }} />}
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
// Widget: Sensor Domain Card (shared, reusable)
// ---------------------------------------------------------------------------

function SensorDomainCard({ sectionLabel, accentColor, sensorNames, summary, report, showSentimentBars, moodSummary }: {
  sectionLabel: string
  accentColor: string
  sensorNames: string[]
  summary: BriefingSummary
  report?: IntelReport | null
  showSentimentBars?: boolean
  moodSummary?: string | null
}) {
  const matchingSections = summary.sections.filter(s => sensorNames.includes(s.sensor_name))
  if (matchingSections.length === 0) return null

  const platformSentiment: Record<string, { positive: number; negative: number; neutral: number; total: number }> = {}
  if (showSentimentBars && report) {
    const allItems: IntelItem[] = Object.values(report.items).flat()
    for (const item of allItems) {
      if (sensorNames.includes(item.source) && item.sentiment) {
        if (!platformSentiment[item.source]) platformSentiment[item.source] = { positive: 0, negative: 0, neutral: 0, total: 0 }
        platformSentiment[item.source][item.sentiment.label]++
        platformSentiment[item.source].total++
      }
    }
  }

  return (
    <DashCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <SectionLabel color={accentColor}>{sectionLabel}</SectionLabel>

        {moodSummary && (
          <p style={{ fontSize: '0.75rem', color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>
            {moodSummary}
          </p>
        )}

        {matchingSections.map((section, sIdx) => (
          <div key={section.sensor_name} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {/* Source header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink)' }}>
                {section.label}
              </span>
              <span style={{
                fontFamily: MONO,
                fontSize: '0.5625rem',
                fontWeight: 600,
                background: 'var(--surface-alt)',
                borderRadius: 4,
                padding: '1px 5px',
                color: 'var(--ink-faint)',
              }}>
                {section.item_count}
              </span>
            </div>

            {/* AI summary */}
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)', lineHeight: 1.6, margin: 0 }}>
              {section.summary}
            </p>

            {/* Sentiment bar */}
            {showSentimentBars && platformSentiment[section.sensor_name] && (() => {
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
                      display: 'flex',
                      gap: '0.5rem',
                      textDecoration: 'none',
                      borderRadius: 6,
                      padding: '6px 10px',
                      margin: '0 -10px',
                      transition: 'background 150ms ease',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: accentColor, flexShrink: 0, marginTop: 6 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
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
      </div>
    </DashCard>
  )
}

// ---------------------------------------------------------------------------
// Domain Widgets
// ---------------------------------------------------------------------------

function MacroIntelWidget({ summary }: { summary: BriefingSummary }) {
  return <SensorDomainCard sectionLabel="Macro & Finance" accentColor="var(--cat-news)" sensorNames={['wallstreetcn', 'sources_36kr']} summary={summary} />
}

function NewsTechWidget({ summary }: { summary: BriefingSummary }) {
  return <SensorDomainCard sectionLabel="News & Tech" accentColor="var(--cat-news)" sensorNames={['hacker_news', 'product_hunt', 'chrome_radar', 'github']} summary={summary} />
}

function SocialPulseWidget({ summary, report }: { summary: BriefingSummary; report: IntelReport | null }) {
  const overall = summary.overall
  const moodSummary = isStructuredOverall(overall) ? overall.sentiment?.mood_summary ?? null : null
  return <SensorDomainCard sectionLabel="Social Pulse" accentColor="var(--cat-trend)" sensorNames={['x', 'bluesky', 'mastodon']} summary={summary} report={report} showSentimentBars moodSummary={moodSummary} />
}

function ChinaTrendWidget({ summary }: { summary: BriefingSummary }) {
  return <SensorDomainCard sectionLabel="China Trend" accentColor="var(--cat-trend)" sensorNames={['weibo', 'xiaohongshu']} summary={summary} />
}

function ResearchRadarWidget({ summary }: { summary: BriefingSummary }) {
  return <SensorDomainCard sectionLabel="Research Radar" accentColor="var(--cat-research)" sensorNames={['arxiv']} summary={summary} />
}

function OpinionDigestWidget({ summary }: { summary: BriefingSummary }) {
  return <SensorDomainCard sectionLabel="Opinion Digest" accentColor="var(--cat-opinion)" sensorNames={['hn_blogs', 'rss_feeds']} summary={summary} />
}

function ChinaCommunityWidget({ summary }: { summary: BriefingSummary }) {
  return <SensorDomainCard sectionLabel="China Community" accentColor="var(--cat-opinion)" sensorNames={['v2ex', 'zhihu']} summary={summary} />
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

  const top = trendItems.slice(0, 10)
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
      <div className="dashboard-layout" style={{ marginTop: '0.75rem' }}>
        <div className="dashboard-main" style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {/* Exec summary */}
          <DashCard accent="var(--accent)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skeleton-shimmer" style={{ width: 96, height: 10 }} />
              <div className="skeleton-shimmer" style={{ width: '95%', height: 12 }} />
              <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
              <div className="skeleton-shimmer" style={{ width: '70%', height: 12 }} />
            </div>
          </DashCard>
          {/* Theme cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.5rem' }}>
            {[0, 1].map(i => (
              <DashCard key={i}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="skeleton-shimmer" style={{ width: 120, height: 10 }} />
                  <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
                  <div className="skeleton-shimmer" style={{ width: '80%', height: 12 }} />
                </div>
              </DashCard>
            ))}
          </div>
          {/* Domain cards */}
          {[0, 1, 2].map(i => (
            <DashCard key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="skeleton-shimmer" style={{ width: 112, height: 10 }} />
                <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
                <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
                <div className="skeleton-shimmer" style={{ width: '60%', height: 12 }} />
              </div>
            </DashCard>
          ))}
        </div>
        <div className="dashboard-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          <DashCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skeleton-shimmer" style={{ width: 64, height: 10 }} />
              <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
              <div className="skeleton-shimmer" style={{ width: '70%', height: 12 }} />
            </div>
          </DashCard>
          <DashCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skeleton-shimmer" style={{ width: 80, height: 10 }} />
              <div className="skeleton-shimmer" style={{ width: '100%', height: 12 }} />
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
    <div className="dashboard-root page-padding" style={{ maxWidth: 1024, margin: '0 auto', paddingLeft: '2.5rem', paddingRight: '2.5rem' }}>
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

            {/* Status Ticker */}
            <StaggerChild index={0}>
              <StatusTicker
                report={report}
                summary={summary}
                pipelineStatus={pipelineStatus}
                summaryProgress={summaryProgress}
              />
            </StaggerChild>

            {/* Two-column layout */}
            <div className="dashboard-layout" style={{ marginTop: '0.75rem' }}>
              {/* Main Content */}
              <div className="dashboard-main" style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {summary && <StaggerChild index={1}><ExecSummaryWidget summary={summary} /></StaggerChild>}
                {summary && <StaggerChild index={2}><ThematicSectionsWidget summary={summary} /></StaggerChild>}
                {summary && <StaggerChild index={3}><RiskIntelPanel summary={summary} /></StaggerChild>}
                {summary && <StaggerChild index={4}><MacroIntelWidget summary={summary} /></StaggerChild>}
                {summary && <StaggerChild index={5}><NewsTechWidget summary={summary} /></StaggerChild>}
                {summary && <StaggerChild index={6}><SocialPulseWidget summary={summary} report={report} /></StaggerChild>}
                {report && <StaggerChild index={7}><TrendingWidget report={report} summary={summary} /></StaggerChild>}
                {summary && <StaggerChild index={8}><ChinaTrendWidget summary={summary} /></StaggerChild>}
                {summary && <StaggerChild index={9}><ResearchRadarWidget summary={summary} /></StaggerChild>}
                {summary && <StaggerChild index={10}><OpinionDigestWidget summary={summary} /></StaggerChild>}
                {summary && <StaggerChild index={11}><ChinaCommunityWidget summary={summary} /></StaggerChild>}

                <div style={{ textAlign: 'center', paddingTop: 2, paddingBottom: 4 }}>
                  <Link href="/data" style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--accent)', textDecoration: 'none' }}>
                    View full feed &#8250;
                  </Link>
                </div>
              </div>

              {/* Right Sidebar */}
              <div className="dashboard-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {summary && <StaggerChild index={12}><SentimentWidget summary={summary} report={report} /></StaggerChild>}
                {report && <StaggerChild index={13}><CategoryDistributionWidget report={report} /></StaggerChild>}
                {report && <StaggerChild index={14}><SourceHealthWidget report={report} /></StaggerChild>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
