// ABOUTME: Individual sensor card for the mission control Status page grid.
// ABOUTME: Purely presentational — renders sensor status, live progress, errors, and selection state.
'use client'

import { memo } from 'react'
import type { SensorJobProgress } from '@/api/client'

export interface SensorCardProps {
  sensorKey: string
  label: string
  category: string
  isRunning: boolean
  isPaused: boolean
  liveSensor?: SensorJobProgress
  itemCount: number
  lastFetchAgo?: string
  isOk: boolean
  isFailed: boolean
  isDisabled: boolean
  isConfigError: boolean
  isApiError: boolean
  fetchError?: string
  summaryError?: string
  isSelected: boolean
  onToggleSelect: () => void
  onRetry?: () => void
  onSkip?: () => void
  onDismiss?: () => void
}

export const CARD_CSS = `
@keyframes flashError {
  0% { background-color: var(--err-tint); }
  100% { background-color: transparent; }
}
.sensor-card-flash { animation: flashError 0.5s ease-out; }
`

type CardState =
  | 'healthy'
  | 'selected'
  | 'failed'
  | 'config-error'
  | 'disabled'
  | 'fetching'
  | 'summarizing'
  | 'waiting'
  | 'done'
  | 'failed-mid-run'
  | 'paused-failed'

function deriveState(props: SensorCardProps): CardState {
  const { isRunning, isPaused, liveSensor, isDisabled, isConfigError, isFailed, isSelected } = props

  if (isDisabled) return 'disabled'

  if (isRunning) {
    if (!liveSensor) return 'waiting'
    // During pause, failed sensors get special interactive state
    if (isPaused && (liveSensor.fetch === 'failed' || liveSensor.summary === 'failed')) return 'paused-failed'
    if (liveSensor.fetch === 'failed' || liveSensor.summary === 'failed') return 'failed-mid-run'
    if (liveSensor.fetch === 'ok' && (liveSensor.summary === 'ok' || liveSensor.summary === 'skipped')) return 'done'
    if (liveSensor.summary === 'running') return 'summarizing'
    if (liveSensor.fetch === 'running') return 'fetching'
    if (liveSensor.fetch === 'ok' && liveSensor.summary === 'queued') return 'summarizing'
    return 'waiting'
  }

  if (isConfigError) return 'config-error'
  if (isFailed) return 'failed'
  if (isSelected) return 'selected'
  return 'healthy'
}

const DOT_SIZE = 6

function Dot({ state }: { state: CardState }) {
  const base: React.CSSProperties = {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: '50%',
    flexShrink: 0,
  }

  switch (state) {
    case 'healthy':
    case 'selected':
      return <span style={{ ...base, background: 'var(--ok)' }} />
    case 'failed':
    case 'failed-mid-run':
    case 'paused-failed':
      return <span style={{ ...base, background: 'var(--err)' }} />
    case 'config-error':
      return <span style={{ ...base, background: 'var(--warn)' }} />
    case 'disabled':
      return <span style={{ ...base, background: 'var(--ink-faint)' }} />
    case 'fetching':
      return <span style={{ ...base, background: 'var(--accent)', animation: 'pulseDot 1.6s ease-in-out infinite' }} />
    case 'summarizing':
      return <span style={{ ...base, background: 'var(--accent)' }} />
    case 'waiting':
      return <span style={{ ...base, background: 'transparent', border: '1.5px solid var(--ink-faint)' }} />
    case 'done':
      return <span style={{ ...base, background: 'var(--ok)' }} />
  }
}

function cardContainerStyle(state: CardState, hovered: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 110,
    padding: '1rem',
    background: 'var(--surface)',
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderStyle: 'solid',
    borderTopColor: 'var(--border)',
    borderRightColor: 'var(--border)',
    borderBottomColor: 'var(--border)',
    borderLeftColor: 'var(--border)',
    borderRadius: 8,
    boxShadow: 'var(--shadow-card)',
    transition: 'all 200ms ease',
    cursor: 'pointer',
    position: 'relative',
  }

  if (state === 'disabled') {
    return { ...base, opacity: 0.45, cursor: 'default' }
  }

  if (state === 'paused-failed') {
    return {
      ...base,
      borderLeftWidth: 3,
      borderLeftColor: 'var(--err)',
      cursor: 'default',
    }
  }

  if (state === 'fetching' || state === 'summarizing' || state === 'waiting' || state === 'done' || state === 'failed-mid-run') {
    return {
      ...base,
      cursor: 'default',
      ...(state === 'failed-mid-run' && { borderLeftWidth: 3, borderLeftColor: 'var(--err)' }),
    }
  }

  if (state === 'selected') {
    return {
      ...base,
      borderTopColor: 'var(--accent)',
      borderRightColor: 'var(--accent)',
      borderBottomColor: 'var(--accent)',
      borderLeftColor: 'var(--accent)',
      background: 'var(--accent-wash)',
      ...(hovered && { boxShadow: 'var(--shadow-card-hover)', borderTopColor: 'var(--accent)', borderRightColor: 'var(--accent)', borderBottomColor: 'var(--accent)', borderLeftColor: 'var(--accent)' }),
    }
  }

  if (state === 'failed') {
    return {
      ...base,
      borderLeftWidth: 3,
      borderLeftColor: 'var(--err)',
      ...(hovered && { boxShadow: 'var(--shadow-card-hover)', borderTopColor: 'var(--border-strong)', borderRightColor: 'var(--border-strong)', borderBottomColor: 'var(--border-strong)', borderLeftColor: 'var(--err)' }),
    }
  }

  if (state === 'config-error') {
    return {
      ...base,
      borderLeftWidth: 3,
      borderLeftColor: 'var(--warn)',
      ...(hovered && { boxShadow: 'var(--shadow-card-hover)', borderTopColor: 'var(--border-strong)', borderRightColor: 'var(--border-strong)', borderBottomColor: 'var(--border-strong)', borderLeftColor: 'var(--warn)' }),
    }
  }

  return {
    ...base,
    ...(hovered && { boxShadow: 'var(--shadow-card-hover)', borderTopColor: 'var(--border-strong)', borderRightColor: 'var(--border-strong)', borderBottomColor: 'var(--border-strong)', borderLeftColor: 'var(--border-strong)' }),
  }
}

const nameStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--ink)',
  lineHeight: 1.2,
}

const categoryStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--ink-faint)',
  letterSpacing: '0.04em',
}

const metricStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: 'var(--ink)',
}

const secondaryStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--ink-faint)',
}

const errorTextStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--err)',
  lineHeight: 1.3,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
}

const buttonBase: React.CSSProperties = {
  padding: '0.25rem 0.75rem',
  borderRadius: 3,
  fontSize: '0.6875rem',
  background: 'transparent',
  cursor: 'pointer',
  lineHeight: 1.4,
}

const retryButtonStyle: React.CSSProperties = {
  ...buttonBase,
  border: '1px solid var(--accent)',
  color: 'var(--accent)',
}

const dismissButtonStyle: React.CSSProperties = {
  ...buttonBase,
  border: '1px solid var(--border)',
  color: 'var(--ink-muted)',
}

const progressBarTrack: React.CSSProperties = {
  height: 3,
  borderRadius: 2,
  background: 'var(--border)',
  marginTop: '0.375rem',
  overflow: 'hidden',
}

const progressBarFill = (pct: number): React.CSSProperties => ({
  height: '100%',
  borderRadius: 2,
  background: 'var(--accent)',
  width: `${pct}%`,
  transition: 'width 300ms ease',
})

const chunkTextStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: '0.625rem',
  color: 'var(--ink-faint)',
  marginTop: '0.125rem',
}

function PrimaryMetric({ state, props }: { state: CardState; props: SensorCardProps }) {
  const { liveSensor, itemCount, fetchError, summaryError } = props

  switch (state) {
    case 'healthy':
    case 'selected':
      return <span style={metricStyle}>{itemCount} items</span>

    case 'disabled':
      return <span style={{ ...metricStyle, color: 'var(--ink-faint)' }}>Disabled</span>

    case 'config-error':
      return <span style={{ ...errorTextStyle, color: 'var(--warn)' }}>Needs API key</span>

    case 'failed':
      return <span style={errorTextStyle}>{fetchError || summaryError || 'Failed'}</span>

    case 'fetching':
      return (
        <span style={{ ...metricStyle, color: 'var(--accent)', fontWeight: 500 }}>
          Fetching{liveSensor ? ` \u00b7 ${liveSensor.item_count}` : '\u2026'}
        </span>
      )

    case 'summarizing':
      return (
        <span style={{ ...metricStyle, color: 'var(--accent)', fontWeight: 500 }}>
          Summarizing
        </span>
      )

    case 'waiting':
      return <span style={{ ...metricStyle, color: 'var(--ink-faint)', fontWeight: 400 }}>Waiting\u2026</span>

    case 'done':
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={metricStyle}>{liveSensor?.item_count ?? itemCount} items</span>
          <span style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'var(--ok)',
            background: 'var(--ok-bg)',
            padding: '0.0625rem 0.375rem',
            borderRadius: 3,
            letterSpacing: '0.02em',
          }}>
            {'✓ Done'}
          </span>
        </span>
      )

    case 'failed-mid-run':
    case 'paused-failed':
      return (
        <span style={errorTextStyle}>
          {liveSensor?.fetch_error || liveSensor?.summary_error || 'Failed'}
        </span>
      )
  }
}

function SecondaryContent({ state, props }: { state: CardState; props: SensorCardProps }) {
  const { liveSensor, lastFetchAgo, onRetry, onSkip, onDismiss } = props

  switch (state) {
    case 'healthy':
    case 'selected':
      return lastFetchAgo ? <span style={secondaryStyle}>{lastFetchAgo}</span> : null

    case 'failed':
      return (onRetry || onDismiss) ? (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          {onRetry && (
            <button
              style={retryButtonStyle}
              onClick={(e) => { e.stopPropagation(); onRetry() }}
            >
              Retry
            </button>
          )}
          {onDismiss && (
            <button
              style={dismissButtonStyle}
              onClick={(e) => { e.stopPropagation(); onDismiss() }}
            >
              Dismiss
            </button>
          )}
        </div>
      ) : null

    case 'paused-failed':
      return (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          {onRetry && (
            <button
              style={retryButtonStyle}
              onClick={(e) => { e.stopPropagation(); onRetry() }}
            >
              Retry
            </button>
          )}
          {onSkip && (
            <button
              style={dismissButtonStyle}
              onClick={(e) => { e.stopPropagation(); onSkip() }}
            >
              Skip
            </button>
          )}
        </div>
      )

    case 'fetching':
      return liveSensor?.fetch_detail
        ? <span style={secondaryStyle}>{liveSensor.fetch_detail}</span>
        : null

    case 'summarizing': {
      if (!liveSensor) return null
      const total = liveSensor.summary_chunks_total
      const done = liveSensor.summary_chunks_done
      if (total <= 0) return null
      const pct = Math.min(100, (done / total) * 100)
      return (
        <div>
          <div style={progressBarTrack}>
            <div style={progressBarFill(pct)} />
          </div>
          <span style={chunkTextStyle}>{done}/{total} chunks</span>
        </div>
      )
    }

    case 'failed-mid-run':
      return liveSensor?.fetch_detail
        ? <span style={secondaryStyle}>{liveSensor.fetch_detail}</span>
        : null

    default:
      return null
  }
}

export const SensorCard = memo(function SensorCard(props: SensorCardProps) {
  const { label, category, isDisabled, isRunning, isPaused, onToggleSelect } = props
  const state = deriveState(props)
  const isClickable = !isDisabled && !isRunning && !isPaused

  function handleClick() {
    if (isClickable) onToggleSelect()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onToggleSelect()
    }
  }

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={state === 'failed-mid-run' ? 'sensor-card-flash' : undefined}
      style={cardContainerStyle(state, false)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={(e) => {
        if (isClickable) {
          const s = cardContainerStyle(state, true)
          Object.assign(e.currentTarget.style, {
            boxShadow: s.boxShadow,
            borderTopColor: s.borderTopColor,
            borderRightColor: s.borderRightColor,
            borderBottomColor: s.borderBottomColor,
            borderLeftColor: s.borderLeftColor,
          })
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          const s = cardContainerStyle(state, false)
          Object.assign(e.currentTarget.style, {
            boxShadow: s.boxShadow,
            borderTopColor: s.borderTopColor,
            borderRightColor: s.borderRightColor,
            borderBottomColor: s.borderBottomColor,
            borderLeftColor: s.borderLeftColor,
          })
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Dot state={state} />
        <span style={nameStyle}>{label}</span>
      </div>

      <div style={{ marginTop: '0.25rem' }}>
        <span style={categoryStyle}>{category}</span>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
        <PrimaryMetric state={state} props={props} />
      </div>

      <SecondaryContent state={state} props={props} />
    </div>
  )
})
