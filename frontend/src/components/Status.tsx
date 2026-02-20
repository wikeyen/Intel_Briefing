// ABOUTME: Pipeline status dashboard — shows health, last run results, per-sensor outcomes, and section item counts.
// ABOUTME: Polls health every 10s; when running, polls /fetch/status every 2s for live sensor progress.
'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/api/client'
import type { HealthResponse, IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress, RunMode } from '@/api/client'
import { useToast } from '@/lib/toast-context'
import { ActionBar } from './status/ActionBar'
import type { Phase } from './status/ActionBar'
import { SensorTable } from './status/SensorTable'
import { ScheduleFooter } from './status/ScheduleFooter'

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

  // Pipeline phase — determines ActionBar label and progress tracking
  const phase: Phase = (() => {
    if (!isRunning) return 'idle'
    if (!pipelineStatus) return 'fetching'
    if (pipelineStatus.overall_summary === 'running') return 'briefing'
    const anySummary = pipelineStatus.sensors.some(s => s.summary === 'running')
    if (anySummary) return 'summarizing'
    return 'fetching'
  })()

  // Progress counters — done/total for the current phase
  const progress = (() => {
    if (!pipelineStatus) return { done: 0, total: 0 }
    const total = pipelineStatus.sensors.length
    if (phase === 'summarizing' || phase === 'briefing') {
      const done = pipelineStatus.sensors.filter(s => ['ok', 'failed', 'skipped'].includes(s.summary)).length
      return { done, total }
    }
    const done = pipelineStatus.sensors.filter(s => ['ok', 'failed', 'skipped'].includes(s.fetch)).length
    return { done, total }
  })()

  return (
    <section id="status" style={{ padding: '4.5rem 0' }}>
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
          Status
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
          Pipeline health, last run outcomes, and scheduled activity.
        </p>
      </div>

      <ActionBar
        health={health}
        isRunning={isRunning}
        phase={phase}
        progress={progress}
        fetching={fetching}
        onRun={handleRun}
      />

      <SensorTable
        isRunning={isRunning}
        liveSensors={liveSensors}
        report={report}
        config={config}
        pipelineStatus={pipelineStatus}
      />

      <ScheduleFooter config={config} />
    </section>
  )
}
