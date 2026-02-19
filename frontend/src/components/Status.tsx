// ABOUTME: Pipeline status dashboard — shows health, last run results, per-sensor outcomes, and section item counts.
// ABOUTME: Polls health every 10s; when running, polls /fetch/status every 2s for live sensor progress.
'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/api/client'
import type { HealthResponse, IntelReport, ConfigSettings, PipelineStatus, SensorProgress } from '@/api/client'
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
  { key: 'hacker_news',  label: 'Hacker News' },
  { key: 'arxiv',        label: 'ArXiv AI' },
  { key: 'github',       label: 'GitHub Trending' },
  { key: 'product_hunt', label: 'Product Hunt' },
  { key: 'v2ex',         label: 'V2EX' },
  { key: 'hn_blogs',     label: 'HN Blogs' },
  { key: 'grok',         label: 'Grok' },
  { key: 'sources_36kr', label: '36Kr' },
  { key: 'wallstreetcn', label: 'WallStreetCN' },
  { key: 'politics',     label: 'Accounts' },
  { key: 'topics',       label: 'Topics' },
]

const SECTION_SENSORS = [
  { key: 'tech_trends',  label: 'Tech Trends',  sensors: ['hacker_news', 'github', 'grok'] },
  { key: 'research',     label: 'Research',      sensors: ['arxiv'] },
  { key: 'capital_flow', label: 'Capital Flow',  sensors: ['sources_36kr', 'wallstreetcn'] },
  { key: 'products',     label: 'Products',      sensors: ['product_hunt'] },
  { key: 'community',    label: 'Community',     sensors: ['v2ex'] },
  { key: 'politics',     label: 'Accounts',      sensors: ['politics'] },
  { key: 'topics',       label: 'Topics',        sensors: ['topics'] },
  { key: 'insights',     label: 'Insights',      sensors: ['hn_blogs'] },
]

const STATUS_META: Record<string, { color: string; bg: string; label: string; desc: string }> = {
  ok:      { color: 'var(--ok)',        bg: 'var(--ok-bg)',      label: 'Healthy',  desc: 'Data is fresh and up to date' },
  stale:   { color: 'var(--warn)',      bg: 'var(--warn-bg)',    label: 'Stale',    desc: 'Data is older than the cache TTL' },
  no_data: { color: 'var(--ink-faint)', bg: 'var(--surface-alt)',label: 'No Data',  desc: 'Pipeline has never run' },
  error:   { color: 'var(--err)',       bg: 'var(--err-bg)',     label: 'Error',    desc: 'Could not read pipeline status' },
}

const SENSOR_LABEL_MAP: Record<string, string> = Object.fromEntries(ALL_SENSORS.map(s => [s.key, s.label]))

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

  const handleRunNow = async () => {
    setFetching(true)
    try {
      await api.triggerFetch()
      setRunning(true)
      showToast('Pipeline triggered — results will appear shortly')
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
  const liveSensors: Record<string, SensorProgress> = {}
  if (isRunning && pipelineStatus) {
    for (const sp of pipelineStatus.sensors) {
      liveSensors[sp.name] = sp
    }
  }

  const doneSensors = pipelineStatus
    ? pipelineStatus.sensors.filter(s => s.state === 'ok' || s.state === 'failed').length
    : 0
  const totalSensors = pipelineStatus?.sensors.length ?? 0

  // Hero banner background: running overrides to amber, otherwise reflects health
  const heroBg = isRunning ? 'var(--warn-bg)' : meta.bg

  return (
    <section id="status" style={{ padding: '4.5rem 0' }}>

      {/* ── Page header (simplified — no action button) ─────── */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
          Status
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
          Pipeline health, last run outcomes, and scheduled activity.
        </p>
      </div>

      {/* ── Hero Status Banner ──────────────────────────────── */}
      <div style={{
        background: heroBg,
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.5rem 2rem',
        marginBottom: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
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
                {isRunning ? 'Pipeline Running' : meta.label}
              </div>
              <div style={{
                fontSize: '0.8125rem',
                color: 'var(--ink-muted)',
                marginTop: '0.125rem',
              }}>
                {isRunning && pipelineStatus
                  ? `${doneSensors}/${totalSensors} sensors complete · ${pipelineStatus.total_items} items`
                  : meta.desc}
              </div>
            </div>
          </div>

          {/* Right side: last run timestamp + Run Now button */}
          <div style={{
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
            <button
              onClick={handleRunNow}
              disabled={fetching || running || isRunning}
              style={{
                fontSize: '0.875rem',
                fontWeight: 500,
                padding: '0.625rem 1.5rem',
                borderRadius: 6,
                border: 'none',
                color: (fetching || running || isRunning) ? 'var(--ink-faint)' : '#FFFFFF',
                background: (fetching || running || isRunning) ? 'var(--border)' : 'var(--ink)',
                cursor: (fetching || running || isRunning) ? 'not-allowed' : 'pointer',
                transition: 'background 120ms',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!fetching && !running && !isRunning) (e.currentTarget as HTMLElement).style.background = '#000000' }}
              onMouseLeave={e => { if (!fetching && !running && !isRunning) (e.currentTarget as HTMLElement).style.background = 'var(--ink)' }}
            >
              {fetching ? 'Triggering…' : 'Run Now'}
            </button>
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
              width: totalSensors > 0 ? `${Math.round((doneSensors / totalSensors) * 100)}%` : '0%',
              background: 'var(--accent)',
              borderRadius: '0 2px 2px 0',
              transition: 'width 400ms ease',
            }} />
          </div>
        )}
      </div>

      {/* ── Stat Cards (3-column) ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>

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
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        {SECTION_SENSORS.map((section) => {
          // Section total: sum of sensor counts for this section
          const sectionTotal = isRunning
            ? section.sensors.reduce((sum, sk) => {
                const sp = liveSensors[sk]
                return sum + (sp?.state === 'ok' ? sp.item_count : 0)
              }, 0)
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

                // When pipeline is actively running, derive status from live progress
                if (isRunning) {
                  const sp = liveSensors[sensorKey]
                  const state = sp?.state ?? 'pending'

                  const isConfigErr = state === 'failed' && sp?.error_kind === 'config'
                  const isOkZero = state === 'ok' && sp!.item_count === 0

                  const dotColor =
                    isOkZero            ? 'var(--warn)'   :
                    state === 'ok'      ? 'var(--ok)'     :
                    isConfigErr         ? 'var(--warn)'   :
                    state === 'failed'  ? 'var(--err)'    :
                    state === 'running' ? 'var(--accent)' :
                    'var(--border)'

                  const labelColor =
                    state === 'failed' && !isConfigErr ? 'var(--err)'      :
                    state === 'pending'                ? 'var(--ink-faint)' :
                    'var(--ink)'

                  const rightText =
                    isOkZero            ? '0'                                  :
                    state === 'ok'      ? String(sp!.item_count)               :
                    isConfigErr         ? (sp?.error ?? 'Missing config').slice(0, 30) :
                    state === 'failed'  ? (sp?.error ?? 'Failed')              :
                    state === 'running' ? 'Running…'                           :
                    '—'

                  const rightColor =
                    isOkZero            ? 'var(--warn)'    :
                    isConfigErr         ? 'var(--warn)'    :
                    state === 'failed'  ? 'var(--err)'     :
                    state === 'ok'      ? 'var(--accent)'  :
                    state === 'running' ? 'var(--ink-muted)' :
                    'var(--ink-faint)'

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
                          animation: state === 'running' ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
                        }} />
                        <span style={{ fontSize: '0.8125rem', color: labelColor }}>
                          {label}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '0.75rem',
                        color: rightColor,
                        fontWeight: state === 'ok' ? 600 : 400,
                        fontFamily: state === 'ok' ? 'ui-monospace, monospace' : 'inherit',
                      }}>
                        {rightText}
                      </span>
                    </div>
                  )
                }

                // Idle state: derive status from report + last pipeline status
                const isDisabled = config?.sensors_enabled[sensorKey] === false
                const isOk       = !isDisabled && report?.sources_ok.includes(sensorKey)
                const isFailed   = !isDisabled && report?.sources_failed.includes(sensorKey)
                const count      = sensorCounts[sensorKey] ?? 0

                // Use pipeline status error_kind as source of truth for failure classification
                const lastSp = pipelineStatus?.sensors.find(s => s.name === sensorKey)
                const idleConfigErr = isFailed && lastSp?.error_kind === 'config'
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
                  : idleConfigErr ? (lastSp?.error ?? 'Missing config').slice(0, 30)
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
    </section>
  )
}
