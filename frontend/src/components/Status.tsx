// ABOUTME: Pipeline status dashboard — shows health, last run results, per-sensor outcomes, and section item counts.
// ABOUTME: Polls health every 10s; when running, polls /fetch/status every 2s for live sensor progress.
'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/api/client'
import type { HealthResponse, IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress, RunMode, StageState } from '@/api/client'
import { useToast } from '@/lib/toast-context'

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function nextFetchIn(fetchTime: string, timezone: string): string {
  try {
    const [h, m] = fetchTime.split(':').map(Number)
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(now)
    const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
    const tzMin  = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
    let diff = (h * 60 + m) - (tzHour * 60 + tzMin)
    if (diff <= 0) diff += 24 * 60
    const dh = Math.floor(diff / 60)
    const dm = diff % 60
    return dh > 0 ? `in ${dh}h ${dm}m` : `in ${dm}m`
  } catch {
    return ''
  }
}

const ALL_SENSORS = [
  { key: 'hacker_news',     label: 'Hacker News' },
  { key: 'arxiv',           label: 'ArXiv AI' },
  { key: 'github',          label: 'GitHub Trending' },
  { key: 'product_hunt',    label: 'Product Hunt' },
  { key: 'v2ex',            label: 'V2EX' },
  { key: 'hn_blogs',        label: 'HN Blogs' },
  { key: 'sources_36kr',    label: '36Kr' },
  { key: 'wallstreetcn',    label: 'WallStreetCN' },
  { key: 'social_accounts', label: 'Social Accounts' },
  { key: 'social_topics',   label: 'Social Topics' },
  { key: 'social_trends',   label: 'Social Trends' },
  { key: 'chrome_radar',    label: 'Chrome Radar' },
  { key: 'rss_feeds',       label: 'RSS Feeds' },
]

const SECTION_SENSORS = [
  { key: 'tech_trends',  label: 'Tech Trends',  sensors: ['hacker_news', 'github'] },
  { key: 'research',     label: 'Research',      sensors: ['arxiv'] },
  { key: 'capital_flow', label: 'Capital Flow',  sensors: ['sources_36kr', 'wallstreetcn'] },
  { key: 'products',     label: 'Products',      sensors: ['product_hunt', 'chrome_radar'] },
  { key: 'community',    label: 'Community',     sensors: ['v2ex'] },
  { key: 'social',       label: 'Social',        sensors: ['social_accounts', 'social_topics', 'social_trends'] },
  { key: 'insights',     label: 'Insights',      sensors: ['hn_blogs'] },
  { key: 'feeds',        label: 'Feeds',          sensors: ['rss_feeds'] },
]

const STATUS_META: Record<string, { color: string; bg: string; label: string; desc: string }> = {
  ok:      { color: 'var(--ok)',        bg: 'var(--ok-bg)',      label: 'Healthy',  desc: 'Data is fresh and up to date' },
  stale:   { color: 'var(--warn)',      bg: 'var(--warn-bg)',    label: 'Stale',    desc: 'Data is older than the cache TTL' },
  no_data: { color: 'var(--ink-faint)', bg: 'var(--surface-alt)',label: 'No Data',  desc: 'Pipeline has never run' },
  error:   { color: 'var(--err)',       bg: 'var(--err-bg)',     label: 'Error',    desc: 'Could not read pipeline status' },
}

const SENSOR_LABEL_MAP: Record<string, string> = Object.fromEntries(ALL_SENSORS.map(s => [s.key, s.label]))

/** Threshold (chars) above which error messages are truncated with a "more" toggle. */
const ERROR_TRUNCATE_LENGTH = 120

function KindBadge({ kind }: { kind: 'config' | 'api' | null | undefined }) {
  const isConfig = kind === 'config'
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.5625rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      padding: '0.125rem 0.5rem',
      borderRadius: 3,
      color: isConfig ? 'var(--warn)' : 'var(--err)',
      background: isConfig ? 'var(--warn-bg)' : 'var(--err-bg)',
      border: `1px solid ${isConfig ? 'var(--warn)' : 'var(--err)'}`,
      opacity: 0.85,
      flexShrink: 0,
    }}>
      {isConfig ? 'config' : 'api'}
    </span>
  )
}

function ErrorRow({ entry }: { entry: { name: string; error: string; kind: 'config' | 'api' | null } }) {
  const label = SENSOR_LABEL_MAP[entry.name] ?? entry.name
  const msg = entry.error
  const isLong = msg.length > ERROR_TRUNCATE_LENGTH
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
      padding: '0.75rem 1.25rem',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: 'var(--ink)',
        minWidth: 120,
        flexShrink: 0,
      }}>
        {label}
      </span>
      <KindBadge kind={entry.kind} />
      <span style={{
        fontSize: '0.75rem',
        fontFamily: 'ui-monospace, monospace',
        color: 'var(--ink-muted)',
        lineHeight: 1.5,
        wordBreak: 'break-word',
        minWidth: 0,
      }}>
        {isLong && !expanded ? msg.slice(0, ERROR_TRUNCATE_LENGTH) + '...' : msg}
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              display: 'inline',
              marginLeft: '0.375rem',
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
            {expanded ? 'less' : 'more'}
          </button>
        )}
      </span>
    </div>
  )
}

function StageBadge({ state, label }: { state: StageState; label: string }) {
  const colors: Record<StageState, { dot: string; text: string }> = {
    queued: { dot: 'var(--border)', text: 'var(--ink-faint)' },
    running: { dot: 'var(--accent)', text: 'var(--ink-muted)' },
    ok: { dot: 'var(--ok)', text: 'var(--ok)' },
    failed: { dot: 'var(--err)', text: 'var(--err)' },
    skipped: { dot: 'var(--border)', text: 'var(--ink-faint)' },
  }
  const c = colors[state]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.6875rem' }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: state === 'skipped' ? 'none' : c.dot,
        border: state === 'skipped' ? '1px solid var(--border)' : 'none',
        flexShrink: 0,
        animation: state === 'running' ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
      }} />
      <span style={{ color: c.text, fontWeight: state === 'ok' || state === 'failed' ? 500 : 400 }}>
        {state === 'skipped' ? '\u2014' : label}
      </span>
    </span>
  )
}

export function Status() {
  const showToast = useToast()
  const [health, setHealth]           = useState<HealthResponse | null>(null)
  const [report, setReport]           = useState<IntelReport | null>(null)
  const [config, setConfig]           = useState<ConfigSettings | null>(null)
  const [fetching, setFetching]       = useState(false)
  const [running, setRunning]         = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [, setTick]                   = useState(0)
  const lastFetchedAtRef              = useRef<string | null>(null)

  const loadAll = () => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'error', last_fetch: null }))
    api.getLatest().then(setReport).catch(() => {})
    api.getConfig().then(setConfig).catch(() => {})
  }

  // Tick every second so timeAgo() updates live
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1_000)
    return () => clearInterval(iv)
  }, [])

  // Poll health every 10s; detect new data by comparing fetched_at
  useEffect(() => {
    loadAll()

    const iv = setInterval(() => {
      api.health().then(h => {
        setHealth(h)
        if (h.last_fetch && h.last_fetch !== lastFetchedAtRef.current) {
          if (lastFetchedAtRef.current !== null) {
            api.getLatest().then(r => { setReport(r); setRunning(false) }).catch(() => {})
          }
          lastFetchedAtRef.current = h.last_fetch
        }
      }).catch(() => {})
    }, 10_000)

    return () => clearInterval(iv)
  }, [])

  // Always poll /fetch/status every 3s — panel visibility driven by pipelineStatus.running
  // This survives page switches and refreshes without any bootstrap race conditions
  useEffect(() => {
    const STALE_THRESHOLD = 5 * 60 * 1000
    const check = () => {
      api.getPipelineStatus().then(s => {
        setPipelineStatus(s)
        // Clear running flag if pipeline is stopped or if the run is stale (started > 5 min ago)
        const isStale = s.started_at
          && (Date.now() - new Date(s.started_at).getTime()) > STALE_THRESHOLD
        if (!s.running || isStale) setRunning(false)
      }).catch(() => {})
    }
    check()
    const iv = setInterval(check, 3_000)
    return () => clearInterval(iv)
  }, [])

  const handleRun = async (mode: RunMode) => {
    setFetching(true)
    try {
      await api.triggerFetch(mode)
      setRunning(true)
      const labels = { fetch: 'Fetch', summarize: 'Summarize', fetch_summarize: 'Fetch + Summarize' }
      showToast(`${labels[mode]} triggered — results will appear shortly`)
    } catch (e) {
      showToast('Trigger failed: ' + (e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  const statusKey = health === null ? 'no_data' : (health.status ?? 'error')
  const meta = STATUS_META[statusKey]

  // Count items per sensor source
  const sensorCounts: Record<string, number> = {}
  if (report) {
    for (const items of Object.values(report.items)) {
      for (const item of items) {
        sensorCounts[item.source] = (sensorCounts[item.source] ?? 0) + 1
      }
    }
  }

  const totalItems  = Object.values(report?.items ?? {}).reduce((s, arr) => s + arr.length, 0)
  const okCount     = report?.sources_ok.length ?? 0
  const failedCount = report?.sources_failed.length ?? 0

  // Consider pipeline stale if started_at is more than 5 minutes ago
  const isRunning = !!(pipelineStatus?.running && pipelineStatus.started_at
    && (Date.now() - new Date(pipelineStatus.started_at).getTime()) < 5 * 60 * 1000)

  // Build live-sensor lookup once (used across all sections when running)
  const liveSensors: Record<string, SensorJobProgress> = {}
  if (isRunning && pipelineStatus) {
    for (const sp of pipelineStatus.sensors) {
      liveSensors[sp.name] = sp
    }
  }

  // Stage-based progress calculation
  const totalStages = (() => {
    if (!pipelineStatus) return 0
    const n = pipelineStatus.sensors.length
    switch (pipelineStatus.mode) {
      case 'fetch': return n
      case 'summarize': return n + 1
      case 'fetch_summarize': return n * 2 + 1
    }
  })()

  const doneStages = (() => {
    if (!pipelineStatus) return 0
    let done = 0
    for (const s of pipelineStatus.sensors) {
      if (['ok', 'failed', 'skipped'].includes(s.fetch)) done++
      if (['ok', 'failed', 'skipped'].includes(s.summary)) done++
    }
    if (['ok', 'failed', 'skipped'].includes(pipelineStatus.overall_summary)) done++
    return done
  })()

  // Derive hero state from pipeline progress
  const heroState = (() => {
    if (!isRunning) return 'idle'
    if (!pipelineStatus) return 'running'
    const anySummaryRunning = pipelineStatus.sensors.some(s => s.summary === 'running')
      || pipelineStatus.overall_summary === 'running'
    const anyFetchRunning = pipelineStatus.sensors.some(s => s.fetch === 'running')
    if (anySummaryRunning) return 'summarizing'
    if (anyFetchRunning) return 'fetching'
    return 'running'
  })()

  // Hero banner background: running overrides to amber, otherwise reflects health
  const heroBg = isRunning ? 'var(--warn-bg)' : meta.bg

  return (
    <section id="status" style={{ padding: '4.5rem 0' }}>

      {/* ── Page header (hidden on mobile — shown in top bar) ─────── */}
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
          Status
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
          Pipeline health, last run outcomes, and scheduled activity.
        </p>
      </div>

      {/* ── Hero Status Banner ──────────────────────────────── */}
      <div className="hero-banner" style={{
        background: heroBg,
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.5rem 2rem',
        marginBottom: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div className="hero-row" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem',
        }}>
          {/* Left side: status dot + health label + description */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
            <span style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: isRunning ? 'var(--accent)' : meta.color,
              flexShrink: 0,
              animation: isRunning ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--ink)',
                lineHeight: 1.3,
              }}>
                {heroState === 'fetching' ? 'Fetching'
                  : heroState === 'summarizing' ? 'Summarizing'
                  : isRunning ? 'Pipeline Running'
                  : meta.label}
              </div>
              <div style={{
                fontSize: '0.8125rem',
                color: 'var(--ink-muted)',
                marginTop: '0.125rem',
              }}>
                {isRunning && pipelineStatus
                  ? `${doneStages}/${totalStages} stages complete \u00b7 ${pipelineStatus.total_items} items`
                  : meta.desc}
              </div>
            </div>
          </div>

          {/* Right side: last run timestamp + run mode buttons */}
          <div className="hero-actions" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.25rem',
            flexShrink: 0,
          }}>
            {health?.last_fetch && !isRunning && (
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}>
                  {timeAgo(health.last_fetch)}
                </div>
                <div style={{
                  fontSize: '0.6875rem',
                  color: 'var(--ink-faint)',
                  fontFamily: 'ui-monospace, monospace',
                  marginTop: '0.125rem',
                }}>
                  {health.last_fetch.slice(0, 16).replace('T', ' ')}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => handleRun('fetch')}
                disabled={fetching || running || isRunning}
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: 'none',
                  color: (fetching || running || isRunning) ? 'var(--ink-faint)' : '#FFFFFF',
                  background: (fetching || running || isRunning) ? 'var(--border)' : 'var(--ink)',
                  cursor: (fetching || running || isRunning) ? 'not-allowed' : 'pointer',
                  transition: 'background 120ms',
                  whiteSpace: 'nowrap',
                }}
              >
                Fetch
              </button>
              <button
                onClick={() => handleRun('summarize')}
                disabled={fetching || running || isRunning || !report}
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: 'none',
                  color: (fetching || running || isRunning || !report) ? 'var(--ink-faint)' : '#FFFFFF',
                  background: (fetching || running || isRunning || !report) ? 'var(--border)' : 'var(--ink)',
                  cursor: (fetching || running || isRunning || !report) ? 'not-allowed' : 'pointer',
                  transition: 'background 120ms',
                  whiteSpace: 'nowrap',
                }}
              >
                Summarize
              </button>
              <button
                onClick={() => handleRun('fetch_summarize')}
                disabled={fetching || running || isRunning}
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  padding: '0.5rem 1rem',
                  borderRadius: 6,
                  border: 'none',
                  color: (fetching || running || isRunning) ? 'var(--ink-faint)' : '#FFFFFF',
                  background: (fetching || running || isRunning) ? 'var(--border)' : 'var(--ink)',
                  cursor: (fetching || running || isRunning) ? 'not-allowed' : 'pointer',
                  transition: 'background 120ms',
                  whiteSpace: 'nowrap',
                }}
              >
                Fetch + Summarize
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar — visible when pipeline is actively running */}
        {isRunning && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'var(--border)',
          }}>
            <div style={{
              height: '100%',
              width: totalStages > 0 ? `${Math.round((doneStages / totalStages) * 100)}%` : '0%',
              background: 'var(--accent)',
              borderRadius: '0 2px 2px 0',
              transition: 'width 400ms ease',
            }} />
          </div>
        )}
      </div>

      {/* ── Stat Cards (3-column) ───────────────────────────── */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>

        {/* Last Run */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderTop: '3px solid var(--accent-dim)',
          borderRadius: 8,
          padding: '1.25rem 1.5rem',
        }}>
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: '0.75rem',
          }}>
            Last Run
          </div>
          {health?.last_fetch ? (
            <>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--ink)',
                fontFamily: 'ui-monospace, monospace',
                marginBottom: '0.25rem',
              }}>
                {timeAgo(health.last_fetch)}
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--ink-faint)',
                fontFamily: 'ui-monospace, monospace',
              }}>
                {health.last_fetch.slice(0, 16).replace('T', ' ')}
              </div>
            </>
          ) : (
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>Never</div>
          )}
        </div>

        {/* Next Run */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderTop: '3px solid var(--accent-dim)',
          borderRadius: 8,
          padding: '1.25rem 1.5rem',
        }}>
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: '0.75rem',
          }}>
            Next Run
          </div>
          {config ? (
            <>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--ink)',
                fontFamily: 'ui-monospace, monospace',
                marginBottom: '0.25rem',
              }}>
                {config.fetch_time}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                {nextFetchIn(config.fetch_time, config.fetch_timezone)}
                <span style={{ color: 'var(--ink-faint)', marginLeft: '0.25rem' }}>· {config.fetch_timezone}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>Loading…</div>
          )}
        </div>

        {/* Items Fetched */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderTop: '3px solid var(--accent-dim)',
          borderRadius: 8,
          padding: '1.25rem 1.5rem',
        }}>
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: '0.75rem',
          }}>
            Items Fetched
          </div>
          {report ? (
            <>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--ink)',
                fontFamily: 'ui-monospace, monospace',
                marginBottom: '0.25rem',
              }}>
                {totalItems}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                <span style={{ color: 'var(--ok)' }}>{okCount} ok</span>
                {failedCount > 0 && (
                  <span style={{ color: 'var(--err)', marginLeft: '0.5rem' }}>{failedCount} failed</span>
                )}
                <span style={{ color: 'var(--ink-faint)', marginLeft: '0.5rem' }}>sensors</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>
              {health && !health.last_fetch ? '—' : 'Loading…'}
            </div>
          )}
        </div>
      </div>

      {/* ── Sources — 2-column grid of section cards ─────────── */}
      <div className="source-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        {SECTION_SENSORS.map((section) => {
          // Section total: sum of sensor counts for this section
          // Social items have source='x'/'bluesky'/'mastodon' (not the sensor name),
          // so we count them from the report section directly when idle.
          const sectionTotal = isRunning
            ? section.sensors.reduce((sum, sk) => {
                const sp = liveSensors[sk]
                return sum + (sp?.fetch === 'ok' ? sp.item_count : 0)
              }, 0)
            : section.key === 'social'
              ? (report?.items['social']?.length ?? 0)
              : section.sensors.reduce((sum, sk) => sum + (sensorCounts[sk] ?? 0), 0)

          return (
            <div key={section.key} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              {/* Section card header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1.25rem',
              }}>
                <span style={{
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: 'var(--ink)',
                }}>
                  {section.label}
                </span>
                <span style={{
                  fontSize: '0.875rem',
                  color: sectionTotal > 0 ? 'var(--accent)' : 'var(--ink-faint)',
                  fontWeight: sectionTotal > 0 ? 700 : 400,
                  fontFamily: 'ui-monospace, monospace',
                }}>
                  {isRunning
                    ? (sectionTotal > 0 ? String(sectionTotal) : '—')
                    : (report ? String(sectionTotal) : '…')}
                </span>
              </div>

              {/* Sensor rows within this section */}
              {section.sensors.map((sensorKey) => {
                const label = SENSOR_LABEL_MAP[sensorKey] ?? sensorKey

                // When pipeline is actively running, derive status from live two-stage progress
                if (isRunning) {
                  const sp = liveSensors[sensorKey]
                  const fetchState = sp?.fetch ?? 'queued'

                  const isConfigErr = fetchState === 'failed' && sp?.fetch_error_kind === 'config'
                  const isOkZero = fetchState === 'ok' && sp!.item_count === 0

                  // Derive a composite state for the dot color: fetch drives the primary indicator
                  const dotColor =
                    isOkZero                  ? 'var(--warn)'   :
                    fetchState === 'ok'       ? 'var(--ok)'     :
                    isConfigErr               ? 'var(--warn)'   :
                    fetchState === 'failed'   ? 'var(--err)'    :
                    fetchState === 'running'  ? 'var(--accent)' :
                    'var(--border)'

                  const labelColor =
                    fetchState === 'failed' && !isConfigErr ? 'var(--err)'      :
                    fetchState === 'queued'                 ? 'var(--ink-faint)' :
                    'var(--ink)'

                  return (
                    <div key={sensorKey} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.4375rem 1.25rem 0.4375rem 2rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: dotColor,
                          flexShrink: 0,
                          animation: fetchState === 'running' ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
                        }} />
                        <span style={{ fontSize: '0.8125rem', color: labelColor }}>
                          {label}
                        </span>
                      </div>
                      {sp ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <StageBadge state={sp.fetch} label="Fetch" />
                          <StageBadge state={sp.summary} label="Summary" />
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>{'\u2014'}</span>
                      )}
                    </div>
                  )
                }

                // Idle state: derive status from report + last pipeline status
                const isDisabled = config?.sensors_enabled[sensorKey] === false
                const isOk       = !isDisabled && report?.sources_ok.includes(sensorKey)
                const isFailed   = !isDisabled && report?.sources_failed.includes(sensorKey)
                const count      = sensorCounts[sensorKey] ?? 0

                // Use pipeline status fetch_error_kind as source of truth for failure classification
                const lastSp = pipelineStatus?.sensors.find(s => s.name === sensorKey)
                const idleConfigErr = isFailed && lastSp?.fetch_error_kind === 'config'
                const idleOkZero = isOk && count === 0

                const dotColor = isDisabled    ? 'var(--border)'
                  : idleOkZero   ? 'var(--warn)'
                  : isOk         ? 'var(--ok)'
                  : idleConfigErr ? 'var(--warn)'
                  : isFailed     ? 'var(--err)'
                  : 'var(--border)'

                const rightText = isDisabled     ? 'Off'
                  : idleOkZero   ? '0'
                  : isOk         ? `${count}`
                  : idleConfigErr ? (lastSp?.fetch_error ?? 'Missing config').slice(0, 30)
                  : isFailed     ? 'Failed'
                  : report       ? '—' : '…'

                const rightColor = isDisabled    ? 'var(--ink-faint)'
                  : idleOkZero   ? 'var(--warn)'
                  : idleConfigErr ? 'var(--warn)'
                  : isFailed     ? 'var(--err)'
                  : isOk         ? 'var(--accent)'
                  : 'var(--ink-faint)'

                return (
                  <div key={sensorKey} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.4375rem 1.25rem 0.4375rem 2rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: dotColor,
                        flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: '0.8125rem',
                        color: isDisabled ? 'var(--ink-faint)' : 'var(--ink)',
                      }}>
                        {label}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '0.75rem',
                      color: rightColor,
                      fontWeight: isOk ? 600 : (isFailed ? 500 : 400),
                      fontFamily: isOk ? 'ui-monospace, monospace' : 'inherit',
                    }}>
                      {rightText}
                    </span>
                  </div>
                )
              })}

              {/* Bottom padding for the last sensor row */}
              <div style={{ height: '0.5rem' }} />
            </div>
          )
        })}
      </div>

      {/* ── Overall Summary row (when mode includes summarization) ── */}
      {pipelineStatus && pipelineStatus.mode !== 'fetch' && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0.75rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--ink)' }}>
            Overall Summary
          </span>
          <StageBadge state={pipelineStatus.overall_summary} label={
            pipelineStatus.overall_summary === 'running' ? 'Generating\u2026' :
            pipelineStatus.overall_summary === 'ok' ? 'Complete' :
            pipelineStatus.overall_summary === 'failed' ? 'Failed' :
            pipelineStatus.overall_summary === 'queued' ? 'Waiting' : '\u2014'
          } />
        </div>
      )}

      {/* ── Total summary ───────────────────────────────────── */}
      {(report || isRunning) && (
        <div style={{
          textAlign: 'center',
          fontSize: '0.8125rem',
          color: 'var(--ink-muted)',
          paddingTop: '0.25rem',
        }}>
          <span style={{
            fontWeight: 700,
            color: 'var(--ink)',
            fontFamily: 'ui-monospace, monospace',
          }}>
            {isRunning && pipelineStatus
              ? pipelineStatus.total_items
              : totalItems}
          </span>
          {' '}items total
        </div>
      )}

      {/* ── Console — sensor errors from last run ─────────── */}
      {(() => {
        // Build errors from both fetch and summary stages
        const allErrors: Array<{ name: string; error: string; kind: 'config' | 'api' | null }> = []
        for (const s of (pipelineStatus?.sensors ?? [])) {
          if (s.fetch_error) allErrors.push({ name: s.name, error: s.fetch_error, kind: s.fetch_error_kind })
          if (s.summary_error) allErrors.push({ name: s.name, error: s.summary_error, kind: null })
        }
        const errors = allErrors.slice(0, 100)
        const configErrors = errors.filter(e => e.kind === 'config')
        const apiErrors = errors.filter(e => e.kind !== 'config')

        return (
          <div style={{ marginTop: '2rem' }}>
            <h3 style={{
              fontSize: '0.625rem',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              marginBottom: '0.75rem',
            }}>
              Console
            </h3>

            {errors.length === 0 ? (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '1.25rem',
                textAlign: 'center',
                color: 'var(--ink-faint)',
                fontSize: '0.8125rem',
              }}>
                {pipelineStatus ? 'No errors \u2014 all sensors reporting clean.' : 'Loading pipeline status\u2026'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {configErrors.length > 0 && (
                  <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderTop: '3px solid var(--warn)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '0.75rem 1.25rem',
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--warn)',
                    }}>
                      Configuration ({configErrors.length})
                    </div>
                    {configErrors.map((e, i) => <ErrorRow key={`${e.name}-cfg-${i}`} entry={e} />)}
                  </div>
                )}

                {apiErrors.length > 0 && (
                  <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderTop: '3px solid var(--err)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '0.75rem 1.25rem',
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--err)',
                    }}>
                      API Errors ({apiErrors.length})
                    </div>
                    {apiErrors.map((e, i) => <ErrorRow key={`${e.name}-api-${i}`} entry={e} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}
    </section>
  )
}
