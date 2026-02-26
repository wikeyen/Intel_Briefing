// ABOUTME: Sensor list — Zone 2 of the mission control Status page.
// ABOUTME: Flat list of SensorRow components, ordered by category (same-category sensors adjacent).
'use client'

import { useMemo } from 'react'
import type { IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress } from '@/api/client'
import { useTranslation } from '@/lib/i18n'
import { SECTION_SENSORS, SENSOR_LABEL_MAP } from './constants'
import { SensorRow, CARD_CSS } from './SensorCard'
import { timeAgo } from './time-helpers'

export interface SensorGridProps {
  isRunning: boolean
  isPaused: boolean
  liveSensors: Record<string, SensorJobProgress>
  report: IntelReport | null
  config: ConfigSettings | null
  pipelineStatus: PipelineStatus | null
  retryAttempt: number
  retryMax?: number
  selected: Set<string>
  onToggleSelect: (sensor: string) => void
  onSelectAll: () => void
  onSelectNone: () => void
  onRetry?: (sensor: string) => void
  onSkipSensor?: (sensor: string) => void
  onSkipFetchingSensor?: (sensor: string) => void
  /** Tick counter — increments every second for elapsed-time calculations. */
  tick?: number
  dismissed: Set<string>
  onDismiss: (sensor: string) => void
  /** Sensors whose automatic retries are exhausted — show manual Retry button. */
  autoRetryExhausted?: Set<string>
  /** Deadline timestamps (ms) for pending auto-retry timers — used for countdown display. */
  autoRetryDeadlines?: Record<string, number>
  /** Cache TTL in hours — passed to sensor cards for stale detection. */
  cacheTtlHours?: number
}

function countItemsBySensor(report: IntelReport | null): Record<string, number> {
  if (!report) return {}
  const counts: Record<string, number> = {}
  for (const [, items] of Object.entries(report.items)) {
    for (const item of items) {
      counts[item.source] = (counts[item.source] ?? 0) + 1
    }
  }
  return counts
}

const headerLabelStyle: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
}

const toolbarLinkStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--ink-muted)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0.125rem 0',
}

export function SensorGrid({
  isRunning, isPaused, liveSensors, report, config, pipelineStatus,
  retryAttempt, retryMax, selected, onToggleSelect, onSelectAll, onSelectNone,
  onRetry, onSkipSensor, onSkipFetchingSensor, tick, dismissed, onDismiss, autoRetryExhausted, autoRetryDeadlines,
  cacheTtlHours,
}: SensorGridProps) {
  const { t } = useTranslation()
  const sensorCounts = useMemo(() => countItemsBySensor(report), [report])

  // Set of sensor names actively tracked in the current pipeline run
  const pipelineSensorSet = useMemo(() => {
    if (!pipelineStatus?.sensors) return new Set<string>()
    return new Set(pipelineStatus.sensors.map(s => s.name))
  }, [pipelineStatus])

  /* Flat list of all sensors, ordered by category (SECTION_SENSORS preserves grouping) */
  const allSensors = useMemo(() => {
    const perSensorTs = report?.sources_fetched_at ?? {}
    return SECTION_SENSORS.flatMap(section =>
      section.sensors.map(sensorKey => {
        const label = SENSOR_LABEL_MAP[sensorKey] ?? sensorKey
        const isDisabled = config?.sensors_enabled[sensorKey] === false
        const isFailed = report?.sources_failed.includes(sensorKey) ?? false
        const isOk = !isDisabled && (report?.sources_ok.includes(sensorKey) ?? false)
        const lastSp = pipelineStatus?.sensors.find(s => s.name === sensorKey)
        const isConfigErr = isFailed && lastSp?.fetch_error_kind === 'config'
        const isApiErr = isFailed && lastSp?.fetch_error_kind === 'api'
        const count = sensorCounts[sensorKey] ?? 0
        const sensorFetchedAt = perSensorTs[sensorKey]
        // Fresh = green by default. Only show orange (stale) when a pipeline
        // is actively running and this sensor is NOT part of the current run.
        const isStale = isRunning && !pipelineSensorSet.has(sensorKey)

        // Data staleness: sensor's last fetch is older than cache TTL
        const isDataStale = (() => {
          if (!sensorFetchedAt || !cacheTtlHours) return false
          const fetchedMs = new Date(sensorFetchedAt).getTime()
          if (isNaN(fetchedMs)) return false
          const ttlMs = cacheTtlHours * 60 * 60 * 1000
          return Date.now() - fetchedMs > ttlMs
        })()

        return {
          sensorKey,
          label,
          category: section.label,
          isDisabled,
          isFailed,
          isOk,
          isConfigError: isConfigErr,
          isApiError: isApiErr,
          fetchError: lastSp?.fetch_error ?? undefined,
          // NOTE: summaryError only available while pipelineStatus is populated (active
          // or recently-run pipeline). After a full page reload this will be undefined,
          // so warning-summary-fail won't trigger until the next pipeline run completes.
          summaryError: lastSp?.summary_error ?? undefined,
          itemCount: count,
          lastFetchAgo: sensorFetchedAt ? timeAgo(sensorFetchedAt) : (report?.fetched_at ? timeAgo(report.fetched_at) : undefined),
          isFreshFetch: !isStale,
          isDataStale,
          cacheTtlHours,
        }
      }),
    )
  }, [report, config, pipelineStatus, sensorCounts, isRunning, pipelineSensorSet, cacheTtlHours, tick])

  const visibleSensors = allSensors.filter(s => !dismissed.has(s.sensorKey))
  const selectedCount = selected.size
  const showToolbar = !isRunning

  return (
    <div className="sensor-grid" style={{
      maxWidth: 1024,
      margin: '0 auto',
      width: '100%',
      padding: '0.75rem 3rem 1.5rem',
    }}>
      <style dangerouslySetInnerHTML={{ __html: CARD_CSS }} />
      <div className="sensor-list" style={{
        display: 'grid',
        gridTemplateColumns: '6px 1fr minmax(0, 1fr) auto',
        gap: '0 0.5rem',
        padding: '0 1rem',
        background: 'var(--surface)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}>
        {/* Toolbar + column labels */}
        <div className="sensor-header" style={{
          gridColumn: '1 / -1',
          display: 'grid',
          gridTemplateColumns: 'subgrid',
          alignItems: 'center',
          margin: '0 -1rem',
          padding: '0.625rem 1rem',
          borderBottom: '1px solid var(--border-soft)',
          background: 'var(--surface-inset)',
        }}>
          <div className="sensor-toolbar" style={{ gridColumn: '1 / 3', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {showToolbar && (
              <>
                <button type="button" onClick={onSelectAll} style={toolbarLinkStyle}>{t('status.select_all')}</button>
                <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>/</span>
                <button type="button" onClick={onSelectNone} style={toolbarLinkStyle}>{t('status.select_none')}</button>
                {selectedCount > 0 && (
                  <span style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: '0.6875rem',
                    color: 'var(--accent)',
                    fontWeight: 600,
                    marginLeft: '0.25rem',
                  }}>
                    {t('status.n_selected', { count: String(selectedCount) })}
                  </span>
                )}
              </>
            )}
          </div>
          <span className="sensor-col-note" style={{ ...headerLabelStyle, textAlign: 'right' }}>{t('status.col_note')}</span>
          <span></span>
        </div>
        {visibleSensors.map(sensor => {
          const live = liveSensors[sensor.sensorKey]
          const liveFailed = live?.fetch === 'failed' || live?.summary === 'failed'
          const liveRetrying = retryAttempt > 0 && (live?.fetch === 'running' || live?.fetch === 'queued')
          return (
            <SensorRow
              key={sensor.sensorKey}
              sensorKey={sensor.sensorKey}
              label={sensor.label}
              category={sensor.category}
              isRunning={isRunning}
              isPaused={isPaused}
              liveSensor={live}
              itemCount={sensor.itemCount}
              lastFetchAgo={sensor.lastFetchAgo}
              isFreshFetch={sensor.isFreshFetch}
              isOk={sensor.isOk}
              isFailed={sensor.isFailed}
              isDisabled={sensor.isDisabled}
              isConfigError={sensor.isConfigError}
              isApiError={sensor.isApiError}
              fetchError={sensor.fetchError ?? live?.fetch_error ?? undefined}
              summaryError={sensor.summaryError ?? live?.summary_error ?? undefined}
              isDataStale={sensor.isDataStale}
              cacheTtlHours={sensor.cacheTtlHours}
              isSelected={selected.has(sensor.sensorKey)}
              isRetrying={liveRetrying}
              retryAttempt={retryAttempt}
              retryMax={retryMax}
              isSkipped={isRunning && !live && !sensor.isDisabled && !pipelineSensorSet.has(sensor.sensorKey)}
              tick={tick}
              onToggleSelect={() => onToggleSelect(sensor.sensorKey)}
              onRetry={(sensor.isFailed || liveFailed) && onRetry && (isPaused || autoRetryExhausted?.has(sensor.sensorKey)) ? () => onRetry(sensor.sensorKey) : undefined}
              onSkip={isPaused && onSkipSensor ? () => onSkipSensor(sensor.sensorKey) : undefined}
              onSkipFetching={isRunning && live?.fetch === 'running' && onSkipFetchingSensor ? () => onSkipFetchingSensor(sensor.sensorKey) : undefined}
              onDismiss={sensor.isFailed && !isPaused ? () => onDismiss(sensor.sensorKey) : undefined}
              autoRetryCountdown={autoRetryDeadlines?.[sensor.sensorKey] ? Math.max(0, Math.ceil((autoRetryDeadlines[sensor.sensorKey] - Date.now()) / 1000)) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
