// ABOUTME: Individual sensor card for the mission control Status page grid.
// ABOUTME: Purely presentational — renders sensor status, live progress, errors, and selection state.
'use client'

import { memo } from 'react'
import type { SensorJobProgress } from '@/api/client'
import { useTranslation } from '@/lib/i18n'

export interface SensorCardProps {
  sensorKey: string
  label: string
  category: string
  isRunning: boolean
  isPaused: boolean
  liveSensor?: SensorJobProgress
  itemCount: number
  lastFetchAgo?: string
  /** True if the last fetch timestamp is from the most recent pipeline run. */
  isFreshFetch?: boolean
  isOk: boolean
  isFailed: boolean
  isDisabled: boolean
  isConfigError: boolean
  isApiError: boolean
  fetchError?: string
  summaryError?: string
  isSelected: boolean
  isRetrying?: boolean
  /** Sensor was not included in the current pipeline run. */
  isSkipped?: boolean
  /** Current tick counter — changes every second to trigger re-render for elapsed time. */
  tick?: number
  onToggleSelect: () => void
  onRetry?: () => void
  onSkip?: () => void
  onSkipFetching?: () => void
  onDismiss?: () => void
  /** Seconds until next auto-retry fires. Present only when a timer is counting down. */
  autoRetryCountdown?: number
}

export const CARD_CSS = `
@keyframes flashError {
  0% { background-color: var(--err-tint); }
  100% { background-color: transparent; }
}
.sensor-card-flash { animation: flashError 0.5s ease-out; }
@media (max-width: 768px) {
  .sensor-card-header { flex-wrap: wrap; gap: 0.25rem !important; }
}
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
  | 'skipped'
  | 'done'
  | 'failed-mid-run'
  | 'paused-failed'

function deriveState(props: SensorCardProps): CardState {
  const { isRunning, isPaused, liveSensor, isDisabled, isConfigError, isFailed, isSelected } = props

  if (isDisabled) return 'disabled'

  if (isRunning) {
    if (!liveSensor) return props.isSkipped ? 'skipped' : 'waiting'
    // During pause, failed sensors get special interactive state
    if (isPaused && (liveSensor.fetch === 'failed' || liveSensor.summary === 'failed')) return 'paused-failed'
    if (liveSensor.fetch === 'failed' || liveSensor.summary === 'failed') return 'failed-mid-run'
    if ((liveSensor.fetch === 'ok' || liveSensor.fetch === 'skipped') && (liveSensor.summary === 'ok' || liveSensor.summary === 'skipped')) return 'done'
    if (liveSensor.summary === 'running') return 'summarizing'
    if (liveSensor.fetch === 'running') return 'fetching'
    if ((liveSensor.fetch === 'ok' || liveSensor.fetch === 'skipped') && liveSensor.summary === 'queued') return 'waiting'
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
    case 'skipped':
      return <span style={{ ...base, background: 'var(--ink-faint)', opacity: 0.5 }} />
    case 'done':
      return <span style={{ ...base, background: 'var(--ok)' }} />
  }
}

function cardContainerStyle(state: CardState, hovered: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    minHeight: 100,
    padding: '0.75rem 0.875rem',
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
    overflow: 'hidden',
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
      ...(hovered && { boxShadow: 'var(--shadow-card-hover)' }),
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

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.375rem',
}

const nameStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--ink)',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
}

const categoryBadgeStyle: React.CSSProperties = {
  fontSize: '0.5625rem',
  fontWeight: 500,
  color: 'var(--ink-faint)',
  background: 'var(--surface-alt)',
  padding: '0.125rem 0.5rem',
  borderRadius: 9,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  flexShrink: 0,
  lineHeight: 1.6,
}

const metricStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--ink)',
}

const secondaryStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--ink-faint)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  display: 'block',
}

const errorTextStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--err)',
  lineHeight: 1.35,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  wordBreak: 'break-word',
}

const buttonBase: React.CSSProperties = {
  padding: '0.1875rem 0.625rem',
  borderRadius: 3,
  fontSize: '0.625rem',
  fontWeight: 500,
  background: 'transparent',
  cursor: 'pointer',
  lineHeight: 1.4,
}

const retryButtonStyle: React.CSSProperties = {
  ...buttonBase,
  border: '1px solid var(--accent)',
  color: 'var(--accent)',
  borderRadius: 9,
}

const dismissButtonStyle: React.CSSProperties = {
  ...buttonBase,
  border: '1px solid var(--border)',
  color: 'var(--ink-muted)',
  borderRadius: 9,
}

const progressBarTrack: React.CSSProperties = {
  height: 3,
  borderRadius: 2,
  background: 'var(--border)',
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
  fontSize: '0.5625rem',
  color: 'var(--ink-faint)',
  marginTop: '0.125rem',
}

type TFn = (key: string, params?: Record<string, string>) => string

const errorBadgeBase: React.CSSProperties = {
  fontSize: '0.5rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  padding: '0.0625rem 0.3125rem',
  borderRadius: 3,
  flexShrink: 0,
  lineHeight: 1.5,
}

function ErrorBadge({ kind, isSummaryError, t }: { kind?: string; isSummaryError?: boolean; t: TFn }) {
  if (kind === 'config') {
    return <span style={{ ...errorBadgeBase, color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)' }}>{t('sensor.error_config')}</span>
  }
  if (isSummaryError) {
    return <span style={{ ...errorBadgeBase, color: 'var(--err)', background: 'color-mix(in srgb, var(--err) 10%, transparent)' }}>{t('sensor.error_summary')}</span>
  }
  return <span style={{ ...errorBadgeBase, color: 'var(--err)', background: 'color-mix(in srgb, var(--err) 10%, transparent)' }}>{t('sensor.error_api')}</span>
}

const reasonTextStyle: React.CSSProperties = {
  fontSize: '0.625rem',
  color: 'var(--ink-faint)',
  fontStyle: 'italic',
  lineHeight: 1.3,
}

function PrimaryMetric({ state, props, t }: { state: CardState; props: SensorCardProps; t: TFn }) {
  const { liveSensor, itemCount, fetchError, summaryError, isConfigError } = props

  switch (state) {
    case 'healthy':
    case 'selected':
      return <span style={metricStyle}>{itemCount}</span>

    case 'disabled':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          <span style={{ ...metricStyle, fontSize: '0.75rem', color: 'var(--ink-faint)', fontWeight: 500 }}>{t('sensor.disabled')}</span>
          <span style={reasonTextStyle}>{t('sensor.disabled_reason')}</span>
        </div>
      )

    case 'config-error':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <ErrorBadge kind="config" t={t} />
            <span style={{ ...errorTextStyle, color: 'var(--warn)' }}>{t('sensor.needs_api_key')}</span>
          </span>
          <span style={reasonTextStyle}>{t('sensor.needs_api_key_reason')}</span>
        </div>
      )

    case 'failed':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <ErrorBadge kind={isConfigError ? 'config' : 'api'} isSummaryError={!fetchError && !!summaryError} t={t} />
            <span style={errorTextStyle}>{fetchError || summaryError || t('sensor.failed')}</span>
          </span>
        </div>
      )

    case 'fetching':
      return (
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
          <span style={{ ...metricStyle, color: 'var(--accent)', fontWeight: 500, fontSize: '0.75rem' }}>
            {t('sensor.fetching')}
          </span>
          {liveSensor && (
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.6875rem', color: 'var(--ink-faint)' }}>
              {'\u00b7'} {liveSensor.item_count}
            </span>
          )}
        </span>
      )

    case 'summarizing':
      return (
        <span style={{ ...metricStyle, color: 'var(--accent)', fontWeight: 500, fontSize: '0.75rem' }}>
          {t('sensor.summarizing')}
        </span>
      )

    case 'waiting':
      return <span style={{ ...metricStyle, color: 'var(--ink-faint)', fontWeight: 400, fontSize: '0.75rem' }}>{t('sensor.queued')}</span>

    case 'skipped':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          <span style={{ ...metricStyle, color: 'var(--ink-faint)', fontWeight: 400, fontSize: '0.75rem' }}>{t('sensor.skipped')}</span>
          <span style={reasonTextStyle}>{t('sensor.skipped_reason')}</span>
        </div>
      )

    case 'done':
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={metricStyle}>{liveSensor?.item_count ?? itemCount}</span>
          <span style={{
            fontSize: '0.5625rem',
            fontWeight: 600,
            color: 'var(--ok)',
            background: 'var(--ok-bg)',
            padding: '0.0625rem 0.3125rem',
            borderRadius: 3,
            letterSpacing: '0.02em',
          }}>
            {t('sensor.done')}
          </span>
        </span>
      )

    case 'failed-mid-run':
    case 'paused-failed':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <ErrorBadge kind={liveSensor?.fetch_error_kind ?? undefined} isSummaryError={!liveSensor?.fetch_error && !!liveSensor?.summary_error} t={t} />
            <span style={errorTextStyle}>
              {liveSensor?.fetch_error || liveSensor?.summary_error || t('sensor.failed')}
            </span>
          </span>
        </div>
      )
  }
}

function SecondaryContent({ state, props, t }: { state: CardState; props: SensorCardProps; t: TFn }) {
  const { liveSensor, lastFetchAgo, onRetry, onSkip, onDismiss } = props

  switch (state) {
    case 'healthy':
    case 'selected':
      return lastFetchAgo ? <span style={secondaryStyle}>{lastFetchAgo}</span> : null

    case 'failed': {
      const countdown = props.autoRetryCountdown
      const hasCountdown = countdown != null && countdown > 0
      return (onRetry || onDismiss || hasCountdown) ? (
        <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.125rem', alignItems: 'center' }}>
          {hasCountdown && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--accent)', opacity: 0.7 }}>
              ⟳ {t('sensor.autoRetryIn', { seconds: String(countdown) })}
            </span>
          )}
          {onRetry && (
            <button
              style={retryButtonStyle}
              onClick={(e) => { e.stopPropagation(); onRetry() }}
            >
              {t('sensor.retry')}
            </button>
          )}
          {onDismiss && (
            <button
              style={dismissButtonStyle}
              onClick={(e) => { e.stopPropagation(); onDismiss() }}
            >
              {t('sensor.dismiss')}
            </button>
          )}
        </div>
      ) : null
    }

    case 'paused-failed':
      return (
        <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.125rem' }}>
          {onRetry && (
            <button
              style={retryButtonStyle}
              onClick={(e) => { e.stopPropagation(); onRetry() }}
            >
              {t('sensor.retry')}
            </button>
          )}
          {onSkip && (
            <button
              style={dismissButtonStyle}
              onClick={(e) => { e.stopPropagation(); onSkip() }}
            >
              {t('sensor.skip')}
            </button>
          )}
        </div>
      )

    case 'fetching': {
      const { onSkipFetching } = props
      const startedAt = liveSensor?.fetch_started_at
      const elapsedSec = startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0
      const showSkip = onSkipFetching && elapsedSec >= 60
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          {liveSensor?.fetch_detail && <span style={secondaryStyle}>{liveSensor.fetch_detail}</span>}
          {showSkip && (
            <button
              style={{ ...dismissButtonStyle, marginTop: '0.125rem', alignSelf: 'flex-start' }}
              onClick={(e) => { e.stopPropagation(); onSkipFetching() }}
            >
              {t('sensor.skip')}
            </button>
          )}
        </div>
      )
    }

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
          <span style={chunkTextStyle}>{t('sensor.chunks', { done: String(done), total: String(total) })}</span>
        </div>
      )
    }

    case 'failed-mid-run':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          {liveSensor?.fetch_detail && <span style={secondaryStyle}>{liveSensor.fetch_detail}</span>}
          {!onRetry && (
            <span style={{ fontSize: '0.6875rem', color: 'var(--accent)', opacity: 0.7 }}>
              ⟳ {t('sensor.autoRetry')}
            </span>
          )}
        </div>
      )

    default:
      return null
  }
}

export const SensorCard = memo(function SensorCard(props: SensorCardProps) {
  const { t } = useTranslation()
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
      {/* Row 1: name + category badge */}
      <div className="sensor-card-header" style={headerRowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: 0 }}>
          <Dot state={state} />
          <span style={nameStyle}>{label}</span>
        </div>
        <span style={categoryBadgeStyle}>{category}</span>
      </div>

      {/* Row 2+: metric and secondary content pushed to bottom */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
        <PrimaryMetric state={state} props={props} t={t} />
        <SecondaryContent state={state} props={props} t={t} />
      </div>
    </div>
  )
})

/* ── Compact row variant for list layout ── */

function rowContainerStyle(state: CardState, hovered: boolean): React.CSSProperties {
  // Use explicit padding properties (never shorthand) to avoid React warnings
  // when paddingLeft changes between states. A transparent left border keeps
  // layout stable so dots don't shift when toggling selection.
  const base: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    paddingTop: '0.625rem',
    paddingRight: '1rem',
    paddingBottom: '0.625rem',
    paddingLeft: 'calc(1rem - 3px)',
    borderLeft: '3px solid transparent',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border-soft, rgba(0,0,0,0.04))',
    transition: 'background 200ms ease',
    cursor: 'pointer',
    minHeight: 42,
  }

  if (state === 'disabled') return { ...base, opacity: 0.4, cursor: 'default' }

  if (state === 'paused-failed' || state === 'failed-mid-run') {
    return { ...base, borderLeft: '3px solid var(--err)', cursor: state === 'paused-failed' ? 'default' : base.cursor }
  }

  if (state === 'fetching' || state === 'summarizing' || state === 'waiting' || state === 'skipped' || state === 'done') {
    return { ...base, cursor: 'default', ...(state === 'skipped' ? { opacity: 0.5 } : {}) }
  }

  if (state === 'selected') {
    return {
      ...base,
      background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))',
      borderLeft: '3px solid var(--accent)',
      ...(hovered && { background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))' }),
    }
  }

  if (state === 'failed') {
    return { ...base, borderLeft: '3px solid var(--err)', ...(hovered && { background: 'var(--surface-alt)' }) }
  }

  if (state === 'config-error') {
    return { ...base, borderLeft: '3px solid var(--warn)', ...(hovered && { background: 'var(--surface-alt)' }) }
  }

  return { ...base, ...(hovered && { background: 'var(--surface-alt, rgba(0,0,0,0.02))' }) }
}

function RowMetric({ state, props, t }: { state: CardState; props: SensorCardProps; t: TFn }) {
  const { liveSensor, itemCount, fetchError, summaryError, isConfigError } = props
  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem', fontWeight: 600 }

  switch (state) {
    case 'healthy':
    case 'selected':
      return <span style={{ ...mono, color: 'var(--ink)' }}>{itemCount}</span>
    case 'disabled':
      return (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.0625rem' }}>
          <span style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)' }}>{t('sensor.disabled')}</span>
          <span style={{ fontSize: '0.5625rem', color: 'var(--ink-faint)', fontStyle: 'italic' }}>{t('sensor.disabled_reason')}</span>
        </span>
      )
    case 'config-error':
      return (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.0625rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <ErrorBadge kind="config" t={t} />
            <span style={{ fontSize: '0.6875rem', color: 'var(--warn)' }}>{t('sensor.needs_api_key')}</span>
          </span>
          <span style={{ fontSize: '0.5625rem', color: 'var(--ink-faint)', fontStyle: 'italic' }}>{t('sensor.needs_api_key_reason')}</span>
        </span>
      )
    case 'failed':
      return (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.0625rem', maxWidth: 300 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <ErrorBadge kind={isConfigError ? 'config' : 'api'} isSummaryError={!fetchError && !!summaryError} t={t} />
            <span style={{ fontSize: '0.6875rem', color: 'var(--err)' }}>{t('sensor.failed')}</span>
          </span>
          <span style={{ fontSize: '0.5625rem', color: 'var(--err)', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'right' }}>
            {fetchError || summaryError}
          </span>
        </span>
      )
    case 'fetching': {
      const retrying = props.isRetrying
      const label = retrying ? t('sensor.retrying') : t('sensor.fetching')
      const color = retrying ? 'var(--warn)' : 'var(--accent)'
      return (
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6875rem', color, fontWeight: 500 }}>{label}</span>
          {liveSensor && <span style={{ ...mono, fontSize: '0.6875rem', color: 'var(--ink-faint)' }}>{liveSensor.item_count}</span>}
          {liveSensor?.fetch_detail && (
            <span style={{ fontSize: '0.625rem', color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
              {liveSensor.fetch_detail}
            </span>
          )}
        </span>
      )
    }
    case 'summarizing':
      return <span style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontWeight: 500 }}>{t('sensor.summarizing')}</span>
    case 'waiting':
      return props.isRetrying
        ? <span style={{ fontSize: '0.6875rem', color: 'var(--warn)', fontWeight: 500 }}>{t('sensor.retrying')}{'\u2026'}</span>
        : <span style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)' }}>{t('sensor.queued')}</span>
    case 'skipped':
      return (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.0625rem' }}>
          <span style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)' }}>{t('sensor.skipped')}</span>
          <span style={{ fontSize: '0.5625rem', color: 'var(--ink-faint)', fontStyle: 'italic' }}>{t('sensor.skipped_reason')}</span>
        </span>
      )
    case 'done':
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <span style={{ ...mono, color: 'var(--ink)' }}>{liveSensor?.item_count ?? itemCount}</span>
          <span style={{ fontSize: '0.5625rem', fontWeight: 600, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '0.0625rem 0.3125rem', borderRadius: 3 }}>{t('sensor.done')}</span>
        </span>
      )
    case 'failed-mid-run':
    case 'paused-failed':
      return (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.0625rem', maxWidth: 300 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <ErrorBadge kind={liveSensor?.fetch_error_kind ?? undefined} isSummaryError={!liveSensor?.fetch_error && !!liveSensor?.summary_error} t={t} />
            <span style={{ fontSize: '0.6875rem', color: 'var(--err)' }}>{t('sensor.failed')}</span>
          </span>
          {(liveSensor?.fetch_error || liveSensor?.summary_error) && (
            <span style={{ fontSize: '0.5625rem', color: 'var(--err)', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'right' }}>
              {liveSensor?.fetch_error || liveSensor?.summary_error}
            </span>
          )}
        </span>
      )
  }
}

function RowActions({ state, props, t }: { state: CardState; props: SensorCardProps; t: TFn }) {
  const { lastFetchAgo, onRetry, onSkip, onSkipFetching, onDismiss, liveSensor } = props
  const fetchColor = props.isFreshFetch ? 'var(--ok)' : 'var(--warn)'

  if (state === 'healthy' || state === 'selected') {
    return lastFetchAgo ? <span style={{ fontSize: '0.6875rem', color: fetchColor, whiteSpace: 'nowrap' }}>{lastFetchAgo}</span> : null
  }

  if (state === 'fetching') {
    const startedAt = liveSensor?.fetch_started_at
    const elapsedSec = startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0
    if (onSkipFetching && elapsedSec >= 60) {
      return (
        <button style={dismissButtonStyle} onClick={(e) => { e.stopPropagation(); onSkipFetching() }}>{t('sensor.skip')}</button>
      )
    }
    return null
  }

  if (state === 'failed') {
    const countdown = props.autoRetryCountdown
    const hasCountdown = countdown != null && countdown > 0
    return (onRetry || onDismiss || hasCountdown) ? (
      <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
        {hasCountdown && (
          <span style={{ fontSize: '0.6875rem', color: 'var(--accent)', opacity: 0.7, whiteSpace: 'nowrap' }}>
            ⟳ {t('sensor.autoRetryIn', { seconds: String(countdown) })}
          </span>
        )}
        {onRetry && <button style={retryButtonStyle} onClick={(e) => { e.stopPropagation(); onRetry() }}>{t('sensor.retry')}</button>}
        {onDismiss && <button style={dismissButtonStyle} onClick={(e) => { e.stopPropagation(); onDismiss() }}>{t('sensor.dismiss')}</button>}
      </div>
    ) : null
  }

  if (state === 'paused-failed') {
    return (
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        {onRetry && <button style={retryButtonStyle} onClick={(e) => { e.stopPropagation(); onRetry() }}>{t('sensor.retry')}</button>}
        {onSkip && <button style={dismissButtonStyle} onClick={(e) => { e.stopPropagation(); onSkip() }}>{t('sensor.skip')}</button>}
      </div>
    )
  }

  if (state === 'failed-mid-run') {
    return onRetry ? (
      <button style={retryButtonStyle} onClick={(e) => { e.stopPropagation(); onRetry() }}>{t('sensor.retry')}</button>
    ) : (
      <span style={{ fontSize: '0.6875rem', color: 'var(--accent)', opacity: 0.7 }}>
        ⟳ {t('sensor.autoRetry')}
      </span>
    )
  }

  return null
}

export const SensorRow = memo(function SensorRow(props: SensorCardProps) {
  const { t } = useTranslation()
  const { label, category, isDisabled, isRunning, isPaused, onToggleSelect } = props
  const state = deriveState(props)
  const isClickable = !isDisabled && !isRunning && !isPaused

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={state === 'failed-mid-run' ? 'sensor-card-flash' : undefined}
      style={rowContainerStyle(state, false)}
      onClick={() => { if (isClickable) onToggleSelect() }}
      onKeyDown={(e) => { if (isClickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggleSelect() } }}
      onMouseEnter={(e) => { if (isClickable) Object.assign(e.currentTarget.style, { background: rowContainerStyle(state, true).background }) }}
      onMouseLeave={(e) => { if (isClickable) Object.assign(e.currentTarget.style, { background: rowContainerStyle(state, false).background }) }}
    >
      {state === 'selected' ? (
        <span style={{ width: DOT_SIZE, height: DOT_SIZE, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', color: 'var(--accent)', fontWeight: 700 }}>{'\u2713'}</span>
      ) : (
        <Dot state={state} />
      )}
      <span style={{ ...nameStyle, fontSize: '0.8125rem', minWidth: 120, maxWidth: 140, ...(state === 'selected' ? { color: 'var(--accent)' } : {}) }}>{label}</span>
      <span style={categoryBadgeStyle}>{category}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ width: 48, textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
          <RowMetric state={state} props={props} t={t} />
        </span>
        <span style={{ width: 72, textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
          <RowActions state={state} props={props} t={t} />
        </span>
      </span>
    </div>
  )
})
