// ABOUTME: Mission control Status page — fixed-viewport command center with real-time telemetry.
// ABOUTME: Orchestrates ControlBar (top) and SensorGrid (scrollable body).
'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { api } from '@/api/client'
import type { HealthResponse, IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress, RunMode } from '@/api/client'
import { useToast } from '@/lib/toast-context'
import { ControlBar, CONTROL_BAR_CSS } from './status/ControlBar'
import type { Phase } from './status/ControlBar'
import { SensorGrid } from './status/SensorGrid'
import { SECTION_SENSORS } from './status/constants'
import { StaleProcessBanner, detectStale } from './StaleProcessBanner'
import { StatusSkeleton } from './Skeleton'
import { PhaseStepper } from './status/PhaseStepper'
import { ActivityLogDrawer } from './status/ActivityLog'

export function Status() {
  const showToast = useToast()
  const [health, setHealth]           = useState<HealthResponse | null>(null)
  const [report, setReport]           = useState<IntelReport | null>(null)
  const [config, setConfig]           = useState<ConfigSettings | null>(null)
  const [fetching, setFetching]       = useState(false)
  const [running, setRunning]         = useState(false)
  const [stopping, setStopping]       = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [pipelineChecked, setPipelineChecked] = useState(false)
  const [tick, setTick]               = useState(0)
  const [selectedSensors, setSelectedSensors] = useState<Set<string>>(new Set())
  const [dismissed, setDismissed]     = useState<Set<string>>(new Set())
  const [logDrawerOpen, setLogDrawerOpen] = useState(false)
  const lastFetchedAtRef              = useRef<string | null>(null)
  const triggerTimeRef                = useRef(0)

  const toggleSensorSelect = useCallback((sensor: string) => {
    setSelectedSensors(prev => {
      const next = new Set(prev)
      if (next.has(sensor)) next.delete(sensor)
      else next.add(sensor)
      return next
    })
  }, [])

  const allEnabledSensors = useMemo(() => {
    return SECTION_SENSORS.flatMap(s => s.sensors).filter(
      name => config?.sensors_enabled[name] !== false,
    )
  }, [config])

  const failedSensors = useMemo(() => {
    if (!report) return []
    return report.sources_failed
  }, [report])

  const selectAll = useCallback(() => setSelectedSensors(new Set(allEnabledSensors)), [allEnabledSensors])
  const selectNone = useCallback(() => setSelectedSensors(new Set()), [])
  const selectFailed = useCallback(() => setSelectedSensors(new Set(failedSensors)), [failedSensors])

  const dismissSensor = useCallback((sensor: string) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(sensor)
      return next
    })
  }, [])

  const loadAll = () => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'error', last_fetch: null }))
    api.getLatest().then(setReport).catch(() => {})
    api.getConfig().then(setConfig).catch(() => {})
    api.getPipelineStatus().then(s => {
      setPipelineStatus(s)
      setPipelineChecked(true)
    }).catch(() => { setPipelineChecked(true) })
  }

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1_000)
    return () => clearInterval(iv)
  }, [])

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

  const isRunningOrTriggered = running || !!(pipelineStatus?.running && pipelineStatus.alive)
  useEffect(() => {
    const check = () => {
      api.getPipelineStatus().then(s => {
        setPipelineStatus(s)
        setPipelineChecked(true)
        if (!s.running) {
          const sinceTrigger = Date.now() - triggerTimeRef.current
          if (sinceTrigger > 5_000) {
            setRunning(false)
          }
          setStopping(false)
        }
      }).catch(() => {})
    }
    const interval = isRunningOrTriggered ? 3_000 : 15_000
    const iv = setInterval(check, interval)
    return () => { clearInterval(iv) }
  }, [isRunningOrTriggered])

  const handleRun = async (mode: RunMode, sensors?: string[]) => {
    setFetching(true)
    try {
      await api.triggerFetch(mode, sensors)
      triggerTimeRef.current = Date.now()
      setRunning(true)
      setSelectedSensors(new Set())
      setDismissed(new Set())
      const labels = { fetch: 'Fetch', summarize: 'Summarize', fetch_summarize: 'Fetch + Summarize' }
      const suffix = sensors?.length ? ` (${sensors.length} sensor${sensors.length > 1 ? 's' : ''})` : ''
      showToast(`${labels[mode]}${suffix} triggered`)
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

  const handleSkipRetries = async () => {
    try {
      await api.resumePipeline('proceed')
      api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    }
  }

  const handleRetrySensor = async (sensor: string) => {
    if (isPaused) {
      // During pause: retry within the running pipeline
      try {
        await api.resumePipeline('retry_sensor', [sensor])
        showToast(`Retrying ${sensor}`)
      } catch (e) {
        showToast('Retry failed: ' + (e as Error).message)
      }
    } else {
      // Not paused: start a new pipeline for this sensor
      const mode: RunMode = 'fetch_summarize'
      await handleRun(mode, [sensor])
    }
  }

  // Auto-retry state (hooks placed after isRunning is derived, below)
  const AUTO_RETRY_DELAYS = [5_000, 8_000, 13_000]
  const autoRetryRef = useRef<Record<string, { count: number; timer?: ReturnType<typeof setTimeout> }>>({})
  const [autoRetryExhausted, setAutoRetryExhausted] = useState<Set<string>>(new Set())
  const [autoRetryDeadlines, setAutoRetryDeadlines] = useState<Record<string, number>>({})

  const handleSkipSensor = async (sensor: string) => {
    try {
      await api.resumePipeline('skip_sensor', [sensor])
      showToast(`Skipped ${sensor}`)
    } catch (e) {
      showToast('Skip failed: ' + (e as Error).message)
    }
  }

  const handleSkipFetchingSensor = async (sensor: string) => {
    try {
      await api.resumePipeline('skip_fetching_sensor', [sensor])
      showToast(`Skipped ${sensor}`)
    } catch (e) {
      showToast('Skip failed: ' + (e as Error).message)
    }
  }

  const handleGenerateOverall = async () => {
    try {
      await api.resumePipeline('generate_overall')
      showToast('Generating summary')
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    }
  }

  const handleRetryFailed = async () => {
    if (!report || report.sources_failed.length === 0) return
    const failed = report.sources_failed
    // Incremental: only re-fetch failed sensors if data is fresh (within cache TTL).
    // Otherwise do a full run since cached data is too old to merge with.
    const isFresh = health?.status === 'ok'
    if (isFresh) {
      await handleRun('fetch_summarize', failed)
    } else {
      await handleRun('fetch_summarize')
    }
  }

  const staleInfo = detectStale(null, pipelineStatus)

  const handleAbortStale = async () => {
    try { await api.stopPipeline() } catch { /* 404 = already cleared */ }
    try { const s = await api.getPipelineStatus(); setPipelineStatus(s) } catch { /* ignore */ }
  }

  const handleResumeStale = async () => {
    await handleAbortStale()
    const mode = staleInfo?.fetchComplete ? 'summarize' as const : (pipelineStatus?.mode ?? 'fetch_summarize')
    await handleRun(mode)
    api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
  }

  const handleRestartStale = async () => {
    await handleAbortStale()
    await handleRun(pipelineStatus?.mode ?? 'fetch_summarize')
    api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
  }

  const isRunning = running || !!(pipelineStatus?.running && pipelineStatus.alive)
  const isPaused = !!(pipelineStatus?.paused && isRunning)
  const hasEvents = !!(pipelineStatus?.events && pipelineStatus.events.length > 0)

  // ---------------------------------------------------------------------------
  // Auto-retry: retry failed sensors 3 times (5s/8s/13s) before showing button
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isRunning) {
      for (const entry of Object.values(autoRetryRef.current)) {
        if (entry.timer) clearTimeout(entry.timer)
      }
      autoRetryRef.current = {}
      setAutoRetryExhausted(new Set())
      setAutoRetryDeadlines({})
    }
  }, [isRunning])

  useEffect(() => {
    if (isRunning || !report) return
    for (const sensor of report.sources_failed) {
      if (dismissed.has(sensor)) continue
      if (autoRetryExhausted.has(sensor)) continue
      const entry = autoRetryRef.current[sensor] ?? { count: 0 }
      if (entry.count >= AUTO_RETRY_DELAYS.length) {
        setAutoRetryExhausted(prev => new Set(prev).add(sensor))
        continue
      }
      if (entry.timer) continue
      const delay = AUTO_RETRY_DELAYS[entry.count]
      setAutoRetryDeadlines(prev => ({ ...prev, [sensor]: Date.now() + delay }))
      entry.timer = setTimeout(async () => {
        entry.count++
        entry.timer = undefined
        autoRetryRef.current[sensor] = entry
        setAutoRetryDeadlines(prev => { const next = { ...prev }; delete next[sensor]; return next })
        try {
          await api.triggerFetch('fetch_summarize', [sensor])
          triggerTimeRef.current = Date.now()
          setRunning(true)
        } catch {
          setAutoRetryExhausted(prev => new Set(prev).add(sensor))
        }
      }, delay)
      autoRetryRef.current[sensor] = entry
    }
  }, [isRunning, report, dismissed, autoRetryExhausted])

  const liveSensors: Record<string, SensorJobProgress> = {}
  if (isRunning && pipelineStatus) {
    for (const sp of pipelineStatus.sensors) {
      liveSensors[sp.name] = sp
    }
  }

  const phase: Phase = (() => {
    if (stopping) return 'stopping'
    if (!isRunning) return 'idle'
    if (!pipelineStatus) return 'fetching'
    if (isPaused) return 'paused'
    // Check phases in reverse pipeline order so the latest active phase wins
    const intelEvents = (pipelineStatus.events ?? []).filter(e => e.phase === 'intelligence')
    if (intelEvents.some(e => e.level === 'info') && !intelEvents.some(e => e.level === 'ok' || e.level === 'error' || e.level === 'warn')) return 'intelligence'
    if (pipelineStatus.overall_summary === 'running') return 'briefing'
    const anySummary = pipelineStatus.sensors.some(s => s.summary === 'running')
    if (anySummary) return 'summarizing'
    return 'fetching'
  })()

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

  const phaseDetail = (() => {
    if (!pipelineStatus) return undefined
    if (phase === 'fetching') {
      const r = pipelineStatus.sensors.find(s => s.fetch === 'running')
      if (r?.fetch_detail) return r.fetch_detail
      if (r) return r.name
    }
    if (phase === 'summarizing') {
      const r = pipelineStatus.sensors.find(s => s.summary === 'running')
      if (!r) return undefined
      if (r.summary_chunks_total > 0) return `${r.name} (${r.summary_chunks_done}/${r.summary_chunks_total})`
      return r.name
    }
    return undefined
  })()

  const failedCount = pipelineStatus
    ? pipelineStatus.sensors.filter(s => s.fetch === 'failed' || s.summary === 'failed').length
    : 0

  const retryingCount = pipelineStatus && pipelineStatus.retry_attempt > 0
    ? pipelineStatus.sensors.filter(s => s.fetch === 'running' || s.fetch === 'queued').length
    : 0

  const totalItems = useMemo(() => {
    if (!report) return 0
    return Object.values(report.items).reduce((sum, items) => sum + items.length, 0)
  }, [report])

  const sourcesOk = report?.sources_ok.length ?? 0

  if (!health && !report && !pipelineChecked) {
    return (
      <section id="status" className="status-page">
        <StatusSkeleton />
      </section>
    )
  }

  return (
    <section id="status" className="status-page" style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100%',
    }}>
      <style dangerouslySetInnerHTML={{ __html: CONTROL_BAR_CSS }} />

      {staleInfo && !isRunning && (
        <div className="stale-banner-wrap" style={{ maxWidth: 1024, margin: '0 auto', width: '100%', padding: '0.75rem 3rem 0' }}>
          <StaleProcessBanner
            stale={staleInfo}
            onAbort={handleAbortStale}
            onResume={handleResumeStale}
            onRestart={handleRestartStale}
          />
        </div>
      )}

      {/* Sticky header: ControlBar + PhaseStepper */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'var(--canvas)',
        borderBottom: '1px solid var(--border)',
      }}>
        <ControlBar
          health={health}
          config={config}
          sourcesOk={sourcesOk}
          sourcesTotal={allEnabledSensors.length}
          totalItems={totalItems}
          isRunning={isRunning}
          phase={phase}
          progress={progress}
          detail={phaseDetail}
          failedCount={failedCount}
          retryingCount={retryingCount}
          isPaused={isPaused}
          selectedCount={selectedSensors.size}
          totalSensors={allEnabledSensors.length}
          hasFailedSensors={failedSensors.length > 0}
          failedSensorCount={failedSensors.length}
          onRun={(mode) => {
            const sensors = selectedSensors.size > 0 ? Array.from(selectedSensors) : undefined
            handleRun(mode, sensors)
          }}
          onStop={handleStop}
          onSkipRetries={handleSkipRetries}
          onGenerateOverall={handleGenerateOverall}
          onRetryFailed={handleRetryFailed}
          onSelectAll={selectAll}
          onSelectNone={selectNone}
          onSelectFailed={selectFailed}
          fetching={fetching}
          isStopping={stopping}
        />

        {pipelineStatus && (pipelineStatus.running || pipelineStatus.completed_at) && (
          <div className="phase-stepper-wrap" style={{ maxWidth: 1024, margin: '0 auto', width: '100%', padding: '0.5rem 3rem 0.25rem' }}>
            <PhaseStepper
              pipelineStatus={pipelineStatus}
              onLogToggle={hasEvents ? () => setLogDrawerOpen(o => !o) : undefined}
            />
          </div>
        )}
      </div>

      <SensorGrid
        isRunning={isRunning}
        isPaused={isPaused}
        liveSensors={liveSensors}
        report={report}
        config={config}
        pipelineStatus={pipelineStatus}
        retryAttempt={pipelineStatus?.retry_attempt ?? 0}
        selected={selectedSensors}
        onToggleSelect={toggleSensorSelect}
        onSelectAll={selectAll}
        onSelectNone={selectNone}
        onRetry={handleRetrySensor}
        onSkipSensor={handleSkipSensor}
        onSkipFetchingSensor={handleSkipFetchingSensor}
        tick={tick}
        dismissed={dismissed}
        onDismiss={dismissSensor}
        autoRetryExhausted={autoRetryExhausted}
        autoRetryDeadlines={autoRetryDeadlines}
      />

      {/* Slide-out activity log panel */}
      {hasEvents && (
        <ActivityLogDrawer
          events={pipelineStatus!.events}
          open={logDrawerOpen}
          onClose={() => setLogDrawerOpen(false)}
        />
      )}

    </section>
  )
}
