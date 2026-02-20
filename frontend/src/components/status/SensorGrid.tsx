// ABOUTME: Two-column grid of section cards showing per-sensor pipeline status.
// ABOUTME: Displays live progress when running and idle state from last report when stopped.
import type { IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress } from '@/api/client'
import { StageBadge } from './StageBadge'
import { SECTION_SENSORS, SENSOR_LABEL_MAP } from './constants'

export interface SensorGridProps {
  isRunning: boolean
  liveSensors: Record<string, SensorJobProgress>
  report: IntelReport | null
  config: ConfigSettings | null
  pipelineStatus: PipelineStatus | null
  sensorCounts: Record<string, number>
}

export function SensorGrid({ isRunning, liveSensors, report, config, pipelineStatus, sensorCounts }: SensorGridProps) {
  return (
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
                  ? (sectionTotal > 0 ? String(sectionTotal) : '\u2014')
                  : (report ? String(sectionTotal) : '\u2026')}
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
                : report       ? '\u2014' : '\u2026'

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
  )
}
