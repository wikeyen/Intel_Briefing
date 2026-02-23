// ABOUTME: Unified control bar — merges StatusStrip (Zone 1) and CommandBar (Zone 3) into a single top bar.
// ABOUTME: Shows health/metrics/controls in idle, progress/stop when running, warning/resume when paused.
'use client'

import { useState } from 'react'
import type { HealthResponse, ConfigSettings, RunMode } from '@/api/client'
import { useTranslation } from '@/lib/i18n'
import { STATUS_META } from './constants'
import { timeAgo, nextFetchIn } from './time-helpers'

export type Phase = 'idle' | 'fetching' | 'summarizing' | 'briefing' | 'stopping' | 'paused'

export interface ControlBarProps {
  health: HealthResponse | null
  config: ConfigSettings | null
  sourcesOk: number
  sourcesTotal: number
  totalItems: number
  isRunning: boolean
  phase: Phase
  progress: { done: number; total: number }
  detail?: string
  failedCount: number
  retryingCount: number
  isPaused: boolean
  selectedCount: number
  totalSensors: number
  hasFailedSensors: boolean
  onRun: (mode: RunMode) => void
  onStop: () => void
  onSkipRetries: () => void
  onGenerateOverall: () => void
  onSelectAll: () => void
  onSelectNone: () => void
  onSelectFailed: () => void
  fetching: boolean
  isStopping: boolean
}

export const CONTROL_BAR_CSS = `
@keyframes barbershop {
  0% { background-position: 0 0; }
  100% { background-position: 28.28px 0; }
}
`

const MODE_OPTIONS: { value: RunMode }[] = [
  { value: 'fetch' },
  { value: 'fetch_summarize' },
  { value: 'summarize' },
]

const MONO: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const metricValueStyle: React.CSSProperties = {
  ...MONO,
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--ink)',
}

const metricLabelStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--ink-faint)',
  marginLeft: '0.25rem',
}

const selectStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  padding: '0.375rem 0.75rem',
  borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'var(--canvas)',
  color: 'var(--ink)',
  cursor: 'pointer',
  outline: 'none',
}

const quickLinkStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--ink-muted)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'none',
}

const selCountStyle: React.CSSProperties = {
  ...MONO,
  fontSize: '0.75rem',
  color: 'var(--ink-faint)',
}

const runBtnBase: React.CSSProperties = {
  padding: '0.5rem 1.25rem',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontWeight: 600,
  background: 'var(--accent)',
  color: 'white',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
}

const stopBtnBase: React.CSSProperties = {
  padding: '0.5rem 1.25rem',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontWeight: 600,
  border: 'none',
  color: 'white',
  background: 'var(--err)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
  transition: 'opacity 150ms ease',
}

const barStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
  maxWidth: 1024,
  width: '100%',
  margin: '0 auto',
  minHeight: 68,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  background: 'var(--canvas)',
  borderBottom: '1px solid var(--border)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  padding: '0 3rem',
}

const progressTrackStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: '3rem',
  right: '3rem',
  height: 2,
  background: 'var(--border)',
}

export function ControlBar({
  health,
  config,
  sourcesOk,
  sourcesTotal,
  totalItems,
  isRunning,
  phase,
  progress,
  detail,
  failedCount,
  retryingCount,
  isPaused,
  selectedCount,
  totalSensors,
  hasFailedSensors,
  onRun,
  onStop,
  onSkipRetries,
  onGenerateOverall,
  onSelectAll,
  onSelectNone,
  onSelectFailed,
  fetching,
  isStopping,
}: ControlBarProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<RunMode>('fetch_summarize')
  const [stopHovered, setStopHovered] = useState(false)

  const status = health?.status ?? 'no_data'
  const meta = STATUS_META[status] ?? STATUS_META.no_data
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const runDisabled = fetching
  const noneSelected = selectedCount === 0
  const allSelected = selectedCount === totalSensors
  const runLabel = noneSelected || allSelected ? t('status.run_all') : t('status.run_n', { count: String(selectedCount) })

  const schedule = config?.fetch_time
    ? nextFetchIn(config.fetch_time, config.fetch_timezone)
    : null

  // --- Paused state ---
  if (isPaused) {
    return (
      <div className="control-bar page-padding" style={barStyle}>
        <div className="control-bar-row" style={rowStyle}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--warn)', fontWeight: 600 }}>
            {t('status.failed_retry', { count: String(failedCount) })}
          </span>

          <div style={{ margin: '0 auto' }}>
            <button
              type="button"
              onClick={onGenerateOverall}
              style={runBtnBase}
            >
              <span style={{ fontSize: '0.625rem' }}>▶</span>
              {t('status.generate_summary')}
            </button>
          </div>

          <StopButton
            isStopping={isStopping}
            onStop={onStop}
            hovered={stopHovered}
            onHover={setStopHovered}
          />
        </div>

        {/* Barbershop stripe */}
        <div style={{
          ...progressTrackStyle,
          background: 'repeating-linear-gradient(45deg, var(--warn) 0 10px, var(--warn-subtle) 10px 20px)',
          backgroundSize: '28.28px 100%',
          animation: 'barbershop 1s linear infinite',
        }} />
      </div>
    )
  }

  // --- Running state ---
  if (isRunning) {
    const phaseLabel = phase === 'idle' ? '' : t('status.' + phase)
    const dotColor = 'var(--accent)'

    return (
      <div className="control-bar page-padding" style={{ ...barStyle, borderBottom: 'none', paddingBottom: 6 }}>
        <div className="control-bar-row" style={rowStyle}>
          {/* Left: pulsing dot + phase + detail */}
          <div className="control-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dotColor,
                flexShrink: 0,
                animation: 'pulseDot 1.6s ease-in-out infinite',
              }}
            />
            <span style={{ ...labelStyle, color: dotColor }}>{phaseLabel}</span>
            {detail && (
              <>
                <span style={{ color: 'var(--ink-faint)' }}>·</span>
                <span style={{ fontStyle: 'italic', fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>{detail}</span>
              </>
            )}
          </div>

          {/* Center: progress counts */}
          <div className="control-bar-center" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 auto' }}>
            <span style={{ ...MONO, fontSize: '0.8125rem', fontWeight: 600 }}>{progress.done}/{progress.total}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{t('status.sensors')}</span>
            {retryingCount > 0 && (
              <>
                <span style={{ color: 'var(--ink-faint)' }}>·</span>
                <span style={{ ...MONO, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--warn)' }}>{retryingCount}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--warn)' }}>{t('status.retrying')}</span>
              </>
            )}
            {failedCount > 0 && (
              <>
                <span style={{ color: 'var(--ink-faint)' }}>·</span>
                <span style={{ ...MONO, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--err)' }}>{failedCount}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--err)' }}>{t('status.failed')}</span>
              </>
            )}
          </div>

          {/* Right: stop */}
          <StopButton
            isStopping={isStopping}
            onStop={onStop}
            hovered={stopHovered}
            onHover={setStopHovered}
          />
        </div>

        {/* 2px progress bar */}
        <div style={progressTrackStyle}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--accent)',
            borderRadius: '0 1px 1px 0',
            transition: 'width 300ms ease',
          }} />
        </div>
      </div>
    )
  }

  // --- Idle state ---
  return (
    <div className="control-bar page-padding" style={barStyle}>
      <div className="control-bar-row" style={rowStyle}>
        {/* Left: health dot + label + metrics */}
        <div className="control-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span
            data-testid="control-health-dot"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: meta.color,
              flexShrink: 0,
            }}
          />
          <span style={{ ...labelStyle, color: meta.color }}>{meta.label}</span>
        </div>

        <div className="control-bar-metrics" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <span>
            <span style={metricValueStyle}>{sourcesOk}/{sourcesTotal}</span>
            <span style={metricLabelStyle}>{t('status.sources')}</span>
          </span>
          <span>
            <span style={metricValueStyle}>{totalItems}</span>
            <span style={metricLabelStyle}>{t('status.items')}</span>
          </span>
          {health?.last_fetch && (
            <span>
              <span style={metricValueStyle}>{timeAgo(health.last_fetch)}</span>
            </span>
          )}
        </div>

        {/* Center: mode + selection helpers */}
        <div className="control-bar-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as RunMode)}
            style={selectStyle}
          >
            {MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t('status.mode_' + opt.value)}</option>
            ))}
          </select>

          <div className="control-bar-selection" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <button type="button" onClick={onSelectAll} style={quickLinkStyle} className="control-bar-link">{t('status.all')}</button>
            <button type="button" onClick={onSelectNone} style={quickLinkStyle} className="control-bar-link">{t('status.none')}</button>
            {hasFailedSensors && (
              <button type="button" onClick={onSelectFailed} style={quickLinkStyle} className="control-bar-link">{t('status.failed_btn')}</button>
            )}
            <span style={selCountStyle}>
              {allSelected ? t('status.all_sel') : t('status.n_sel', { count: String(selectedCount) })}
            </span>
          </div>

          {/* Right: Run button */}
          <button
            type="button"
            disabled={runDisabled}
            onClick={() => onRun(mode)}
            style={{
              ...runBtnBase,
              ...(runDisabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
            }}
          >
            <span style={{ fontSize: '0.625rem' }}>▶</span>
            {runLabel}
          </button>
        </div>
      </div>

      {/* Schedule footer */}
      <div className="control-bar-schedule" style={{
        padding: '0 3rem 0.375rem',
        display: 'flex',
      }}>
        <span
          data-testid="control-schedule"
          style={{
            ...MONO,
            fontSize: '0.6875rem',
            color: 'var(--ink-faint)',
          }}
        >
          {schedule ? t('status.next', { time: schedule }) : t('status.no_schedule')}
        </span>
      </div>
    </div>
  )
}

function StopButton({
  isStopping,
  onStop,
  hovered,
  onHover,
}: {
  isStopping: boolean
  onStop: () => void
  hovered: boolean
  onHover: (h: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      disabled={isStopping}
      onClick={onStop}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        ...stopBtnBase,
        ...(isStopping ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        ...(hovered && !isStopping ? { opacity: 0.85 } : {}),
      }}
    >
      <span style={{ fontSize: '0.5rem' }}>■</span>
      {isStopping ? t('status.stopping_btn') : t('status.stop')}
    </button>
  )
}
