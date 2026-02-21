// ABOUTME: Pipeline status dashboard — shows health, last run results, per-sensor outcomes, and section item counts.
// ABOUTME: Polls health every 10s; when running, polls /fetch/status every 2s for live sensor progress.
'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { api } from '@/api/client'
import type { HealthResponse, IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress, RunMode } from '@/api/client'
import { useToast } from '@/lib/toast-context'
import { ActionBar } from './status/ActionBar'
import type { Phase } from './status/ActionBar'
import { SensorTable } from './status/SensorTable'
import { SENSOR_LABEL_MAP, SECTION_SENSORS } from './status/constants'
import { ScheduleFooter } from './status/ScheduleFooter'
import { StaleProcessBanner, detectStale } from './StaleProcessBanner'

export function Status() {
  const showToast = useToast()
  const [health, setHealth]           = useState<HealthResponse | null>(null)
  const [report, setReport]           = useState<IntelReport | null>(null)
  const [config, setConfig]           = useState<ConfigSettings | null>(null)
  const [fetching, setFetching]       = useState(false)
  const [running, setRunning]         = useState(false)
  const [stopping, setStopping]       = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [, setTick]                   = useState(0)
  const [selectedSensors, setSelectedSensors] = useState<Set<string>>(new Set())
  const lastFetchedAtRef              = useRef<string | null>(null)

  const toggleSensorSelect = useCallback((sensor: string) => {
    setSelectedSensors(prev => {
      const next = new Set(prev)
      if (next.has(sensor)) next.delete(sensor)
      else next.add(sensor)
      return next
    })
  }, [])

  // All enabled sensor keys (flattened from SECTION_SENSORS, excluding disabled)
  const allEnabledSensors = useMemo(() => {
    return SECTION_SENSORS.flatMap(s => s.sensors).filter(
      name => config?.sensors_enabled[name] !== false,
    )
  }, [config])

  // Failed sensor keys from last pipeline run
  const failedSensors = useMemo(() => {
    if (!pipelineStatus) return []
    return pipelineStatus.sensors
      .filter(s => s.fetch === 'failed' || s.summary === 'failed')
      .map(s => s.name)
  }, [pipelineStatus])

  const selectAll = useCallback(() => setSelectedSensors(new Set(allEnabledSensors)), [allEnabledSensors])
  const selectNone = useCallback(() => setSelectedSensors(new Set()), [])
  const selectFailed = useCallback(() => setSelectedSensors(new Set(failedSensors)), [failedSensors])

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
        // Clear local running flag when the pipeline has actually stopped
        if (!s.running) {
          setRunning(false)
          setStopping(false)
        }
      }).catch(() => {})
    }
    check()
    const iv = setInterval(check, 3_000)
    return () => clearInterval(iv)
  }, [])

  const handleRun = async (mode: RunMode, sensors?: string[]) => {
    setFetching(true)
    try {
      await api.triggerFetch(mode, sensors)
      setRunning(true)
      setSelectedSensors(new Set())
      const labels = { fetch: 'Fetch', summarize: 'Summarize', fetch_summarize: 'Fetch + Summarize' }
      const suffix = sensors?.length ? ` (${sensors.length} sensor${sensors.length > 1 ? 's' : ''})` : ''
      showToast(`${labels[mode]}${suffix} triggered — results will appear shortly`)
    } catch (e) {
      showToast('Trigger failed: ' + (e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  const handleStop = async () => {
    setStopping(true)
    try {
      await api.stopPipeline()
      showToast('Pipeline stop requested')
    } catch {
      showToast('Failed to stop pipeline')
      setStopping(false)
    }
  }

  // Detect stale processes (running in DB but no in-memory controller)
  const staleInfo = detectStale(null, pipelineStatus)

  const handleAbortStale = async () => {
    try {
      await api.stopPipeline()
    } catch {
      // 404 = already cleared
    }
    api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
  }

  const handleResumeStale = async () => {
    await handleAbortStale()
    // If fetch was complete, only re-run summaries; otherwise full run
    const mode = staleInfo?.fetchComplete ? 'summarize' as const : (pipelineStatus?.mode ?? 'fetch_summarize')
    await handleRun(mode)
    // Poll immediately so progress appears without waiting for the 3s interval
    api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
  }

  const handleRestartStale = async () => {
    await handleAbortStale()
    await handleRun(pipelineStatus?.mode ?? 'fetch_summarize')
    api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
  }

  // Pipeline is running when both DB and the in-memory controller agree
  const isRunning = !!(pipelineStatus?.running && pipelineStatus.alive)

  // Build live-sensor lookup once (used across all sections when running)
  const liveSensors: Record<string, SensorJobProgress> = {}
  if (isRunning && pipelineStatus) {
    for (const sp of pipelineStatus.sensors) {
      liveSensors[sp.name] = sp
    }
  }

  // Pipeline phase — determines ActionBar label and progress tracking
  const phase: Phase = (() => {
    if (stopping) return 'stopping'
    if (!isRunning) return 'idle'
    if (!pipelineStatus) return 'fetching'
    if (pipelineStatus.overall_summary === 'running') return 'briefing'
    const anySummary = pipelineStatus.sensors.some(s => s.summary === 'running')
    if (anySummary) return 'summarizing'
    return 'fetching'
  })()

  // Progress counters — done/total for the current phase.
  // Skipped sensors are excluded so the bar starts at 0 (e.g. fetch-failed sensors
  // have summary='skipped' and shouldn't inflate the done count).
  const progress = (() => {
    if (!pipelineStatus) return { done: 0, total: 0 }
    const terminal = ['ok', 'failed', 'cancelled']
    if (phase === 'summarizing' || phase === 'briefing') {
      const active = pipelineStatus.sensors.filter(s => s.summary !== 'skipped')
      return { done: active.filter(s => terminal.includes(s.summary)).length, total: active.length }
    }
    const active = pipelineStatus.sensors.filter(s => s.fetch !== 'skipped')
    return { done: active.filter(s => terminal.includes(s.fetch)).length, total: active.length }
  })()

  // Detail string for the currently-active sensor (shown in ActionBar subtitle)
  const phaseDetail = (() => {
    if (!pipelineStatus) return undefined
    if (phase === 'fetching') {
      const running = pipelineStatus.sensors.find(s => s.fetch === 'running')
      if (running?.fetch_detail) return running.fetch_detail
      if (running) return SENSOR_LABEL_MAP[running.name] ?? running.name
    }
    if (phase === 'summarizing') {
      const running = pipelineStatus.sensors.find(s => s.summary === 'running')
      if (!running) return undefined
      const label = SENSOR_LABEL_MAP[running.name] ?? running.name
      if (running.summary_chunks_total > 0) {
        return `${label} (${running.summary_chunks_done}/${running.summary_chunks_total} chunks)`
      }
      return label
    }
    return undefined
  })()

  return (
    <section id="status" style={{ padding: '4.5rem 0' }}>
      {staleInfo && !isRunning && (
        <StaleProcessBanner
          stale={staleInfo}
          onAbort={handleAbortStale}
          onResume={handleResumeStale}
          onRestart={handleRestartStale}
        />
      )}

      <ActionBar
        health={health}
        isRunning={isRunning}
        phase={phase}
        progress={progress}
        detail={phaseDetail}
        fetching={fetching}
        isStopping={stopping}
        onRun={(mode) => {
          const sensors = selectedSensors.size > 0 ? Array.from(selectedSensors) : undefined
          handleRun(mode, sensors)
        }}
        onStop={handleStop}
        failures={pipelineStatus ? {
          fetch: pipelineStatus.sensors.filter(s => s.fetch === 'failed').length,
          summary: pipelineStatus.sensors.filter(s => s.summary === 'failed').length,
        } : undefined}
        selectedCount={selectedSensors.size}
        onSelectAll={selectAll}
        onSelectNone={selectNone}
        onSelectFailed={failedSensors.length > 0 ? selectFailed : undefined}
        failedCount={failedSensors.length}
      />

      <SensorTable
        isRunning={isRunning}
        liveSensors={liveSensors}
        report={report}
        config={config}
        pipelineStatus={pipelineStatus}
        selected={selectedSensors}
        onToggleSelect={toggleSensorSelect}
      />

      <ScheduleFooter config={config} />
    </section>
  )
}
