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

const SECTIONS: [string, string][] = [
  ['tech_trends', 'Tech Trends'],
  ['research',    'Research'],
  ['capital_flow','Capital Flow'],
  ['products',    'Products'],
  ['community',   'Community'],
  ['politics',    'Accounts'],
  ['topics',      'Topics'],
  ['insights',    'Insights'],
]

const STATUS_META: Record<string, { color: string; bg: string; label: string; desc: string }> = {
  ok:      { color: 'var(--ok)',        bg: 'var(--ok-bg)',      label: 'Healthy',  desc: 'Data is fresh and up to date' },
  stale:   { color: 'var(--warn)',      bg: 'var(--warn-bg)',    label: 'Stale',    desc: 'Data is older than the cache TTL' },
  no_data: { color: 'var(--ink-faint)', bg: 'var(--surface-alt)',label: 'No Data',  desc: 'Pipeline has never run' },
  error:   { color: 'var(--err)',       bg: 'var(--err-bg)',     label: 'Error',    desc: 'Could not read pipeline status' },
}

const SENSOR_LABEL_MAP: Record<string, string> = Object.fromEntries(ALL_SENSORS.map(s => [s.key, s.label]))

function PipelineRunPanel({ status }: { status: PipelineStatus }) {
  const done  = status.sensors.filter(s => s.state === 'ok' || s.state === 'failed').length
  const total = status.sensors.length

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      overflow: 'hidden',
      marginBottom: '2rem',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.875rem 1.125rem',
        borderBottom: '1px solid var(--border-soft)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--warn)',
            flexShrink: 0,
            animation: 'pulseDot 1.6s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)' }}>
            Pipeline Running
          </span>
        </div>
        <span style={{
          fontSize: '0.75rem',
          color: 'var(--ink-faint)',
          fontFamily: 'ui-monospace, monospace',
        }}>
          {done}/{total} sensors · {status.total_items} items
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'var(--surface-alt)' }}>
        <div style={{
          height: '100%',
          width: total > 0 ? `${Math.round((done / total) * 100)}%` : '0%',
          background: 'var(--accent-dim)',
          transition: 'width 400ms ease',
        }} />
      </div>

      {/* Sensor rows — 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {status.sensors.map((sp: SensorProgress, i: number) => {
          const dotColor =
            sp.state === 'ok'      ? 'var(--ok)'   :
            sp.state === 'failed'  ? 'var(--err)'  :
            sp.state === 'running' ? 'var(--warn)'  :
            'var(--border)'

          const labelColor =
            sp.state === 'failed'  ? 'var(--err)'      :
            sp.state === 'pending' ? 'var(--ink-faint)' :
            'var(--ink)'

          const rightText =
            sp.state === 'ok'      ? String(sp.item_count) :
            sp.state === 'failed'  ? (sp.error ?? 'Failed') :
            sp.state === 'running' ? '…' :
            '—'

          const rightColor =
            sp.state === 'failed' ? 'var(--err)'      :
            sp.state === 'ok'     ? 'var(--ink-muted)' :
            'var(--ink-faint)'

          const isRightCol = i % 2 === 1
          const isLastRow  = i >= total - (total % 2 === 0 ? 2 : 1)

          return (
            <div key={sp.name} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5625rem 1.125rem',
              borderRight: !isRightCol ? '1px solid var(--border-soft)' : 'none',
              borderBottom: !isLastRow ? '1px solid var(--border-soft)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: dotColor,
                  flexShrink: 0,
                  animation: sp.state === 'running' ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontSize: '0.8125rem', color: labelColor }}>
                  {SENSOR_LABEL_MAP[sp.name] ?? sp.name}
                </span>
              </div>
              <span style={{
                fontSize: '0.75rem',
                color: rightColor,
                fontFamily: sp.state === 'ok' ? 'ui-monospace, monospace' : 'inherit',
              }}>
                {rightText}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '1.375rem 1.5rem',
    }}>
      <div style={{
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--ink-faint)',
        marginBottom: '1rem',
      }}>
        {label}
      </div>
      {children}
    </div>
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
    const check = () => {
      api.getPipelineStatus().then(s => {
        setPipelineStatus(s)
        if (!s.running) setRunning(false)
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

  const statusKey = health?.status ?? 'error'
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

  return (
    <section id="status" style={{ padding: '4.5rem 0' }}>

      {/* ── Page header ───────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: '2.5rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
            Status
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
            Pipeline health, last run outcomes, and scheduled activity.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--warn)',
                flexShrink: 0,
                animation: 'pulseDot 1.6s ease-in-out infinite',
              }} />
              <span style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>
                Pipeline running…
              </span>
            </div>
          )}
          <button
            onClick={handleRunNow}
            disabled={fetching || running}
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              padding: '0.625rem 1.5rem',
              borderRadius: 4,
              border: 'none',
              color: (fetching || running) ? 'var(--ink-faint)' : '#FFFFFF',
              background: (fetching || running) ? 'var(--border)' : 'var(--ink)',
              cursor: (fetching || running) ? 'not-allowed' : 'pointer',
              transition: 'background 120ms',
            }}
            onMouseEnter={e => { if (!fetching && !running) (e.currentTarget as HTMLElement).style.background = '#000000' }}
            onMouseLeave={e => { if (!fetching && !running) (e.currentTarget as HTMLElement).style.background = 'var(--ink)' }}
          >
            {fetching ? 'Triggering…' : 'Run Now'}
          </button>
        </div>
      </div>

      {/* ── Live pipeline run panel ────────────────────────── */}
      {pipelineStatus?.running && (
        <PipelineRunPanel status={pipelineStatus} />
      )}

      {/* ── Stat cards ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>

        <StatCard label="Pipeline">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink)' }}>{meta.label}</span>
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>{meta.desc}</div>
        </StatCard>

        <StatCard label="Last Run">
          {health?.last_fetch ? (
            <>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.375rem' }}>
                {timeAgo(health.last_fetch)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>
                {health.last_fetch.slice(0, 16).replace('T', ' ')}
              </div>
            </>
          ) : (
            <div style={{ fontSize: '1rem', color: 'var(--ink-faint)' }}>Never</div>
          )}
        </StatCard>

        <StatCard label="Next Run">
          {config ? (
            <>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace', marginBottom: '0.375rem' }}>
                {config.fetch_time}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>
                {nextFetchIn(config.fetch_time, config.fetch_timezone)}
                <span style={{ color: 'var(--ink-faint)', marginLeft: '0.25rem' }}>· {config.fetch_timezone}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: '1rem', color: 'var(--ink-faint)' }}>Loading…</div>
          )}
        </StatCard>

        <StatCard label="Items Fetched">
          {report ? (
            <>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.375rem' }}>
                {totalItems}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>
                <span style={{ color: 'var(--ok)' }}>{okCount} ok</span>
                {failedCount > 0 && (
                  <span style={{ color: 'var(--err)', marginLeft: '0.5rem' }}>{failedCount} failed</span>
                )}
                <span style={{ color: 'var(--ink-faint)', marginLeft: '0.5rem' }}>sensors</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: '1rem', color: 'var(--ink-faint)' }}>Loading…</div>
          )}
        </StatCard>
      </div>

      {/* ── Sensors + Sections ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

        {/* Sensors */}
        <div>
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: '0.75rem',
          }}>
            Sensors
          </div>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            {ALL_SENSORS.map(({ key, label }, i) => {
              const isDisabled = config?.sensors_enabled[key] === false
              const isOk       = !isDisabled && report?.sources_ok.includes(key)
              const isFailed   = !isDisabled && report?.sources_failed.includes(key)
              const count      = sensorCounts[key] ?? 0

              const dotColor = isDisabled ? 'var(--border)'
                : isOk     ? 'var(--ok)'
                : isFailed ? 'var(--err)'
                : 'var(--border)'

              const rightText = isDisabled ? 'Off'
                : isOk       ? `${count}`
                : isFailed   ? 'Failed'
                : report     ? '—' : '…'

              const rightColor = isFailed ? 'var(--err)' : isOk ? 'var(--ink-muted)' : 'var(--ink-faint)'

              return (
                <div key={key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6875rem 1.125rem',
                  borderBottom: i < ALL_SENSORS.length - 1 ? '1px solid var(--border-soft)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: dotColor,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: '0.875rem',
                      color: isDisabled ? 'var(--ink-faint)' : 'var(--ink)',
                    }}>
                      {label}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    color: rightColor,
                    fontFamily: isOk ? 'ui-monospace, monospace' : 'inherit',
                    fontWeight: isFailed ? 500 : 400,
                  }}>
                    {rightText}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sections */}
        <div>
          <div style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: '0.75rem',
          }}>
            Sections
          </div>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            {SECTIONS.map(([key, label], i) => {
              const count = report?.items[key]?.length ?? 0
              const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0

              return (
                <div key={key} style={{
                  padding: '0.6875rem 1.125rem',
                  borderBottom: i < SECTIONS.length - 1 ? '1px solid var(--border-soft)' : 'none',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: count > 0 && report ? '0.5rem' : 0,
                  }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--ink)' }}>{label}</span>
                    <span style={{
                      fontSize: '0.75rem',
                      color: 'var(--ink-muted)',
                      fontFamily: 'ui-monospace, monospace',
                    }}>
                      {report ? count : '…'}
                    </span>
                  </div>
                  {count > 0 && report && (
                    <div style={{ height: 2, background: 'var(--surface-alt)', borderRadius: 1 }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: 'var(--accent-dim)',
                        borderRadius: 1,
                        transition: 'width 600ms ease',
                      }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {report && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0.875rem 1.125rem 0',
            }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>Total</span>
              <span style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--ink)',
                fontFamily: 'ui-monospace, monospace',
              }}>
                {totalItems}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
