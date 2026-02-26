// ABOUTME: Sensor list — Zone 2 of the mission control Status page.
// ABOUTME: Flat list of SensorRow components, ordered by category (same-category sensors adjacent).
'use client'

import React, { useMemo } from 'react'
import type { IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress, SubItemProgress } from '@/api/client'
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
      // Exclude topic-search items — they belong to the Topics section
      if (item.topic) continue
      counts[item.source] = (counts[item.source] ?? 0) + 1
    }
  }
  return counts
}

/** Sensors that contribute topic sub-items (keyword-level progress). */
const TOPIC_SENSORS = ['bluesky', 'mastodon'] as const

interface TopicKeywordEntry {
  keyword: string
  label: string
  platforms: Array<{ sensor: string; sensorLabel: string; sub: SubItemProgress }>
}

/**
 * Collect keyword-grouped topic progress from sensors that have sub_items.
 * Merges live (streaming) and pipeline-status (persisted) sub-item data,
 * preferring live when both exist for the same sensor.
 */
function collectTopicKeywords(
  liveSensors: Record<string, SensorJobProgress>,
  pipelineStatus: PipelineStatus | null,
  sensorLabelMap: Record<string, string>,
): TopicKeywordEntry[] {
  // keyword → sensor → SubItemProgress
  const keywordMap = new Map<string, Map<string, { sensorLabel: string; sub: SubItemProgress }>>()

  for (const sensorKey of TOPIC_SENSORS) {
    // Prefer live data; fall back to pipeline status
    const subs = liveSensors[sensorKey]?.sub_items
      ?? pipelineStatus?.sensors.find(s => s.name === sensorKey)?.sub_items
    if (!subs) continue

    const label = sensorLabelMap[sensorKey] ?? sensorKey
    for (const sub of subs) {
      if (!keywordMap.has(sub.key)) keywordMap.set(sub.key, new Map())
      keywordMap.get(sub.key)!.set(sensorKey, { sensorLabel: label, sub })
    }
  }

  // Sort keywords alphabetically, build flat array
  return Array.from(keywordMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([keyword, platformMap]) => ({
      keyword,
      // Use the label from the first platform (labels should be identical across platforms for same keyword)
      label: platformMap.values().next().value!.sub.label,
      platforms: Array.from(platformMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sensor, { sensorLabel, sub }]) => ({ sensor, sensorLabel, sub })),
    }))
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

  const topicKeywords = useMemo(
    () => collectTopicKeywords(liveSensors, pipelineStatus, SENSOR_LABEL_MAP),
    [liveSensors, pipelineStatus],
  )

  // Social sensors with no accounts configured — show a "no accounts" note
  const noAccountsSensors = useMemo(() => {
    if (!config) return new Set<string>()
    const result = new Set<string>()
    const disabled = new Set(config.social_accounts_disabled ?? [])
    const xAccounts = (config.social_accounts_x ?? []).filter(h => !disabled.has(h))
    if (xAccounts.length === 0) result.add('x')
    const bskyAccounts = config.social_accounts_bluesky.filter(h => !disabled.has(h))
    if (bskyAccounts.length === 0 && !config.social_following_bluesky) result.add('bluesky')
    const mastoAccounts = config.social_accounts_mastodon.filter(h => !disabled.has(h))
    if (mastoAccounts.length === 0 && !config.social_following_mastodon) result.add('mastodon')
    return result
  }, [config])

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
      {/* Safe: CARD_CSS is a hardcoded CSS string constant — no user/external input. */}
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
        {SECTION_SENSORS.map((section, sIdx) => {
          const isTopics = section.key === 'topics'
          const sectionSensors = visibleSensors.filter(s => s.category === section.label)
          // Skip empty non-topic sections; Topics always visible
          if (!isTopics && sectionSensors.length === 0) return null
          return (
            <React.Fragment key={section.key}>
              {/* Section header */}
              <div style={{
                gridColumn: '1 / -1',
                padding: '0.5rem 1rem 0.25rem',
                margin: sIdx > 0 ? '0.25rem -1rem 0' : '0 -1rem',
                borderTop: sIdx > 0 ? '1px solid var(--border-soft)' : 'none',
              }}>
                <span style={{
                  fontSize: '0.5625rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-faint)',
                }}>
                  {section.label}
                </span>
              </div>
              {/* Topics section: empty state */}
              {isTopics && topicKeywords.length === 0 && (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '0.375rem 1rem',
                  borderTop: '1px solid color-mix(in srgb, var(--border-soft) 40%, transparent)',
                }}>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                    {t('status.no_keywords')}
                  </span>
                </div>
              )}
              {/* Topics section: keyword-grouped progress rows */}
              {isTopics && topicKeywords.map(entry => (
                <React.Fragment key={entry.keyword}>
                  {/* Keyword heading row */}
                  <div style={{
                    gridColumn: '1 / -1',
                    display: 'grid',
                    gridTemplateColumns: 'subgrid',
                    alignItems: 'center',
                    padding: '0.3125rem 1rem',
                    borderTop: '1px solid color-mix(in srgb, var(--border-soft) 40%, transparent)',
                  }}>
                    <span />
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}>
                      {entry.label}
                    </span>
                    <span />
                    <span />
                  </div>
                  {/* Platform sub-rows */}
                  {entry.platforms.map(({ sensor, sensorLabel, sub }) => (
                    <div
                      key={`${entry.keyword}:${sensor}`}
                      className="sensor-sub-item"
                      style={{
                        gridColumn: '1 / -1',
                        display: 'grid',
                        gridTemplateColumns: 'subgrid',
                        alignItems: 'center',
                        padding: '0.1875rem 1rem 0.1875rem 0',
                        borderTop: '1px solid color-mix(in srgb, var(--border-soft) 40%, transparent)',
                      }}
                    >
                      <span />
                      <span style={{
                        fontSize: '0.6875rem',
                        color: sub.fetch === 'running' ? 'var(--accent)' : 'var(--ink-muted)',
                        fontStyle: 'italic',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        paddingLeft: '0.75rem',
                      }}>
                        <span style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: sub.fetch === 'ok' ? 'var(--ok)'
                            : sub.fetch === 'running' ? 'var(--accent)'
                            : sub.fetch === 'failed' ? 'var(--err)'
                            : 'var(--border)',
                          transition: 'background 200ms',
                        }} />
                        {sensorLabel}
                      </span>
                      <span style={{
                        fontSize: '0.625rem',
                        fontFamily: 'ui-monospace, monospace',
                        color: 'var(--ink-faint)',
                        textAlign: 'right',
                      }}>
                        {(sub.fetch === 'ok' || sub.fetch === 'failed') && sub.item_count > 0 ? `${sub.item_count}` : ''}
                      </span>
                      <span />
                    </div>
                  ))}
                </React.Fragment>
              ))}
              {/* Standard sensor rows (non-topics sections) */}
              {!isTopics && sectionSensors.map(sensor => {
                const live = liveSensors[sensor.sensorKey]
                const liveFailed = live?.fetch === 'failed' || live?.summary === 'failed'
                const liveRetrying = retryAttempt > 0 && (live?.fetch === 'running' || live?.fetch === 'queued')
                return (
                  <React.Fragment key={sensor.sensorKey}>
                    <SensorRow
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
                    {noAccountsSensors.has(sensor.sensorKey) && !sensor.isDisabled && (
                      <div style={{
                        gridColumn: '1 / -1',
                        display: 'grid',
                        gridTemplateColumns: 'subgrid',
                        alignItems: 'center',
                        padding: '0.1875rem 1rem 0.1875rem 0',
                        borderTop: '1px solid color-mix(in srgb, var(--border-soft) 40%, transparent)',
                      }}>
                        <span />
                        <span style={{
                          fontSize: '0.6875rem',
                          color: 'var(--ink-faint)',
                          fontStyle: 'italic',
                          paddingLeft: '0.75rem',
                        }}>
                          {t('sensor.no_accounts')}
                        </span>
                        <span />
                        <span />
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
