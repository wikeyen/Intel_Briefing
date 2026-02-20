// ABOUTME: Page header for the Status page — shows "Status" title with health dot and run controls.
// ABOUTME: Follows the standard page-header pattern; health reflected via a colored dot next to the title.
'use client'
import { useState } from 'react'
import type { HealthResponse, RunMode } from '@/api/client'
import { STATUS_META } from './constants'
import { timeAgo } from './time-helpers'

export type Phase = 'idle' | 'fetching' | 'summarizing' | 'briefing' | 'stopping'

export interface ActionBarProps {
  health: HealthResponse | null
  isRunning: boolean
  phase: Phase
  progress: { done: number; total: number }
  fetching: boolean
  isStopping: boolean
  onRun: (mode: RunMode) => void
  onStop: () => void
}

const MODE_OPTIONS: { value: RunMode; label: string }[] = [
  { value: 'fetch', label: 'Fetch' },
  { value: 'fetch_summarize', label: 'Fetch + Summarize' },
  { value: 'summarize', label: 'Summarize' },
]

/** Build the subtitle text shown below the title when the pipeline is running. */
function phaseLabel(phase: Phase, progress: { done: number; total: number }): string {
  switch (phase) {
    case 'fetching':
      return `Fetching \u00b7 ${progress.done} of ${progress.total} sensors`
    case 'summarizing':
      return `Summarizing \u00b7 ${progress.done} of ${progress.total} sensors`
    case 'briefing':
      return 'Generating briefing\u2026'
    case 'stopping':
      return 'Stopping\u2026'
    default:
      return ''
  }
}

export function ActionBar({
  health,
  isRunning,
  phase,
  progress,
  fetching,
  isStopping,
  onRun,
  onStop,
}: ActionBarProps) {
  const [selectedMode, setSelectedMode] = useState<RunMode>('fetch_summarize')

  const status = health?.status ?? 'no_data'
  const meta = STATUS_META[status] ?? STATUS_META.no_data
  const disabled = fetching || isRunning
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  // Subtitle: progress text when running, health description when idle
  const subtitle = isRunning
    ? phaseLabel(phase, progress)
    : health?.last_fetch
      ? `${meta.desc} \u00b7 ${timeAgo(health.last_fetch)}`
      : meta.desc

  return (
    <div className="page-header" style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: '2rem',
      overflow: 'hidden',
    }}>
      {/* ── Left: "Status" title with health dot + subtitle ── */}
      <div>
        <h2 style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          color: 'var(--ink)',
          marginBottom: '0.375rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          Status
          <span
            data-testid="health-dot"
            aria-label={meta.label}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isRunning ? 'var(--accent)' : meta.color,
              flexShrink: 0,
              animation: isRunning ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
            }}
          />
        </h2>
        <p
          data-testid="action-bar-subtitle"
          style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}
          title={health?.last_fetch ?? undefined}
        >
          {subtitle}
        </p>
      </div>

      {/* ── Right: mode dropdown + Run button ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, paddingTop: '0.125rem' }}>
        {/* Mode dropdown — hidden during runs */}
        {!isRunning && (
          <select
            value={selectedMode}
            onChange={e => setSelectedMode(e.target.value as RunMode)}
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.5rem',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--canvas)',
              color: 'var(--ink)',
              cursor: 'pointer',
            }}
          >
            {MODE_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        )}

        {/* Run / Stop button */}
        {isRunning ? (
          <button
            onClick={onStop}
            disabled={isStopping}
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.375rem 1rem',
              borderRadius: 6,
              border: 'none',
              color: isStopping ? 'var(--ink-faint)' : '#FFFFFF',
              background: isStopping ? 'var(--border)' : 'var(--danger, #d93025)',
              cursor: isStopping ? 'not-allowed' : 'pointer',
              transition: 'background 120ms',
              whiteSpace: 'nowrap',
            }}
          >
            {isStopping ? 'Stopping\u2026' : 'Stop'}
          </button>
        ) : (
          <button
            onClick={() => onRun(selectedMode)}
            disabled={disabled}
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.375rem 1rem',
              borderRadius: 6,
              border: 'none',
              color: disabled ? 'var(--ink-faint)' : '#FFFFFF',
              background: disabled ? 'var(--border)' : 'var(--accent)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'background 120ms',
              whiteSpace: 'nowrap',
            }}
          >
            Run
          </button>
        )}
      </div>

      {/* ── Progress bar — thin strip at the bottom when running ── */}
      {isRunning && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: 'var(--border)',
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--accent)',
            borderRadius: '0 2px 2px 0',
            transition: 'width 400ms ease',
          }} />
        </div>
      )}
    </div>
  )
}
