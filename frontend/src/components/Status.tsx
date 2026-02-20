// ABOUTME: Pipeline status dashboard — shows health, last run results, per-sensor outcomes, and section item counts.
// ABOUTME: Polls health every 10s; when running, polls /fetch/status every 2s for live sensor progress.
'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/api/client'
import type { HealthResponse, IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress, RunMode } from '@/api/client'
import { useToast } from '@/lib/toast-context'
import { STATUS_META } from './status/constants'
import { HeroBanner } from './status/HeroBanner'
import { StatCards } from './status/StatCards'
import { SensorGrid } from './status/SensorGrid'
import { Console } from './status/Console'

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
      <HeroBanner
        isRunning={isRunning}
        meta={meta}
        heroState={heroState}
        health={health}
        fetching={fetching}
        running={running}
        report={report}
        doneStages={doneStages}
        totalStages={totalStages}
        pipelineStatus={pipelineStatus}
        onRun={handleRun}
      />

      {/* ── Stat Cards (3-column) ───────────────────────────── */}
      <StatCards
        health={health}
        report={report}
        config={config}
        totalItems={totalItems}
        okCount={okCount}
        failedCount={failedCount}
      />

      {/* ── Sources — 2-column grid of section cards ─────────── */}
      <SensorGrid
        isRunning={isRunning}
        liveSensors={liveSensors}
        report={report}
        config={config}
        pipelineStatus={pipelineStatus}
        sensorCounts={sensorCounts}
      />

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
      <Console pipelineStatus={pipelineStatus} />
    </section>
  )
}
