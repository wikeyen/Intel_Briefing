// ABOUTME: Sensor list — Zone 2 of the mission control Status page.
// ABOUTME: Flat list of SensorRow components, ordered by category (same-category sensors adjacent).
'use client'

import { useMemo } from 'react'
import type { IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress } from '@/api/client'
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
  selected: Set<string>
  onToggleSelect: (sensor: string) => void
  onSelectAll: () => void
  onSelectNone: () => void
  onRetry?: (sensor: string) => void
  onSkipSensor?: (sensor: string) => void
  dismissed: Set<string>
  onDismiss: (sensor: string) => void
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
  retryAttempt, selected, onToggleSelect, onSelectAll, onSelectNone,
  onRetry, onSkipSensor, dismissed, onDismiss,
}: SensorGridProps) {
  const sensorCounts = useMemo(() => countItemsBySensor(report), [report])

  /* Flat list of all sensors, ordered by category (SECTION_SENSORS preserves grouping) */
  const allSensors = useMemo(() => {
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
          summaryError: lastSp?.summary_error ?? undefined,
          itemCount: count,
          lastFetchAgo: report?.fetched_at ? timeAgo(report.fetched_at) : undefined,
        }
      }),
    )
  }, [report, config, pipelineStatus, sensorCounts])

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
        background: 'var(--surface)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>
        {/* Toolbar + column labels */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid var(--border-soft)',
        }}>
          {showToolbar && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button type="button" onClick={onSelectAll} style={toolbarLinkStyle}>Select all</button>
              <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>/</span>
              <button type="button" onClick={onSelectNone} style={toolbarLinkStyle}>None</button>
              {selectedCount > 0 && (
                <span style={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: '0.6875rem',
                  color: 'var(--accent)',
                  fontWeight: 600,
                  marginLeft: '0.25rem',
                }}>
                  {selectedCount} selected
                </span>
              )}
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '1.5rem' }}>
            <span style={headerLabelStyle}>Items</span>
            <span style={headerLabelStyle}>Last Fetch</span>
          </div>
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
              isOk={sensor.isOk}
              isFailed={sensor.isFailed}
              isDisabled={sensor.isDisabled}
              isConfigError={sensor.isConfigError}
              isApiError={sensor.isApiError}
              fetchError={sensor.fetchError ?? live?.fetch_error ?? undefined}
              summaryError={sensor.summaryError ?? live?.summary_error ?? undefined}
              isSelected={selected.has(sensor.sensorKey)}
              isRetrying={liveRetrying}
              onToggleSelect={() => onToggleSelect(sensor.sensorKey)}
              onRetry={(sensor.isFailed || liveFailed) && onRetry ? () => onRetry(sensor.sensorKey) : undefined}
              onSkip={isPaused && onSkipSensor ? () => onSkipSensor(sensor.sensorKey) : undefined}
              onDismiss={sensor.isFailed && !isPaused ? () => onDismiss(sensor.sensorKey) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
