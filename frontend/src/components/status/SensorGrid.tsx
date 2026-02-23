// ABOUTME: Sensor card grid — Zone 2 of the mission control Status page.
// ABOUTME: Responsive CSS grid of SensorCard components, grouped by category.
'use client'

import { useMemo } from 'react'
import type { IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress } from '@/api/client'
import { SECTION_SENSORS, SENSOR_LABEL_MAP } from './constants'
import { SensorCard, CARD_CSS } from './SensorCard'
import { timeAgo } from './time-helpers'

export interface SensorGridProps {
  isRunning: boolean
  isPaused: boolean
  liveSensors: Record<string, SensorJobProgress>
  report: IntelReport | null
  config: ConfigSettings | null
  pipelineStatus: PipelineStatus | null
  selected: Set<string>
  onToggleSelect: (sensor: string) => void
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

export function SensorGrid({
  isRunning, isPaused, liveSensors, report, config, pipelineStatus,
  selected, onToggleSelect, onRetry, onSkipSensor, dismissed, onDismiss,
}: SensorGridProps) {
  const sensorCounts = useMemo(() => countItemsBySensor(report), [report])

  const sectionData = useMemo(() => {
    return SECTION_SENSORS.map(section => ({
      key: section.key,
      label: section.label,
      sensors: section.sensors.map(sensorKey => {
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
    }))
  }, [report, config, pipelineStatus, sensorCounts])

  return (
    <div className="sensor-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '0.75rem',
      flex: 1,
      alignContent: 'start',
      overflowY: 'auto',
      padding: '1rem 3rem',
      maxWidth: 1024,
      margin: '0 auto',
      width: '100%',
      paddingBottom: '1rem',
    }}>
      <style dangerouslySetInnerHTML={{ __html: CARD_CSS }} />
      {sectionData.map(section => {
        const visibleSensors = section.sensors.filter(s => !dismissed.has(s.sensorKey))
        if (visibleSensors.length === 0) return null
        return (
          <div key={section.key} className="sensor-grid-section" style={{ display: 'contents' }}>
            <div style={{
              gridColumn: '1 / -1',
              fontSize: '0.625rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              paddingTop: '0.25rem',
            }}>
              {section.label}
            </div>
            {visibleSensors.map(sensor => (
              <SensorCard
                key={sensor.sensorKey}
                sensorKey={sensor.sensorKey}
                label={sensor.label}
                category={sensor.category}
                isRunning={isRunning}
                isPaused={isPaused}
                liveSensor={liveSensors[sensor.sensorKey]}
                itemCount={sensor.itemCount}
                lastFetchAgo={sensor.lastFetchAgo}
                isOk={sensor.isOk}
                isFailed={sensor.isFailed}
                isDisabled={sensor.isDisabled}
                isConfigError={sensor.isConfigError}
                isApiError={sensor.isApiError}
                fetchError={sensor.fetchError}
                summaryError={sensor.summaryError}
                isSelected={selected.has(sensor.sensorKey)}
                onToggleSelect={() => onToggleSelect(sensor.sensorKey)}
                onRetry={sensor.isFailed && onRetry ? () => onRetry(sensor.sensorKey) : undefined}
                onSkip={isPaused && onSkipSensor ? () => onSkipSensor(sensor.sensorKey) : undefined}
                onDismiss={sensor.isFailed && !isPaused ? () => onDismiss(sensor.sensorKey) : undefined}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
