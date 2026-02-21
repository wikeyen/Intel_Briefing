// ABOUTME: Flat single-column sensor list grouped by section — the main content area of the Status page (Zone 2).
// ABOUTME: Replaces SensorGrid + Console: shows per-sensor status, item counts, and inline errors.
'use client'

import { useState, useMemo } from 'react'
import type { IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress } from '@/api/client'
import { SECTION_SENSORS, SENSOR_LABEL_MAP } from './constants'

export interface SensorTableProps {
  isRunning: boolean
  liveSensors: Record<string, SensorJobProgress>
  report: IntelReport | null
  config: ConfigSettings | null
  pipelineStatus: PipelineStatus | null
}

/* ------------------------------------------------------------------ */
/* Style tokens                                                        */
/* ------------------------------------------------------------------ */

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
}

const sensorRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.375rem 1rem 0.375rem 1.5rem',
  fontSize: '0.8125rem',
  cursor: 'default',
}

const dotStyle = (color: string, pulse: boolean): React.CSSProperties => ({
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
  animation: pulse ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
})

const countStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: '0.8125rem',
  textAlign: 'right',
}

const detailStyle: React.CSSProperties = {
  padding: '0.25rem 1rem 0.5rem 2.5rem',
  fontSize: '0.75rem',
  color: 'var(--ink-faint)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.125rem',
}

/* ------------------------------------------------------------------ */
/* Helper: count items per sensor from a report                        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Helper: stage state to display character                            */
/* ------------------------------------------------------------------ */

function stageIcon(state: string): string {
  switch (state) {
    case 'ok': return '\u25cf' // ● filled
    case 'running': return '\u25c9' // ◉ fisheye
    case 'failed': return '\u2716' // ✖ heavy x
    case 'skipped': return '\u2013' // – en dash
    default: return '\u25cb' // ○ empty
  }
}

function stageColor(state: string): string {
  switch (state) {
    case 'ok': return 'var(--ok)'
    case 'running': return 'var(--accent)'
    case 'failed': return 'var(--err)'
    default: return 'var(--ink-faint)'
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function SensorTable({ isRunning, liveSensors, report, config, pipelineStatus }: SensorTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const sensorCounts = useMemo(() => countItemsBySensor(report), [report])

  function toggleExpanded(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Compute total items across all sections
  const totalItems = useMemo(() => {
    if (isRunning) {
      return Object.values(liveSensors).reduce(
        (sum, sp) => sum + (sp.fetch === 'ok' ? sp.item_count : 0),
        0,
      )
    }
    if (!report) return 0
    return Object.values(report.items).reduce((sum, items) => sum + items.length, 0)
  }, [isRunning, liveSensors, report])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {SECTION_SENSORS.map((section) => {
        // Compute section total
        const sectionTotal = isRunning
          ? section.sensors.reduce((sum, sk) => {
              const sp = liveSensors[sk]
              return sum + (sp?.fetch === 'ok' ? sp.item_count : 0)
            }, 0)
          : section.key === 'social'
            ? (report?.items['social']?.length ?? 0)
            : section.sensors.reduce((sum, sk) => sum + (sensorCounts[sk] ?? 0), 0)

        return (
          <div
            key={section.key}
            data-testid={`section-${section.key}`}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.625rem 0',
            }}
          >
            {/* Section header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 1rem 0.375rem 1rem',
            }}>
              <span style={sectionHeaderStyle}>{section.label.toUpperCase()}</span>
              <span
                data-testid="section-count"
                style={{
                  ...countStyle,
                  fontSize: '0.625rem',
                  color: sectionTotal > 0 ? 'var(--ink)' : 'var(--ink-faint)',
                }}
              >
                {report || isRunning ? String(sectionTotal) : '\u2014'}
              </span>
            </div>

            {/* Sensor rows */}
            {section.sensors.map((sensorKey) => {
              const label = SENSOR_LABEL_MAP[sensorKey] ?? sensorKey
              const isExpanded = expanded.has(sensorKey)

              // ---- Running state ----
              if (isRunning) {
                const sp = liveSensors[sensorKey]
                return (
                  <div key={sensorKey}>
                    <div
                      data-testid={`sensor-row-${sensorKey}`}
                      style={{
                        ...sensorRowStyle,
                        cursor: sp ? 'pointer' : 'default',
                      }}
                      onClick={() => sp && toggleExpanded(sensorKey)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={dotStyle(
                          runningDotColor(sp),
                          sp?.fetch === 'running',
                        )} />
                        <span style={{ color: sp ? 'var(--ink)' : 'var(--ink-faint)' }}>
                          {label}
                        </span>
                      </div>
                      <span style={{
                        ...countStyle,
                        color: runningRightColor(sp),
                      }}>
                        {runningRightText(sp)}
                      </span>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && sp && (
                      <div data-testid={`sensor-detail-${sensorKey}`} style={detailStyle}>
                        <span>
                          <span style={{ color: stageColor(sp.fetch) }}>{stageIcon(sp.fetch)}</span>
                          {' '}Fetch: {stageLabel(sp.fetch)}
                          {sp.fetch_detail && (
                            <span style={{ color: 'var(--ink-muted)', marginLeft: '0.375rem' }}>
                              — {sp.fetch_detail}
                            </span>
                          )}
                          {sp.fetch === 'ok' && sp.item_count > 0 && (
                            <span style={{ color: 'var(--ok)', marginLeft: '0.375rem' }}>
                              — {sp.item_count} items
                            </span>
                          )}
                        </span>
                        <span>
                          <span style={{ color: stageColor(sp.summary) }}>{stageIcon(sp.summary)}</span>
                          {' '}Summary: {stageLabel(sp.summary)}
                          {sp.summary === 'running' && sp.summary_chunks_total > 0 && (
                            <span style={{ color: 'var(--accent)', marginLeft: '0.375rem' }}>
                              — chunk {sp.summary_chunks_done}/{sp.summary_chunks_total}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )
              }

              // ---- Idle state ----
              const isDisabled = config?.sensors_enabled[sensorKey] === false
              const isFailed = report?.sources_failed.includes(sensorKey) ?? false
              const isOk = !isDisabled && (report?.sources_ok.includes(sensorKey) ?? false)

              // Get count — for social sensors, items use source='x'/'bluesky'/'mastodon'
              // but sensorCounts already counts by item.source, so social sensors will have 0
              // in sensorCounts. The section total for social uses report.items['social'].length.
              // Individual social sensor counts are not split — they share the section total.
              const count = sensorCounts[sensorKey] ?? 0

              // Derive error info from pipelineStatus
              const lastSp = pipelineStatus?.sensors.find(s => s.name === sensorKey)
              const isConfigErr = isFailed && lastSp?.fetch_error_kind === 'config'
              const isApiErr = isFailed && lastSp?.fetch_error_kind === 'api'

              const idleDotColor = isDisabled ? 'var(--border)'
                : isConfigErr ? 'var(--warn)'
                : isApiErr ? 'var(--err)'
                : (isOk && count === 0) ? 'var(--warn)'
                : isOk ? 'var(--ok)'
                : isFailed ? 'var(--err)'
                : 'var(--border)'

              let rightText: string
              let rightColor: string

              if (isDisabled) {
                rightText = 'Off'
                rightColor = 'var(--ink-faint)'
              } else if (isConfigErr) {
                // Error text is shown inline next to the sensor name, so the
                // right-aligned slot shows a dash to avoid duplication.
                rightText = '\u2014'
                rightColor = 'var(--ink-faint)'
              } else if (isApiErr) {
                rightText = '\u2014'
                rightColor = 'var(--ink-faint)'
              } else if (isOk) {
                rightText = String(count)
                rightColor = count > 0 ? 'var(--accent)' : 'var(--warn)'
              } else if (isFailed) {
                rightText = 'Failed'
                rightColor = 'var(--err)'
              } else if (report) {
                rightText = '\u2014'
                rightColor = 'var(--ink-faint)'
              } else {
                rightText = '\u2014'
                rightColor = 'var(--ink-faint)'
              }

              const hasDetail = !isDisabled && (isFailed || isOk || lastSp)

              return (
                <div key={sensorKey}>
                  <div
                    data-testid={`sensor-row-${sensorKey}`}
                    style={{
                      ...sensorRowStyle,
                      cursor: hasDetail ? 'pointer' : 'default',
                    }}
                    onClick={() => hasDetail && toggleExpanded(sensorKey)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={dotStyle(idleDotColor, false)} />
                      <span style={{
                        color: isDisabled ? 'var(--ink-faint)' : 'var(--ink)',
                      }}>
                        {label}
                      </span>
                      {isFailed && (
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.5625rem',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          padding: '0.0625rem 0.375rem',
                          borderRadius: 3,
                          color: isConfigErr ? 'var(--warn)' : 'var(--err)',
                          background: isConfigErr ? 'var(--warn-bg)' : 'var(--err-bg)',
                          border: `1px solid ${isConfigErr ? 'var(--warn)' : 'var(--err)'}`,
                          opacity: 0.85,
                          marginLeft: '0.25rem',
                        }}>
                          {isConfigErr ? 'config' : 'error'}
                        </span>
                      )}
                    </div>
                    <span style={{
                      ...countStyle,
                      color: rightColor,
                      fontWeight: isOk && count > 0 ? 600 : 400,
                    }}>
                      {rightText}
                    </span>
                  </div>

                  {/* Expanded detail (idle state) */}
                  {isExpanded && hasDetail && (
                    <div data-testid={`sensor-detail-${sensorKey}`} style={detailStyle}>
                      {lastSp && (
                        <>
                          <span>
                            <span style={{ color: stageColor(lastSp.fetch) }}>{stageIcon(lastSp.fetch)}</span>
                            {' '}Fetch: {stageLabel(lastSp.fetch)}
                            {lastSp.fetch === 'ok' && lastSp.item_count > 0 && (
                              <span style={{ color: 'var(--ok)', marginLeft: '0.375rem' }}>
                                — {lastSp.item_count} items
                              </span>
                            )}
                            {lastSp.fetch_detail && (
                              <span style={{ color: 'var(--ink-muted)', marginLeft: '0.375rem' }}>
                                — {lastSp.fetch_detail}
                              </span>
                            )}
                          </span>
                          {lastSp.fetch_error && (
                            <span style={{
                              color: lastSp.fetch_error_kind === 'config' ? 'var(--warn)' : 'var(--err)',
                              fontFamily: 'ui-monospace, monospace',
                              fontSize: '0.6875rem',
                              lineHeight: 1.5,
                              wordBreak: 'break-word',
                              paddingLeft: '1rem',
                            }}>
                              {lastSp.fetch_error}
                            </span>
                          )}
                          <span>
                            <span style={{ color: stageColor(lastSp.summary) }}>{stageIcon(lastSp.summary)}</span>
                            {' '}Summary: {stageLabel(lastSp.summary)}
                          </span>
                          {lastSp.summary_error && (
                            <span style={{
                              color: 'var(--err)',
                              fontFamily: 'ui-monospace, monospace',
                              fontSize: '0.6875rem',
                              lineHeight: 1.5,
                              wordBreak: 'break-word',
                              paddingLeft: '1rem',
                            }}>
                              {lastSp.summary_error}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Total items footer */}
      <div
        data-testid="sensor-table-total"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '0.5rem 1rem 0',
          borderTop: '1px solid var(--border)',
          gap: '0.5rem',
        }}
      >
        <span style={{
          fontSize: '0.6875rem',
          color: 'var(--ink-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          Total
        </span>
        <span style={{
          ...countStyle,
          fontWeight: 600,
          color: totalItems > 0 ? 'var(--ink)' : 'var(--ink-faint)',
        }}>
          {report || isRunning ? String(totalItems) : '\u2014'}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers for running-state display                                    */
/* ------------------------------------------------------------------ */

function runningDotColor(sp: SensorJobProgress | undefined): string {
  if (!sp) return 'var(--border)'
  if (sp.fetch === 'running') return 'var(--accent)'
  if (sp.fetch === 'ok' && sp.summary === 'ok') return 'var(--ok)'
  if (sp.fetch === 'ok') return 'var(--ok)'
  if (sp.fetch === 'failed') {
    return sp.fetch_error_kind === 'config' ? 'var(--warn)' : 'var(--err)'
  }
  return 'var(--border)'
}

function runningRightText(sp: SensorJobProgress | undefined): string {
  if (!sp) return '\u2014'
  if (sp.fetch === 'running') return sp.fetch_detail ?? 'Fetching\u2026'
  if (sp.fetch === 'ok' && sp.summary === 'running') {
    if (sp.summary_chunks_total > 0) return `Summarizing ${sp.summary_chunks_done}/${sp.summary_chunks_total}`
    return 'Summarizing\u2026'
  }
  if (sp.fetch === 'ok' && sp.summary === 'ok') return String(sp.item_count)
  if (sp.fetch === 'ok') return String(sp.item_count)
  if (sp.fetch === 'failed') return 'Failed'
  return '\u2014'
}

function runningRightColor(sp: SensorJobProgress | undefined): string {
  if (!sp) return 'var(--ink-faint)'
  if (sp.fetch === 'running' || sp.summary === 'running') return 'var(--accent)'
  if (sp.fetch === 'ok' && sp.item_count > 0) return 'var(--accent)'
  if (sp.fetch === 'failed') return 'var(--err)'
  return 'var(--ink-faint)'
}

function stageLabel(state: string): string {
  switch (state) {
    case 'ok': return 'Done'
    case 'running': return 'Running'
    case 'failed': return 'Failed'
    case 'skipped': return 'Skipped'
    default: return 'Queued'
  }
}
