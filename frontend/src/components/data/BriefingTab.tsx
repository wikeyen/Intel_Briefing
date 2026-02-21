// ABOUTME: Briefing tab content for the Data page — shows AI-generated summary with progress tracking.
// ABOUTME: Extracted from Data.tsx; includes summary progress banner, streaming token preview, and structured briefing display.
'use client'
import Link from 'next/link'
import type { ConfigSettings, BriefingSummary, SummaryProgress, PipelineStatus, OverallBriefing, BriefingSource } from '@/api/client'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'
import { Highlight, textHas } from './Highlight'

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Pulsing-dot + progress-bar animation CSS for the summary progress banner. */
export const PULSE_CSS = `
@keyframes pulseDot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`

/** Sensor label lookup for progress display — imported from taxonomy. */

function StreamTokenPreview({ text }: { text: string }) {
  const tail = text.length > 400 ? text.slice(-400) : text
  return (
    <div style={{
      position: 'relative',
      maxHeight: 60,
      overflow: 'hidden',
      marginTop: '0.25rem',
      padding: '0.25rem 0.5rem',
      borderRadius: 3,
      background: 'var(--surface-alt, rgba(0,0,0,0.02))',
    }}>
      <pre style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: '0.5625rem',
        lineHeight: 1.5,
        color: 'var(--ink-faint)',
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {tail}
      </pre>
      {/* Fade gradient at top */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 16,
        background: 'linear-gradient(to bottom, var(--surface-alt, rgba(255,255,255,0.9)), transparent)',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

function SummaryProgressBanner({ progress, pipelineStatus, config, streamTokens, onStop }: {
  progress: SummaryProgress | null
  pipelineStatus: PipelineStatus | null
  config: ConfigSettings | null
  streamTokens?: Record<string, string>
  onStop?: () => void
}) {
  const sourceSensors = progress?.sensors.filter(s => s.sensor_name !== '__overall__') ?? []
  const overallSensor = progress?.sensors.find(s => s.sensor_name === '__overall__')
  const done = sourceSensors.filter(s => s.state === 'ok' || s.state === 'failed').length
  const total = sourceSensors.length

  // Derive workflow phase — only trust pipelineStatus when it's actively running
  const pipelineActive = pipelineStatus?.running && pipelineStatus?.alive !== false
  const hasFetch = pipelineActive && (pipelineStatus?.mode === 'fetch' || pipelineStatus?.mode === 'fetch_summarize')
  const fetchDone = pipelineStatus
    ? pipelineStatus.sensors.filter(s => s.fetch === 'ok' || s.fetch === 'failed' || s.fetch === 'skipped').length
    : 0
  const fetchTotal = pipelineStatus?.sensors.length ?? 0
  const allFetchDone = fetchDone >= fetchTotal

  // Determine current phase for the step indicator
  type Phase = 'fetching' | 'extracting' | 'synthesizing' | 'overall'
  let currentPhase: Phase = 'extracting'
  if (hasFetch && !allFetchDone) {
    currentPhase = 'fetching'
  } else if (done < total) {
    // Check if any sensor is in map-reduce chunk extraction (only valid during active pipeline)
    const hasChunks = pipelineActive && pipelineStatus?.sensors.some(
      s => s.summary === 'running' && s.summary_chunks_total > 0 && s.summary_chunks_done < s.summary_chunks_total,
    )
    currentPhase = hasChunks ? 'extracting' : 'synthesizing'
  } else if (overallSensor?.state === 'running') {
    currentPhase = 'overall'
  }

  // Phase-aware progress: track fetch completion during fetch phase, summary completion otherwise
  const pct = (() => {
    if (currentPhase === 'fetching') {
      return fetchTotal > 0 ? Math.round((fetchDone / fetchTotal) * 100) : 0
    }
    return total > 0 ? Math.round((done / total) * 100) : 0
  })()

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
      <div className="progress-step-bar" style={{
        display: 'flex',
        flexWrap: 'wrap',
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
        <div style={{ flex: 1, minWidth: '1rem' }} />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.625rem',
          color: 'var(--ink-faint)',
        }}>
          {config?.summary_model && (
            <span className="progress-model-name" style={{ whiteSpace: 'nowrap' }}>
              {config.summary_model}
            </span>
          )}
          {(() => {
            const c = config?.summary_provider === 'local'
              ? (pipelineStatus?.local_summary_concurrency ?? config?.local_summary_concurrency)
              : (pipelineStatus?.default_concurrency ?? config?.default_concurrency)
            // Count running workers from whichever progress source is active
            const pipelineRunning = pipelineStatus?.sensors.filter(s => s.summary === 'running').length ?? 0
            const summaryRunning = progress?.sensors.filter(s => s.state === 'running').length ?? 0
            const running = Math.max(pipelineRunning, summaryRunning)
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
          {onStop && (
            <button
              onClick={onStop}
              style={{
                fontSize: '0.625rem',
                fontWeight: 500,
                color: '#ef4444',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.125rem 0.375rem',
                marginLeft: '0.25rem',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Per-sensor fetch progress rows — shown during fetch phase */}
      {currentPhase === 'fetching' && pipelineStatus && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 1,
          padding: '0.5rem 0.75rem',
        }}>
          {pipelineStatus.sensors.map(s => {
            const color = s.fetch === 'ok' ? 'var(--accent)'
              : s.fetch === 'failed' ? 'var(--error, #c33)'
              : s.fetch === 'running' ? 'var(--accent)'
              : 'var(--ink-faint)'
            return (
              <div key={s.name} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.375rem 0.5rem',
                borderRadius: 4,
              }}>
                <span style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0,
                  animation: s.fetch === 'running' ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
                }} />
                <span style={{
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  color: s.fetch === 'ok' ? 'var(--accent)'
                    : s.fetch === 'failed' ? 'var(--error, #c33)'
                    : 'var(--ink-muted)',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {SENSOR_LABELS[s.name] ?? s.name}
                </span>
                {s.fetch === 'running' && s.fetch_detail && (
                  <span style={{
                    fontSize: '0.5rem',
                    color: 'var(--ink-faint)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    maxWidth: 80,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {s.fetch_detail}
                  </span>
                )}
                {s.fetch === 'ok' && (
                  <span style={{ fontSize: '0.5625rem', color: 'var(--accent)' }}>&#10003;</span>
                )}
                {s.fetch === 'failed' && (
                  <span style={{ fontSize: '0.5625rem', color: 'var(--error, #c33)' }}>&#10007;</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Per-sensor summary progress rows — shown during extract/synthesize phases */}
      {currentPhase !== 'overall' && currentPhase !== 'fetching' && sourceSensors.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 1,
          padding: '0.5rem 0.75rem',
        }}>
          {sourceSensors.map(s => {
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
                {/* Verification retry indicator */}
                {pSensor && pSensor.verify_max_retries > 0 && pSensor.verify_attempt > 0 && s.state === 'running' && (
                  <span style={{
                    fontSize: '0.5rem',
                    color: 'var(--ink-muted)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                    title={`Verifying refs: ${pSensor.verify_failures} bad URL(s), retry ${pSensor.verify_attempt}/${pSensor.verify_max_retries}`}
                  >
                    &#x1F50D; {pSensor.verify_attempt}/{pSensor.verify_max_retries}
                  </span>
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
      )}

      {/* Streaming token previews for running sensors — hidden during briefing phase */}
      {currentPhase !== 'overall' && streamTokens && (() => {
        const sensorEntries = sourceSensors
          .filter(s => s.state === 'running' && streamTokens[s.sensor_name])
          .map(s => ({ name: s.sensor_name, label: SENSOR_LABELS[s.sensor_name] ?? s.label, text: streamTokens[s.sensor_name] }))
        if (sensorEntries.length === 0) return null
        return (
          <div style={{ padding: '0 0.75rem 0.5rem' }}>
            {sensorEntries.map(entry => (
              <div key={entry.name}>
                <span style={{ fontSize: '0.5625rem', color: 'var(--ink-faint)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {entry.label}
                </span>
                <StreamTokenPreview text={entry.text} />
              </div>
            ))}
          </div>
        )
      })()}

      {/* Briefing phase — status line with streaming preview */}
      {currentPhase === 'overall' && overallSensor && (
        <div style={{ padding: '0.5rem 1.25rem 0.75rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: streamTokens?.['__overall__'] && overallSensor.state === 'running' ? '0.5rem' : 0,
          }}>
            <span style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: overallSensor.state === 'ok' ? 'var(--accent)'
                : overallSensor.state === 'failed' ? 'var(--error, #c33)'
                : 'var(--accent)',
              flexShrink: 0,
              animation: overallSensor.state === 'running' ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
            }} />
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: 'var(--ink-muted)',
            }}>
              Composing briefing from {done} sources…
            </span>
            {overallSensor.state === 'ok' && (
              <span style={{ fontSize: '0.5625rem', color: 'var(--accent)' }}>&#10003;</span>
            )}
            {overallSensor.state === 'failed' && (
              <span style={{ fontSize: '0.5625rem', color: 'var(--error, #c33)' }}>&#10007;</span>
            )}
          </div>
          {streamTokens?.['__overall__'] && overallSensor.state === 'running' && (
            <StreamTokenPreview text={streamTokens['__overall__']} />
          )}
        </div>
      )}

      {/* Overall progress bar */}
      <div style={{ height: 3, background: 'var(--border)' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: pct < 100
            ? 'linear-gradient(90deg, var(--accent) 30%, rgba(29,107,79,0.4) 50%, var(--accent) 70%)'
            : 'var(--accent)',
          backgroundSize: pct < 100 ? '200% 100%' : 'auto',
          animation: pct < 100 ? 'shimmer 2s linear infinite' : 'none',
          borderRadius: '0 2px 2px 0',
          transition: 'width 400ms ease',
        }} />
      </div>
    </div>
  )
}

/** Style for a single ref superscript link. */
const refLinkStyle = (verified: boolean | null | undefined): React.CSSProperties => ({
  fontSize: '0.5625rem',
  fontWeight: 600,
  color: verified === false ? 'var(--ink-muted)' : 'var(--accent)',
  textDecoration: verified === false ? 'line-through' : 'none',
  verticalAlign: 'super',
  marginLeft: '0.125rem',
  lineHeight: 1,
  opacity: verified === false ? 0.5 : 1,
  cursor: verified === false ? 'not-allowed' : 'pointer',
})

/** Render a single ref as a superscript link. */
function RefLink({ source, index }: { source: { title: string; url: string; verified?: boolean | null }; index: number }) {
  return (
    <a
      className="citation-ref"
      href={source.verified === false ? undefined : source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.verified === false ? `${source.title} — link could not be verified` : source.title}
      style={refLinkStyle(source.verified)}
      onMouseEnter={e => {
        if (source.verified !== false) (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'
      }}
      onMouseLeave={e => {
        if (source.verified !== false) (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'
      }}
    >
      [{index}]
    </a>
  )
}

/**
 * Render text with inline [N] citation markers as superscript links.
 * When globalSources is provided (Perplexity-style), resolves [N] by ID from the global list.
 * Falls back to per-entry refs for backward compatibility with older briefings.
 */
function TextWithRefs({ text, refs, query, globalSources }: {
  text: string
  refs: { title: string; url: string; verified?: boolean | null }[]
  query: string
  globalSources?: BriefingSource[]
}) {
  const hasInlineMarkers = /\[\d+\]/.test(text)

  if (hasInlineMarkers) {
    const parts: React.ReactNode[] = []
    const segments = text.split(/(\[\d+\])/)
    let key = 0
    let refCounter = 0
    for (const segment of segments) {
      const match = segment.match(/^\[(\d+)\]$/)
      if (match) {
        const displayNum = parseInt(match[1], 10)
        if (globalSources && globalSources.length > 0) {
          // New format: resolve [N] by ID from global source list
          const source = globalSources.find(s => s.id === displayNum)
          if (source) {
            parts.push(<RefLink key={`ref-${key++}`} source={{ title: source.title, url: source.url }} index={displayNum} />)
          } else {
            parts.push(<span key={`ref-${key++}`}>{segment}</span>)
          }
        } else if (refCounter < refs.length) {
          // Legacy format: positional mapping into per-entry refs
          parts.push(<RefLink key={`ref-${key++}`} source={refs[refCounter]} index={displayNum} />)
          refCounter++
        } else {
          parts.push(<span key={`ref-${key++}`}>{segment}</span>)
        }
      } else if (segment) {
        parts.push(<Highlight key={`text-${key++}`} text={segment} query={query} />)
      }
    }
    return <>{parts}</>
  }

  // Fallback: no inline markers — append per-entry refs at the end (backward compat)
  if (refs && refs.length > 0) {
    return (
      <>
        <Highlight text={text} query={query} />
        {refs.map((r, ri) => (
          <RefLink key={ri} source={r} index={ri + 1} />
        ))}
      </>
    )
  }

  return <Highlight text={text} query={query} />
}

/** Check if overall briefing has structured data (new format) vs legacy plain text fallback. */
function isStructuredOverall(overall: OverallBriefing | string): overall is OverallBriefing {
  return typeof overall === 'object' && overall !== null && 'executive_summary' in overall
}

export function BriefingTabContent({ summary, summaryProgress, pipelineStatus, config, hasContent, onTrigger, onStop, onStopPipeline, streamTokens, searchQuery }: {
  summary: BriefingSummary | null
  summaryProgress: SummaryProgress | null
  pipelineStatus: PipelineStatus | null
  config: ConfigSettings | null
  hasContent: boolean
  onTrigger: () => void
  onStop: () => void
  onStopPipeline: () => void
  streamTokens?: Record<string, string>
  searchQuery?: string
}) {
  const isSummarizing = !!(summaryProgress?.running)
  const isPipelineActive = !!(pipelineStatus?.running && pipelineStatus.alive !== false)

  // Summary is "lined up" — pipeline is running in a mode that will produce a summary,
  // but the summary stage hasn't started yet (e.g. still fetching).
  const isPendingRefresh = !isSummarizing && isPipelineActive
    && (pipelineStatus?.mode === 'fetch_summarize' || pipelineStatus?.mode === 'summarize')

  // Show the progress banner whenever any job is active
  const showProgressBanner = isSummarizing || isPipelineActive

  // Stop handler: stop pipeline if active (stops everything), otherwise stop summary only
  const handleStopAll = isPipelineActive ? onStopPipeline : onStop

  const hasProvider = config?.summary_provider !== null && config?.summary_provider !== undefined

  // Search filtering — compute filtered versions of briefing content
  const q = searchQuery?.toLowerCase().trim() || ''
  const structured = summary && isStructuredOverall(summary.overall) ? summary.overall : null

  const filteredThemedSections = structured && q
    ? structured.sections
        .map(section => {
          if (section.title.toLowerCase().includes(q)) return section
          const matching = section.entries.filter(e => textHas(e.text, q))
          return matching.length > 0 ? { ...section, entries: matching } : null
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
    : structured?.sections

  const filteredSourceSections = summary && q
    ? summary.sections.filter(s =>
        textHas(s.label, q) ||
        textHas(s.summary, q) ||
        (s.items?.some(item => textHas(item.title, q) || textHas(item.brief, q)) ?? false)
      )
    : summary?.sections

  // "No results" state when searching
  const hasSearchResults = !q || (
    textHas(structured?.executive_summary, q) ||
    textHas(structured?.sentiment?.mood_summary, q) ||
    (filteredThemedSections?.length ?? 0) > 0 ||
    (filteredSourceSections?.length ?? 0) > 0
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Timestamp + regenerate header */}
      {summary && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            {showProgressBanner ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: 500,
                color: 'var(--accent)',
                background: 'rgba(29,107,79,0.08)',
                padding: '0.3rem 0.75rem',
                borderRadius: 4,
              }}>
                {isSummarizing ? 'Updating briefing…' : 'Pipeline running…'}
              </span>
            ) : (
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--ink-faint)',
                fontFamily: 'ui-monospace, monospace',
              }}>
                {summary.generated_at.slice(0, 16).replace('T', ' ')} · {timeAgo(summary.generated_at)}
              </span>
            )}
          </div>
          {hasProvider && hasContent && !showProgressBanner && (
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
          )}
        </div>
      )}

      {showProgressBanner && (
        <SummaryProgressBanner
          progress={isSummarizing ? summaryProgress : null}
          pipelineStatus={pipelineStatus}
          config={config}
          streamTokens={streamTokens}
          onStop={handleStopAll}
        />
      )}

      {summary && !isSummarizing ? (
        <>
          {/* Structured overall briefing */}
          {isStructuredOverall(summary.overall) ? (
            <>
              {/* Notice when overall briefing is incomplete (e.g. terminated mid-synthesis) */}
              {!summary.overall.executive_summary && (summary.overall.sections ?? []).length === 0 && (
                <div style={{
                  background: 'rgba(234,179,8,0.06)',
                  border: '1px solid rgba(234,179,8,0.3)',
                  borderRadius: 8,
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#eab308', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>
                      Overall briefing is incomplete — source summaries are available below.
                    </span>
                  </div>
                  {hasProvider && hasContent && (
                    <button
                      onClick={onTrigger}
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: '#fff',
                        background: 'var(--ink)',
                        border: 'none',
                        borderRadius: 4,
                        padding: '0.375rem 0.75rem',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Regenerate
                    </button>
                  )}
                </div>
              )}

              {/* Executive Summary */}
              {summary.overall.executive_summary && (
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
                    Executive Summary
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: 'var(--ink)',
                    lineHeight: 1.8,
                    whiteSpace: 'pre-wrap',
                  }}>
                    <TextWithRefs text={summary.overall.executive_summary} refs={[]} query={q} globalSources={structured?.sources} />
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
                          <span style={{ fontWeight: 600 }}><Highlight text={entry.topic} query={q} /></span>
                          {' — '}<TextWithRefs text={entry.analysis} refs={entry.refs} query={q} globalSources={structured?.sources} />
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
                        <Highlight text={s.mood_summary} query={q} />
                      </div>
                    )}
                    {renderSubSection('⚡', '争议焦点', s.controversies)}
                    {renderSubSection('📐', '舆论转向', s.opinion_shifts)}
                    {renderSubSection('🚩', '风险信号', s.risk_flags)}
                  </div>
                )
              })()}

              {/* Themed sections */}
              {(filteredThemedSections ?? []).length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '0.75rem',
                }}>
                  {(filteredThemedSections ?? []).map((section, i) => (
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
                        <Highlight text={section.title} query={q} />
                      </div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {section.entries.map((entry, j) => (
                          <li key={j} style={{
                            padding: '0.3rem 0',
                            fontSize: '0.8125rem',
                            color: 'var(--ink-muted)',
                            lineHeight: 1.6,
                          }}>
                            <TextWithRefs text={entry.text} refs={entry.refs ?? []} query={q} globalSources={structured?.sources} />
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

          {/* Global Sources — Perplexity-style numbered reference list */}
          {structured?.sources && structured.sources.length > 0 && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '1rem 1.25rem',
            }}>
              <div style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: 'var(--ink-faint)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '0.625rem',
              }}>
                References
              </div>
              <div style={{
                margin: 0,
                fontSize: '0.75rem',
                lineHeight: 1.8,
                color: 'var(--ink-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.125rem',
              }}>
                {structured.sources.map(src => (
                  <div key={src.id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem' }}>
                    <span style={{
                      fontSize: '0.625rem',
                      fontWeight: 600,
                      color: 'var(--accent)',
                      flexShrink: 0,
                    }}>
                      [{src.id}]
                    </span>
                    <span>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                      >
                        {src.title}
                      </a>
                      <span style={{ color: 'var(--ink-faint)', marginLeft: '0.375rem' }}>
                        — {src.sensor}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Source Summaries */}
          {(filteredSourceSections ?? []).length > 0 && (
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
                {(filteredSourceSections ?? []).map(s => (
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
                      <Highlight text={s.summary} query={q} />
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

          {/* No search results */}
          {q && !hasSearchResults && (
            <div style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              color: 'var(--ink-faint)',
              fontSize: '0.875rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              No results for &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </>
      ) : !showProgressBanner && (
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
