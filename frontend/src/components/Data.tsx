// ABOUTME: Intel feed page — shows fetched items grouped by section with section tabs.
// ABOUTME: Briefing tab shows AI-generated summary; other tabs show card-per-item news reader with source filtering and pagination.
'use client'
import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import Link from 'next/link'
import { api } from '@/api/client'
import type { IntelReport, IntelItem, ConfigSettings, BriefingSummary, SummaryProgress, PipelineStatus, OverallBriefing } from '@/api/client'
import { SENSOR_TOKEN_FIELD } from '@/lib/sensors/constants'
import { ALL_CATEGORIES, CATEGORY_META, SENSOR_LABELS, sensorsForCategory } from '@/lib/sensors/taxonomy'
import { useToast } from '@/lib/toast-context'
import { Pagination } from './Pagination'

const PAGE_SIZE = 20

const SECTIONS: { key: string; label: string }[] = [
  { key: 'briefing', label: 'Briefing' },
  ...ALL_CATEGORIES.map(cat => ({
    key: cat,
    label: CATEGORY_META[cat].label,
  })),
]

const SOURCE_LABELS: Record<string, string> = { ...SENSOR_LABELS }

/** Maps each section to the sensors that feed it. */
const SECTION_SENSORS: Record<string, string[]> = Object.fromEntries(
  ALL_CATEGORIES.map(cat => [cat, sensorsForCategory(cat)])
)

/** Check if a section is empty because every sensor feeding it lacks a required token. */
function sectionNeedsKey(sectionKey: string, config: ConfigSettings | null): boolean {
  if (!config) return false
  const sensors = SECTION_SENSORS[sectionKey]
  if (!sensors || sensors.length === 0) return false
  return sensors.every(sensor => {
    const isDisabled = config.sensors_enabled[sensor] === false
    if (isDisabled) return true
    const tokenField = SENSOR_TOKEN_FIELD[sensor]
    return tokenField ? !config[tokenField] : false
  })
}

function relativeDate(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** CSS to clamp text to N lines with ellipsis */
const LINE_CLAMP_CSS = `
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
`

/** Platform-specific badge colors for social sources. */
const PLATFORM_COLORS: Record<string, { color: string; bg: string }> = {
  x:        { color: '#000000', bg: 'rgba(0,0,0,0.08)' },
  bluesky:  { color: '#0085FF', bg: 'rgba(0,133,255,0.08)' },
  mastodon: { color: '#6364FF', bg: 'rgba(99,100,255,0.08)' },
  rss_feeds: { color: '#E97B20', bg: 'rgba(233,123,32,0.08)' },
}

function SourceChip({ source, label }: { source: string; label?: string }) {
  const platform = PLATFORM_COLORS[source]
  return (
    <span style={{
      fontSize: '0.625rem',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: platform?.color ?? 'var(--ink-faint)',
      background: platform?.bg ?? 'var(--surface-alt)',
      padding: '0.2rem 0.5rem',
      borderRadius: 3,
    }}>
      {label ?? SOURCE_LABELS[source] ?? source}
    </span>
  )
}

function FilterTag({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: '0.6875rem',
        fontWeight: active ? 600 : 400,
        letterSpacing: '0.04em',
        padding: '0.25rem 0.625rem',
        borderRadius: 3,
        border: active ? '1px solid var(--accent-dim)' : '1px solid var(--border)',
        background: active ? 'var(--accent-wash)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--ink-muted)',
        cursor: 'pointer',
        transition: 'all 100ms',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-faint)'
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
      }}
    >
      {label}
    </button>
  )
}

/** Derive the source discussion/post URL for an item, if applicable. */
function sourcePostUrl(item: IntelItem): string | null {
  if (item.source === 'hacker_news') {
    const storyId = item.id.replace('hn-', '')
    return `https://news.ycombinator.com/item?id=${storyId}`
  }
  if (item.source === 'product_hunt' && item.url.includes('producthunt.com')) {
    return item.url
  }
  if (item.source === 'v2ex' && item.url.includes('v2ex.com')) {
    return item.url
  }
  return null
}

function ItemCard({ item }: { item: IntelItem }) {
  const isArxiv = item.source === 'arxiv'
  const [abstractExpanded, setAbstractExpanded] = useState(false)
  const [contentExpanded, setContentExpanded] = useState(false)

  return (
    <article style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '1.25rem',
      transition: 'box-shadow 150ms, border-color 150ms',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-dim)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
      }}
    >
      {/* Title */}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          fontSize: '0.9375rem',
          fontWeight: 500,
          color: 'var(--ink)',
          lineHeight: 1.5,
          marginBottom: '0.5rem',
          textDecoration: 'none',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--ink)' }}
      >
        {item.title}
      </a>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <SourceChip source={item.source} label={item.source === 'rss_feeds' ? (item.account ?? undefined) : undefined} />
        {item.verified === false && (
          <span
            title="Link could not be verified"
            style={{
              fontSize: '0.625rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--warn)',
              background: 'var(--warn-wash, rgba(234,179,8,0.1))',
              padding: '0.2rem 0.5rem',
              borderRadius: 3,
            }}
          >
            unverified
          </span>
        )}
        {item.heat && (
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{item.heat}</span>
        )}
        {item.published_at && (
          <>
            <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>
              {relativeDate(item.published_at)}
            </span>
          </>
        )}
        {item.account && (
          <>
            <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>@{item.handle ?? item.account}</span>
          </>
        )}
        {item.topic && (
          <>
            <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{item.topic}</span>
          </>
        )}
        {sourcePostUrl(item) && sourcePostUrl(item) !== item.url && (
          <>
            <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
            <a
              href={sourcePostUrl(item)!}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.6875rem',
                fontWeight: 500,
                color: 'var(--accent)',
                textDecoration: 'none',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none' }}
            >
              discuss
            </a>
          </>
        )}
      </div>

      {/* Abstract preview — arxiv items get a collapse/expand toggle */}
      {item.abstract && (
        <div style={{ marginTop: '0.625rem' }}>
          <p
            className={isArxiv && !abstractExpanded ? 'line-clamp-2' : undefined}
            style={{
              fontSize: '0.8125rem',
              color: 'var(--ink-muted)',
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {item.abstract}
          </p>
          {isArxiv && (
            <button
              onClick={() => setAbstractExpanded(!abstractExpanded)}
              style={{
                marginTop: '0.375rem',
                fontSize: '0.6875rem',
                fontWeight: 500,
                color: 'var(--accent)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              {abstractExpanded ? 'collapse' : 'expand abstract'}
            </button>
          )}
        </div>
      )}

      {/* Content preview (HN comments, blog content) */}
      {item.content && !item.abstract && (
        <div style={{ marginTop: '0.625rem' }}>
          <p
            className={contentExpanded ? undefined : 'line-clamp-2'}
            style={{
              fontSize: '0.8125rem',
              color: 'var(--ink-muted)',
              lineHeight: 1.65,
              margin: 0,
              whiteSpace: 'pre-line',
            }}
          >
            {item.content}
          </p>
          <button
            onClick={() => setContentExpanded(!contentExpanded)}
            style={{
              marginTop: '0.375rem',
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: 'var(--accent)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            {contentExpanded ? 'collapse' : 'more'}
          </button>
        </div>
      )}
    </article>
  )
}

/** Get the filter key for an item — uses feed name for feeds section, source elsewhere. */
function filterKey(item: IntelItem, section: string): string {
  if (section === 'feeds' && item.account) return item.account
  return item.source
}

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Pulsing-dot + progress-bar animation CSS for the summary progress banner. */
const PULSE_CSS = `
@keyframes pulseDot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
`

/** Sensor label lookup for progress display — imported from taxonomy. */

function SummaryProgressBanner({ progress, pipelineStatus, config }: {
  progress: SummaryProgress
  pipelineStatus: PipelineStatus | null
  config: ConfigSettings | null
}) {
  const done = progress.sensors.filter(s => s.state === 'ok' || s.state === 'failed').length
  const total = progress.sensors.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  // Derive workflow phase from pipeline status
  const hasFetch = pipelineStatus?.mode === 'fetch' || pipelineStatus?.mode === 'fetch_summarize'
  const fetchDone = pipelineStatus
    ? pipelineStatus.sensors.filter(s => s.fetch === 'ok' || s.fetch === 'failed' || s.fetch === 'skipped').length
    : 0
  const fetchTotal = pipelineStatus?.sensors.length ?? 0
  const allFetchDone = fetchDone >= fetchTotal
  const overallState = pipelineStatus?.overall_summary ?? 'queued'

  // Determine current phase for the step indicator
  type Phase = 'fetching' | 'extracting' | 'synthesizing' | 'overall'
  let currentPhase: Phase = 'extracting'
  if (hasFetch && !allFetchDone) {
    currentPhase = 'fetching'
  } else if (done < total) {
    // Check if any sensor is in map-reduce chunk extraction
    const hasChunks = pipelineStatus?.sensors.some(
      s => s.summary === 'running' && s.summary_chunks_total > 0 && s.summary_chunks_done < s.summary_chunks_total,
    )
    currentPhase = hasChunks ? 'extracting' : 'synthesizing'
  } else if (overallState === 'running') {
    currentPhase = 'overall'
  }

  const phases: { key: Phase; label: string }[] = hasFetch
    ? [
        { key: 'fetching', label: 'Fetch' },
        { key: 'extracting', label: 'Extract' },
        { key: 'synthesizing', label: 'Synthesize' },
        { key: 'overall', label: 'Briefing' },
      ]
    : [
        { key: 'extracting', label: 'Extract' },
        { key: 'synthesizing', label: 'Synthesize' },
        { key: 'overall', label: 'Briefing' },
      ]

  const phaseIdx = phases.findIndex(p => p.key === currentPhase)

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      marginBottom: '1.25rem',
      overflow: 'hidden',
    }}>
      {/* Step indicator bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0.75rem 1.25rem',
        gap: '0.25rem',
        borderBottom: '1px solid var(--border)',
      }}>
        {phases.map((phase, i) => {
          const isActive = i === phaseIdx
          const isDone = i < phaseIdx
          return (
            <div key={phase.key} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              {i > 0 && (
                <div style={{
                  width: 16,
                  height: 1,
                  background: isDone ? 'var(--accent)' : 'var(--border)',
                  margin: '0 0.125rem',
                }} />
              )}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.25rem 0.5rem',
                borderRadius: 4,
                background: isActive ? 'rgba(29,107,79,0.08)' : 'transparent',
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isDone ? 'var(--accent)' : isActive ? 'var(--accent)' : 'var(--border)',
                  flexShrink: 0,
                  animation: isActive ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
                }} />
                <span style={{
                  fontSize: '0.6875rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isDone ? 'var(--accent)' : isActive ? 'var(--ink)' : 'var(--ink-faint)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.02em',
                }}>
                  {phase.label}
                </span>
              </div>
            </div>
          )
        })}
        <div style={{ flex: 1 }} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.625rem',
          color: 'var(--ink-faint)',
        }}>
          {config?.summary_model && (
            <span style={{ whiteSpace: 'nowrap' }}>
              {config.summary_model}
            </span>
          )}
          {(() => {
            const c = config?.summary_provider === 'local'
              ? (pipelineStatus?.local_summary_concurrency ?? config?.local_summary_concurrency)
              : (pipelineStatus?.default_concurrency ?? config?.default_concurrency)
            const running = pipelineStatus?.sensors.filter(s => s.summary === 'running').length ?? 0
            return c != null ? (
              <span style={{ whiteSpace: 'nowrap' }}>
                {running}/{c} workers
              </span>
            ) : null
          })()}
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: 'var(--ink-muted)',
          }}>
            {pct}%
          </span>
        </div>
      </div>

      {/* Per-sensor progress rows */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 1,
        padding: '0.5rem 0.75rem',
      }}>
        {progress.sensors.map(s => {
          const pSensor = pipelineStatus?.sensors.find(ps => ps.name === s.sensor_name)
          const chunksTotal = pSensor?.summary_chunks_total ?? 0
          const chunksDone = pSensor?.summary_chunks_done ?? 0
          const isChunking = chunksTotal > 0 && chunksDone < chunksTotal && s.state === 'running'
          const chunkPct = chunksTotal > 0 ? Math.round((chunksDone / chunksTotal) * 100) : 0

          const color = s.state === 'ok' ? 'var(--accent)'
            : s.state === 'failed' ? 'var(--error, #c33)'
            : s.state === 'running' ? 'var(--accent)'
            : 'var(--ink-faint)'

          return (
            <div key={s.sensor_name} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 0.5rem',
              borderRadius: 4,
            }}>
              {/* Status indicator */}
              <span style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
                animation: s.state === 'running' ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
              }} />
              <span style={{
                fontSize: '0.6875rem',
                fontWeight: 500,
                color: s.state === 'ok' ? 'var(--accent)'
                  : s.state === 'failed' ? 'var(--error, #c33)'
                  : 'var(--ink-muted)',
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {SENSOR_LABELS[s.sensor_name] ?? s.label}
              </span>
              {/* Chunk progress micro-bar */}
              {isChunking && (
                <div style={{
                  width: 32,
                  height: 3,
                  background: 'var(--border)',
                  borderRadius: 2,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  <div style={{
                    height: '100%',
                    width: `${chunkPct}%`,
                    background: 'var(--accent)',
                    transition: 'width 300ms ease',
                  }} />
                </div>
              )}
              {s.state === 'ok' && (
                <span style={{ fontSize: '0.5625rem', color: 'var(--accent)' }}>&#10003;</span>
              )}
              {s.state === 'failed' && (
                <span style={{ fontSize: '0.5625rem', color: 'var(--error, #c33)' }}>&#10007;</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Overall progress bar */}
      <div style={{ height: 3, background: 'var(--border)' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--accent)',
          borderRadius: '0 2px 2px 0',
          transition: 'width 400ms ease',
        }} />
      </div>
    </div>
  )
}

/** Check if overall briefing has structured data (new format) vs legacy plain text fallback. */
function isStructuredOverall(overall: OverallBriefing | string): overall is OverallBriefing {
  return typeof overall === 'object' && overall !== null && 'quick_scan' in overall
}

function BriefingTabContent({ summary, summaryProgress, pipelineStatus, config, hasContent, onTrigger, onStop }: {
  summary: BriefingSummary | null
  summaryProgress: SummaryProgress | null
  pipelineStatus: PipelineStatus | null
  config: ConfigSettings | null
  hasContent: boolean
  onTrigger: () => void
  onStop: () => void
}) {
  const isSummarizing = !!(summaryProgress?.running)

  const hasProvider = config?.summary_provider !== null && config?.summary_provider !== undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Timestamp + regenerate header */}
      {summary && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{
              fontSize: '0.75rem',
              color: 'var(--ink-faint)',
              fontFamily: 'ui-monospace, monospace',
            }}>
              {summary.generated_at.slice(0, 16).replace('T', ' ')} · {timeAgo(summary.generated_at)}
            </span>
            {isSummarizing && (
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
                animation: 'pulseDot 1.6s ease-in-out infinite',
              }} />
            )}
          </div>
          {hasProvider && hasContent && (
            isSummarizing ? (
              <button
                onClick={onStop}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#ef4444',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem 0',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
              >
                Stop
              </button>
            ) : (
              <button
                onClick={onTrigger}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: 'var(--accent)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem 0',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
              >
                Regenerate
              </button>
            )
          )}
        </div>
      )}

      {isSummarizing && summaryProgress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <SummaryProgressBanner progress={summaryProgress} pipelineStatus={pipelineStatus} config={config} />
          {!summary && (
            <button
              onClick={onStop}
              style={{
                alignSelf: 'flex-end',
                fontSize: '0.75rem',
                fontWeight: 500,
                color: '#ef4444',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.25rem 0',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              Stop
            </button>
          )}
        </div>
      )}

      {summary && !isSummarizing ? (
        <>
          {/* Structured overall briefing */}
          {isStructuredOverall(summary.overall) ? (
            <>
              {/* Quick Scan */}
              {summary.overall.quick_scan.length > 0 && (
                <div style={{
                  background: 'var(--accent-wash, var(--surface-alt))',
                  border: '1px solid var(--accent-dim, var(--border))',
                  borderRadius: 8,
                  padding: '1rem 1.25rem',
                }}>
                  <div style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'var(--accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '0.625rem',
                  }}>
                    Quick Scan
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {summary.overall.quick_scan.map((entry, i) => (
                      <li key={i} style={{
                        padding: '0.375rem 0',
                        borderBottom: i < summary.overall.quick_scan.length - 1 ? '1px solid var(--border-soft, var(--border))' : 'none',
                        fontSize: '0.875rem',
                        color: 'var(--ink)',
                        lineHeight: 1.6,
                      }}>
                        {entry.text}
                        {entry.refs?.length > 0 && entry.refs.map((ref, ri) => (
                          <a
                            key={ri}
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={ref.title}
                            style={{
                              fontSize: '0.5625rem',
                              fontWeight: 600,
                              color: 'var(--accent)',
                              textDecoration: 'none',
                              verticalAlign: 'super',
                              marginLeft: '0.125rem',
                              lineHeight: 1,
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none' }}
                          >
                            [{ri + 1}]
                          </a>
                        ))}
                        {entry.source && (
                          <span style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.6875rem',
                            color: 'var(--ink-faint)',
                          }}>
                            — {entry.source}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Executive Summary */}
              {summary.overall.executive_summary && (
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '1rem 1.25rem',
                }}>
                  <div style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'var(--ink-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '0.625rem',
                  }}>
                    Executive Summary
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: 'var(--ink)',
                    lineHeight: 1.8,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {summary.overall.executive_summary}
                  </div>
                </div>
              )}

              {/* Sentiment Analysis */}
              {summary.overall.sentiment && (summary.overall.sentiment.mood_summary || summary.overall.sentiment.controversies.length > 0 || summary.overall.sentiment.opinion_shifts.length > 0 || summary.overall.sentiment.risk_flags.length > 0) && (() => {
                const s = summary.overall.sentiment
                const moodConfig: Record<string, { dot: string; label: string }> = {
                  bullish: { dot: '#22c55e', label: '偏多' },
                  bearish: { dot: '#ef4444', label: '偏空' },
                  mixed:   { dot: '#eab308', label: '多空分歧' },
                  neutral: { dot: '#9ca3af', label: '中性' },
                }
                const mood = moodConfig[s.overall_mood] ?? moodConfig.neutral

                const renderSentimentRefs = (refs: { title: string; url: string }[]) =>
                  refs.map((ref, ri) => (
                    <a key={ri} href={ref.url} target="_blank" rel="noopener noreferrer"
                      title={ref.title}
                      style={{
                        fontSize: '0.5625rem', fontWeight: 600, color: 'var(--accent)',
                        textDecoration: 'none', verticalAlign: 'super',
                        marginLeft: '0.125rem', lineHeight: 1,
                      }}
                    >[{ri + 1}]</a>
                  ))

                const renderSubSection = (icon: string, title: string, entries: typeof s.controversies) => {
                  if (entries.length === 0) return null
                  return (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{
                        fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)',
                        marginBottom: '0.375rem',
                      }}>
                        {icon} {title}
                      </div>
                      {entries.map((entry, j) => (
                        <div key={j} style={{
                          fontSize: '0.8125rem', color: 'var(--ink)', lineHeight: 1.7,
                          marginBottom: '0.375rem', paddingLeft: '0.25rem',
                        }}>
                          <span style={{ fontWeight: 600 }}>{entry.topic}</span>
                          {' — '}{entry.analysis}
                          {renderSentimentRefs(entry.refs)}
                        </div>
                      ))}
                    </div>
                  )
                }

                return (
                  <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '1rem 1.25rem',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      marginBottom: s.mood_summary ? '0.5rem' : 0,
                    }}>
                      <div style={{
                        fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>
                        舆情风向
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        fontSize: '0.75rem', fontWeight: 600,
                        color: mood.dot,
                      }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: mood.dot, display: 'inline-block',
                        }} />
                        {mood.label}
                      </span>
                    </div>
                    {s.mood_summary && (
                      <div style={{
                        fontSize: '0.8125rem', color: 'var(--ink)', lineHeight: 1.7,
                      }}>
                        {s.mood_summary}
                      </div>
                    )}
                    {renderSubSection('⚡', '争议焦点', s.controversies)}
                    {renderSubSection('📐', '舆论转向', s.opinion_shifts)}
                    {renderSubSection('🚩', '风险信号', s.risk_flags)}
                  </div>
                )
              })()}

              {/* Themed sections */}
              {summary.overall.sections.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '0.75rem',
                }}>
                  {summary.overall.sections.map((section, i) => (
                    <div key={i} style={{
                      background: 'var(--canvas)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '1rem 1.25rem',
                    }}>
                      <div style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: 'var(--ink)',
                        marginBottom: '0.5rem',
                        paddingBottom: '0.375rem',
                        borderBottom: '1px solid var(--border-soft, var(--border))',
                      }}>
                        {section.title}
                      </div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {section.entries.map((entry, j) => (
                          <li key={j} style={{
                            padding: '0.3rem 0',
                            fontSize: '0.8125rem',
                            color: 'var(--ink-muted)',
                            lineHeight: 1.6,
                          }}>
                            {entry.text}
                            {entry.refs?.length > 0 && entry.refs.map((ref, ri) => (
                              <a
                                key={ri}
                                href={ref.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={ref.title}
                                style={{
                                  fontSize: '0.5625rem',
                                  fontWeight: 600,
                                  color: 'var(--accent)',
                                  textDecoration: 'none',
                                  verticalAlign: 'super',
                                  marginLeft: '0.125rem',
                                  lineHeight: 1,
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none' }}
                              >
                                [{ri + 1}]
                              </a>
                            ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Legacy plain-text fallback */
            <div style={{
              fontSize: '0.9375rem',
              color: 'var(--ink)',
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
            }}>
              {String(summary.overall)}
            </div>
          )}

          {/* Source Summaries */}
          {summary.sections.length > 0 && (
            <div>
              <div style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: 'var(--ink-faint)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '0.625rem',
              }}>
                Sources
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '0.75rem',
              }}>
                {summary.sections.map(s => (
                  <div key={s.sensor_name} style={{
                    background: 'var(--canvas)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '1rem 1.25rem',
                  }}>
                    {/* Source header with link */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                    }}>
                      {s.source_url ? (
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: 'var(--accent)',
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          {s.label}
                          <span style={{ fontSize: '0.625rem' }}>↗</span>
                        </a>
                      ) : (
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink)' }}>
                          {s.label}
                        </span>
                      )}
                      <span style={{
                        fontSize: '0.625rem',
                        color: 'var(--ink-faint)',
                        fontFamily: 'ui-monospace, monospace',
                      }}>
                        {s.item_count} items
                      </span>
                    </div>

                    {/* Summary text */}
                    <p style={{
                      fontSize: '0.8125rem',
                      color: 'var(--ink-muted)',
                      lineHeight: 1.65,
                      margin: 0,
                    }}>
                      {s.summary}
                    </p>

                    {/* Notable items list */}
                    {s.items && s.items.length > 0 && (
                      <ul style={{
                        margin: '0.5rem 0 0',
                        padding: 0,
                        listStyle: 'none',
                        borderTop: '1px solid var(--border-soft, var(--border))',
                        paddingTop: '0.5rem',
                      }}>
                        {s.items.map((item, idx) => (
                          <li key={idx} style={{
                            fontSize: '0.75rem',
                            lineHeight: 1.5,
                            padding: '0.2rem 0',
                          }}>
                            {item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: 'var(--accent)',
                                  textDecoration: 'none',
                                }}
                              >
                                {item.title}
                              </a>
                            ) : (
                              <span style={{ color: 'var(--ink)' }}>{item.title}</span>
                            )}
                            {item.brief && (
                              <span style={{ color: 'var(--ink-faint)', marginLeft: '0.375rem' }}>
                                — {item.brief}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : !isSummarizing && (
        <div style={{
          padding: '4rem 1.5rem',
          textAlign: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}>
          {!hasProvider ? (
            <p style={{ color: 'var(--ink-faint)', fontSize: '0.8125rem', margin: 0 }}>
              Configure an AI provider in{' '}
              <Link href="/ai" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                AI Summary settings
              </Link>
              {' '}to enable briefings.
            </p>
          ) : !hasContent ? (
            <p style={{ color: 'var(--ink-faint)', fontSize: '0.8125rem', margin: 0 }}>
              Run the pipeline first to fetch content for summarization.
            </p>
          ) : (
            <div>
              <p style={{ color: 'var(--ink-muted)', fontSize: '0.8125rem', margin: 0, marginBottom: '0.75rem' }}>
                AI provider configured. Generate a summary of the current feed.
              </p>
              <button
                onClick={onTrigger}
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.5rem 1.25rem',
                  borderRadius: 4,
                  border: 'none',
                  color: '#FFFFFF',
                  background: 'var(--ink)',
                  cursor: 'pointer',
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#000000' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--ink)' }}
              >
                Generate Summary
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptySection({ needsKey }: { needsKey?: boolean }) {
  return (
    <div style={{
      padding: '4rem 1.5rem',
      textAlign: 'center',
      color: needsKey ? 'var(--warn)' : 'var(--ink-faint)',
      fontSize: '0.875rem',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
    }}>
      {needsKey
        ? 'No items — the sensors for this section need an API key. Configure them on the Credentials page.'
        : 'No items in this section yet — run the pipeline to fetch data.'}
    </div>
  )
}

export function Data() {
  const showToast = useToast()
  const [report, setReport] = useState<IntelReport | null>(null)
  const [config, setConfig] = useState<ConfigSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState(SECTIONS[0].key)
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [summary, setSummary] = useState<BriefingSummary | null>(null)
  const [summaryProgress, setSummaryProgress] = useState<SummaryProgress | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {})
    api.getSummary().then(r => setSummary(r.summary)).catch(() => {})
    api.getLatest().then(setReport).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Track last-seen timestamps so we can detect new completions from any source
  const lastSummaryAt = useRef<string | null>(null)
  const lastPipelineCompletedAt = useRef<string | null>(null)

  // Poll summary and pipeline status for live progress
  useEffect(() => {
    const check = () => {
      api.getSummaryStatus().then(s => {
        setSummaryProgress(s)
        if (!s.running && s.completed_at) {
          api.getSummary().then(r => setSummary(r.summary)).catch(() => {})
        }
      }).catch(() => {})
      api.getPipelineStatus().then(ps => {
        setPipelineStatus(ps)
        // When the pipeline completes (from any page), refresh report + summary
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
    check()
    const iv = setInterval(check, 2_000)
    return () => clearInterval(iv)
  }, [])

  const handleTriggerSummary = async () => {
    try {
      await api.triggerSummary()
      // Immediately poll so summaryProgress.running is set without waiting for the 2s interval.
      // This also survives tab switches since the state comes from the server, not local React state.
      const s = await api.getSummaryStatus()
      setSummaryProgress(s)
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    }
  }

  const handleStopSummary = async () => {
    try {
      await api.stopSummary()
      showToast('Summary generation stopped')
      const s = await api.getSummaryStatus()
      setSummaryProgress(s)
    } catch {
      // 404 = nothing running, just refresh status
      const s = await api.getSummaryStatus()
      setSummaryProgress(s)
    }
  }

  const hasContent = Object.values(report?.items ?? {}).some(arr => arr.length > 0)

  // Derive the unique filter keys present in the current section
  const sectionItems = report?.items[activeSection] ?? []
  const availableFilters = useMemo(() => {
    const seen = new Set<string>()
    for (const item of sectionItems) seen.add(filterKey(item, activeSection))
    return [...seen].sort()
  }, [sectionItems, activeSection])

  // Reset selected filters and page when section changes (select all by default)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSources(new Set(availableFilters))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [activeSection, availableFilters.join(',')])

  const toggleSource = (src: string) => {
    setSelectedSources(prev => {
      const next = new Set(prev)
      if (next.has(src)) {
        // Don't deselect the last one
        if (next.size === 1) return prev
        next.delete(src)
      } else {
        next.add(src)
      }
      return next
    })
    setPage(1)
  }

  const filteredItems = sectionItems.filter(item => selectedSources.has(filterKey(item, activeSection)))
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE)
  const currentPage = Math.min(page, totalPages || 1)
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const totalItems = Object.values(report?.items ?? {}).reduce((s, a) => s + a.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <style dangerouslySetInnerHTML={{ __html: LINE_CLAMP_CSS + PULSE_CSS }} />

      {/* Page header — not sticky (hidden on mobile — shown in top bar) */}
      <div className="page-padding page-header" style={{ maxWidth: 1024, margin: '0 auto', width: '100%', paddingLeft: '3rem', paddingRight: '3rem' }}>
        <div style={{ paddingTop: '2.5rem', paddingBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            marginBottom: '0.25rem',
          }}>
            Feed
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            {loading ? 'Loading…' : report
              ? `${totalItems} items from ${report.sources_ok.length} sources · ${report.date}`
              : 'Fetched items from all configured sources.'}
          </p>
        </div>
      </div>

      {/* Sticky navigation — tabs + source filters */}
      {report && (
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--canvas)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div className="data-sticky-nav" style={{ maxWidth: 1024, margin: '0 auto', paddingLeft: '3rem', paddingRight: '3rem' }}>
            {/* Section tabs */}
            <div className="section-tabs" style={{
              display: 'flex',
              gap: '0.25rem',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'none',
            }}>
              {SECTIONS.map(({ key, label }, idx) => {
                const count = report.items[key]?.length ?? 0
                const active = activeSection === key
                return (
                  <Fragment key={key}>
                    <button
                      onClick={() => setActiveSection(key)}
                      style={{
                        padding: '0.625rem 1rem',
                        paddingLeft: idx === 0 ? 0 : '1rem',
                        fontSize: '0.8125rem',
                        fontWeight: active ? 600 : 400,
                        color: active ? 'var(--accent)' : 'var(--ink-muted)',
                        background: 'none',
                        border: 'none',
                        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'color 100ms',
                        marginBottom: -1,
                        flexShrink: 0,
                      }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = active ? 'var(--accent)' : 'var(--ink-muted)' }}
                    >
                      {label}
                      {count > 0 && (
                        <span style={{
                          marginLeft: '0.375rem',
                          fontSize: '0.625rem',
                          color: active ? 'var(--accent-dim)' : 'var(--ink-faint)',
                          fontFamily: 'ui-monospace, monospace',
                        }}>
                          {count}
                        </span>
                      )}
                    </button>
                    {idx === 0 && (
                      <div style={{
                        width: 1,
                        height: 16,
                        background: 'var(--border)',
                        alignSelf: 'center',
                        flexShrink: 0,
                        margin: '0 0.375rem',
                      }} />
                    )}
                  </Fragment>
                )
              })}
            </div>

            {/* Source filters — hidden on briefing tab */}
            {activeSection !== 'briefing' && (
              <div className="source-filters" style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                padding: '0.625rem 0',
                borderTop: '1px solid var(--border-soft)',
                flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '0.25rem' }}>
                  {activeSection === 'feeds' ? 'Feed' : 'Source'}
                </span>
                {availableFilters.length === 0 ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>—</span>
                ) : (
                  <>
                    {availableFilters.map(key => (
                      <FilterTag
                        key={key}
                        label={activeSection === 'feeds' ? key : (SOURCE_LABELS[key] ?? key)}
                        active={selectedSources.has(key)}
                        onClick={() => toggleSource(key)}
                      />
                    ))}
                    {selectedSources.size < availableFilters.length && (
                      <button
                        onClick={() => { setSelectedSources(new Set(availableFilters)); setPage(1) }}
                        style={{
                          fontSize: '0.6875rem',
                          color: 'var(--ink-faint)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '0.25rem 0.375rem',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-faint)' }}
                      >
                        All
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ flex: 1 }}>
        <div className="data-content" style={{ maxWidth: 1024, margin: '0 auto', padding: '1.5rem 3rem 4rem' }}>
          {activeSection === 'briefing' ? (
            <BriefingTabContent
              summary={summary}
              summaryProgress={summaryProgress}
              pipelineStatus={pipelineStatus}
              config={config}
              hasContent={hasContent}
              onTrigger={handleTriggerSummary}
              onStop={handleStopSummary}
            />
          ) : !loading && !report ? (
            <div style={{
              padding: '4rem 1.5rem',
              textAlign: 'center',
              color: 'var(--ink-faint)',
              fontSize: '0.875rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              No data available. Trigger a pipeline run from the Status page.
            </div>
          ) : report ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredItems.length === 0
                ? <EmptySection needsKey={sectionNeedsKey(activeSection, config)} />
                : (
                  <>
                    {/* Item range indicator */}
                    {filteredItems.length > PAGE_SIZE && (
                      <div style={{
                        fontSize: '0.75rem',
                        fontFamily: 'ui-monospace, monospace',
                        color: 'var(--ink-faint)',
                        textAlign: 'right',
                      }}>
                        {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
                      </div>
                    )}
                    {pagedItems.map(item => <ItemCard key={item.id} item={item} />)}
                    <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
                  </>
                )
              }
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
