// ABOUTME: Command bar — Zone 3 of the mission control Status page.
// ABOUTME: Fixed bottom bar with run controls, mode selector, selection helpers, progress, and mobile status info.
'use client'

import { useState } from 'react'
import type { RunMode } from '@/api/client'
import type { Phase } from './StatusStrip'

export interface CommandBarProps {
  isRunning: boolean
  phase: Phase
  progress: { done: number; total: number }
  detail?: string
  failedCount: number
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
  statusColor?: string
  statusLabel?: string
  sourcesOk?: number
  sourcesTotal?: number
  totalItems?: number
  lastFetchAgo?: string | null
}

export const COMMAND_BAR_CSS = `
@keyframes barbershop {
  0% { background-position: 0 0; }
  100% { background-position: 28.28px 0; }
}
`

const PHASE_LABELS: Record<Phase, string> = {
  idle: '',
  fetching: 'Fetching',
  summarizing: 'Summarizing',
  briefing: 'Briefing',
  stopping: 'Stopping',
  paused: 'Paused',
}

const MODE_OPTIONS: { value: RunMode; label: string }[] = [
  { value: 'fetch', label: 'Fetch' },
  { value: 'fetch_summarize', label: 'Fetch + Summarize' },
  { value: 'summarize', label: 'Summarize' },
]

const barStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  right: 0,
  left: 220,
  zIndex: 20,
  background: 'var(--surface)',
  borderTop: '1px solid var(--border)',
  boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
  paddingBottom: 'env(safe-area-inset-bottom)',
}

const innerStyle: React.CSSProperties = {
  maxWidth: 1024,
  margin: '0 auto',
  padding: '0 3rem',
  minHeight: 56,
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  position: 'relative',
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
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '0.75rem',
  color: 'var(--ink-faint)',
}

const runBtnBase: React.CSSProperties = {
  marginLeft: 'auto',
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
  marginLeft: 'auto',
  padding: '0.5rem 1.25rem',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontWeight: 600,
  border: '1px solid var(--err)',
  color: 'var(--err)',
  background: 'transparent',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
  transition: 'background 150ms ease, color 150ms ease',
}

const skipBtnStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontWeight: 500,
  border: '1px solid var(--accent)',
  color: 'var(--accent)',
  background: 'transparent',
  cursor: 'pointer',
}

const progressTrackStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  background: 'var(--border)',
}

const monoStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '0.8125rem',
  fontWeight: 600,
}

const statusRowDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
}

const statusRowLabel: React.CSSProperties = {
  fontWeight: 600,
  textTransform: 'uppercase',
  fontSize: '0.625rem',
  letterSpacing: '0.06em',
}

const statusRowMono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontWeight: 600,
  fontSize: '0.75rem',
  color: 'var(--ink)',
}

const statusRowMuted: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--ink-faint)',
}

function MobileStatusRow({
  statusColor,
  statusLabel,
  sourcesOk,
  sourcesTotal,
  totalItems,
  lastFetchAgo,
}: Pick<CommandBarProps, 'statusColor' | 'statusLabel' | 'sourcesOk' | 'sourcesTotal' | 'totalItems' | 'lastFetchAgo'>) {
  return (
    <div
      className="command-bar-status"
      style={{
        display: 'none',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <span style={{ ...statusRowDot, background: statusColor || 'var(--ink-faint)' }} />
      <span style={{ ...statusRowLabel, color: statusColor || 'var(--ink-faint)' }}>
        {statusLabel || 'No Data'}
      </span>
      <span style={{ color: 'var(--border)' }}>&middot;</span>
      <span style={statusRowMono}>{sourcesOk ?? 0}/{sourcesTotal ?? 0}</span>
      <span style={statusRowMuted}>src</span>
      <span style={{ color: 'var(--border)' }}>&middot;</span>
      <span style={statusRowMono}>{totalItems ?? 0}</span>
      <span style={statusRowMuted}>items</span>
      {lastFetchAgo && (
        <>
          <span style={{ color: 'var(--border)' }}>&middot;</span>
          <span style={{ ...statusRowMono, fontWeight: 400, color: 'var(--ink-faint)' }}>{lastFetchAgo}</span>
        </>
      )}
    </div>
  )
}

export function CommandBar({
  isRunning,
  phase,
  progress,
  detail,
  failedCount,
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
  statusColor,
  statusLabel,
  sourcesOk,
  sourcesTotal,
  totalItems,
  lastFetchAgo,
}: CommandBarProps) {
  const [mode, setMode] = useState<RunMode>('fetch_summarize')
  const [stopHovered, setStopHovered] = useState(false)

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const runDisabled = fetching
  const noneSelected = selectedCount === 0
  const allSelected = selectedCount === totalSensors

  const runLabel = noneSelected || allSelected ? 'Run All' : `Run ${selectedCount}`

  if (isPaused) {
    return (
      <div className="command-bar" style={barStyle}>
        <div className="command-bar-inner" style={innerStyle}>
          <div style={{
            ...progressTrackStyle,
            background: 'repeating-linear-gradient(45deg, var(--warn) 0 10px, var(--warn-subtle) 10px 20px)',
            backgroundSize: '28.28px 100%',
            animation: 'barbershop 1s linear infinite',
          }} />

          <span style={{ fontSize: '0.8125rem', color: 'var(--warn)', fontWeight: 600 }}>
            {failedCount} failed — retry or skip above
          </span>

          <div className="command-bar-pause-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0 auto' }}>
            <button
              type="button"
              onClick={onGenerateOverall}
              style={{
                ...runBtnBase,
                marginLeft: 0,
              }}
            >
              <span style={{ fontSize: '0.625rem' }}>▶</span>
              Generate Summary
            </button>
          </div>

          <StopButton
            isStopping={isStopping}
            onStop={onStop}
            hovered={stopHovered}
            onHover={setStopHovered}
          />
        </div>
      </div>
    )
  }

  if (isRunning) {
    const phaseLabel = PHASE_LABELS[phase] || PHASE_LABELS.fetching

    return (
      <div className="command-bar" style={barStyle}>
        <div className="command-bar-inner" style={innerStyle}>
          <div style={progressTrackStyle}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: 'var(--accent)',
              borderRadius: '0 2px 2px 0',
              transition: 'width 300ms ease',
            }} />
          </div>

          <div className="command-bar-left" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
            <span style={{ ...monoStyle, color: 'var(--accent)' }}>{phaseLabel}</span>
            {detail && (
              <>
                <span style={{ color: 'var(--ink-faint)' }}>·</span>
                <span style={{ fontStyle: 'italic', fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>{detail}</span>
              </>
            )}
          </div>

          <div className="command-bar-run-stats" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 auto' }}>
            <span style={monoStyle}>{progress.done}/{progress.total}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>sensors</span>
            {failedCount > 0 && (
              <>
                <span style={{ color: 'var(--ink-faint)' }}>·</span>
                <span style={{ ...monoStyle, color: 'var(--err)' }}>{failedCount}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--err)' }}>failed</span>
              </>
            )}
          </div>

          <StopButton
            isStopping={isStopping}
            onStop={onStop}
            hovered={stopHovered}
            onHover={setStopHovered}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="command-bar" style={barStyle}>
      <div className="command-bar-inner" style={innerStyle}>
        <MobileStatusRow
          statusColor={statusColor}
          statusLabel={statusLabel}
          sourcesOk={sourcesOk}
          sourcesTotal={sourcesTotal}
          totalItems={totalItems}
          lastFetchAgo={lastFetchAgo}
        />

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as RunMode)}
          style={selectStyle}
        >
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="command-bar-idle-center" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <button type="button" onClick={onSelectAll} style={quickLinkStyle} className="command-bar-link">All</button>
          <button type="button" onClick={onSelectNone} style={quickLinkStyle} className="command-bar-link">None</button>
          {hasFailedSensors && (
            <button type="button" onClick={onSelectFailed} style={quickLinkStyle} className="command-bar-link">Failed</button>
          )}
          <span style={selCountStyle}>
            {allSelected ? 'All' : `${selectedCount} sel`}
          </span>
        </div>

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
        ...(hovered && !isStopping ? { background: 'var(--err)', color: 'white' } : {}),
      }}
    >
      <span style={{ fontSize: '0.5rem' }}>■</span>
      {isStopping ? 'Stopping...' : 'Stop'}
    </button>
  )
}
