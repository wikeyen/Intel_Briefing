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
  /** Current pipeline retry attempt (1-based). */
  retryAttempt?: number
  /** Maximum pipeline retry attempts. */
  retryMax?: number
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
  | 'fetched'
  | 'skipped'
  | 'cached'
  | 'done'
  | 'failed-mid-run'
  | 'paused-failed'

function deriveState(props: SensorCardProps): CardState {
  const { isRunning, isPaused, liveSensor, isDisabled, isConfigError, isFailed, isSelected } = props

  if (isDisabled) return 'disabled'

  if (isRunning) {
    if (!liveSensor) return props.isSkipped ? 'skipped' : 'healthy'
    // During pause, failed sensors get special interactive state
    if (isPaused && (liveSensor.fetch === 'failed' || liveSensor.summary === 'failed')) return 'paused-failed'
    if (liveSensor.fetch === 'failed' || liveSensor.summary === 'failed') return 'failed-mid-run'
    if (liveSensor.fetch_cached && (liveSensor.fetch === 'ok' || liveSensor.fetch === 'skipped') && (liveSensor.summary === 'ok' || liveSensor.summary === 'skipped')) return 'cached'
    if ((liveSensor.fetch === 'ok' || liveSensor.fetch === 'skipped') && (liveSensor.summary === 'ok' || liveSensor.summary === 'skipped')) return 'done'
    if (liveSensor.summary === 'running') return 'summarizing'
    if (liveSensor.fetch === 'running') return 'fetching'
    if ((liveSensor.fetch === 'ok' || liveSensor.fetch === 'skipped') && liveSensor.summary === 'queued') return 'fetched'
    return 'healthy'
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
    case 'fetched':
      return <span style={{ ...base, background: 'var(--ok)' }} />
    case 'skipped':
      return <span style={{ ...base, background: 'var(--ink-faint)', opacity: 0.5 }} />
    case 'cached':
      return <span style={{ ...base, background: 'var(--ink-faint)' }} />
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

  if (state === 'fetching' || state === 'summarizing' || state === 'waiting' || state === 'fetched' || state === 'cached' || state === 'done' || state === 'failed-mid-run') {
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
          {liveSensor && liveSensor.item_count > 0 && (
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

    case 'fetched':
      return (
        <span style={{ ...metricStyle, fontSize: '0.875rem' }}>
          {liveSensor && liveSensor.item_count > 0 ? liveSensor.item_count : <span style={{ color: 'var(--ink-faint)' }}>0</span>}
        </span>
      )

    case 'skipped':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          <span style={{ ...metricStyle, color: 'var(--ink-faint)', fontWeight: 400, fontSize: '0.75rem' }}>{t('sensor.skipped')}</span>
          <span style={reasonTextStyle}>{t('sensor.skipped_reason')}</span>
        </div>
      )

    case 'cached':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          <span style={{ ...metricStyle, fontSize: '0.875rem' }}>{liveSensor?.item_count ?? itemCount}</span>
          <span style={{ fontSize: '0.5625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-faint)' }}>{t('sensor.cached')}</span>
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
              <span className="auto-retry-spin">⟳</span> {t('sensor.autoRetryAttempt', { attempt: String(props.retryAttempt || 1), max: String(props.retryMax || 3) })}{liveSensor?.fetch_detail ? ` · ${liveSensor.fetch_detail}` : ''}
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
  // Subgrid row — inherits column tracks from parent .sensor-list grid.
  // State is communicated via the coloured dot, not a left-border indicator.
  const base: React.CSSProperties = {
    gridColumn: '1 / -1',
    display: 'grid',
    gridTemplateColumns: 'subgrid',
    alignItems: 'center',
    margin: '0 -1rem',
    padding: '0.6875rem 1rem',
    background: 'var(--surface)',
    borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
    transition: 'background 200ms ease',
    cursor: 'pointer',
    minHeight: 42,
  }

  if (state === 'disabled') return { ...base, opacity: 0.4, cursor: 'default' }

  if (state === 'paused-failed' || state === 'failed-mid-run') {
    return { ...base, cursor: state === 'paused-failed' ? 'default' : base.cursor }
  }

  if (state === 'fetching' || state === 'summarizing' || state === 'waiting' || state === 'fetched' || state === 'skipped' || state === 'cached' || state === 'done') {
    return { ...base, cursor: 'default', ...(state === 'skipped' ? { opacity: 0.5 } : {}) }
  }

  if (state === 'selected') {
    return {
      ...base,
      background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))',
      ...(hovered && { background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))' }),
    }
  }

  if (state === 'failed') {
    return { ...base, ...(hovered && { background: 'var(--surface-alt)' }) }
  }

  if (state === 'config-error') {
    return { ...base, ...(hovered && { background: 'var(--surface-alt)' }) }
  }

  return { ...base, ...(hovered && { background: 'var(--surface-alt, rgba(0,0,0,0.02))' }) }
}

function RowNote({ state, props, t }: { state: CardState; props: SensorCardProps; t: TFn }) {
  const { liveSensor, fetchError, summaryError, isConfigError } = props
  const noteStyle: React.CSSProperties = {
    fontSize: '0.6875rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
  }

  const okMark = '\u2713'

  switch (state) {
    case 'healthy':
    case 'selected':
      return null

    case 'done':
      return (
        <span style={{ ...noteStyle, color: 'var(--ok)', fontWeight: 500, fontSize: '0.625rem' }}>
          {okMark} {t('sensor.done')}
        </span>
      )

    case 'cached':
      return (
        <span style={{ ...noteStyle, color: 'var(--ink-faint)', fontSize: '0.625rem' }}>
          {okMark} {t('sensor.cached')}
        </span>
      )

    case 'fetched':
      return (
        <span style={{ ...noteStyle, color: 'var(--ink-faint)', fontSize: '0.625rem' }}>
          {okMark} {t('sensor.fetched_awaiting')}
        </span>
      )

    case 'disabled':
      return (
        <span style={{ ...noteStyle, color: 'var(--ink-faint)' }}>
          {t('sensor.disabled')}
          <span style={{ fontSize: '0.5625rem', fontStyle: 'italic', opacity: 0.7 }}>{t('sensor.disabled_reason')}</span>
        </span>
      )

    case 'config-error':
      return (
        <span style={noteStyle}>
          <ErrorBadge kind="config" t={t} />
          <span style={{ color: 'var(--warn)' }}>{t('sensor.needs_api_key')}</span>
          <span style={{ fontSize: '0.5625rem', color: 'var(--ink-faint)', fontStyle: 'italic', opacity: 0.7 }}>{t('sensor.needs_api_key_reason')}</span>
        </span>
      )

    case 'failed':
      return (
        <span style={noteStyle}>
          <ErrorBadge kind={isConfigError ? 'config' : 'api'} isSummaryError={!fetchError && !!summaryError} t={t} />
          <span style={{ color: 'var(--err)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fetchError || summaryError || t('sensor.failed')}
          </span>
        </span>
      )

    case 'failed-mid-run':
    case 'paused-failed':
      return (
        <span style={noteStyle}>
          <ErrorBadge kind={liveSensor?.fetch_error_kind ?? undefined} isSummaryError={!liveSensor?.fetch_error && !!liveSensor?.summary_error} t={t} />
          <span style={{ color: 'var(--err)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {liveSensor?.fetch_error || liveSensor?.summary_error || t('sensor.failed')}
          </span>
        </span>
      )

    case 'fetching': {
      const retrying = props.isRetrying
      const detail = liveSensor?.fetch_detail?.replace(/^Fetching\s+/i, '')
      return (
        <span style={{ ...noteStyle, color: retrying ? 'var(--warn)' : 'var(--accent)', fontWeight: 500, fontSize: '0.625rem' }}>
          {retrying ? t('sensor.retrying') : t('sensor.fetching')}
          {detail && <span style={{ fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}> · {detail}</span>}
        </span>
      )
    }

    case 'summarizing': {
      const total = liveSensor?.summary_chunks_total ?? 0
      const done = liveSensor?.summary_chunks_done ?? 0
      return (
        <span style={{ ...noteStyle, color: 'var(--accent)', fontWeight: 500, fontSize: '0.625rem' }}>
          {t('sensor.summarizing')}{total > 0 ? ` · ${t('sensor.chunks', { done: String(done), total: String(total) })}` : ''}
        </span>
      )
    }

    case 'waiting':
      return props.isRetrying
        ? <span style={{ ...noteStyle, color: 'var(--warn)', fontWeight: 500 }}>{t('sensor.retrying')}{'\u2026'}</span>
        : <span style={{ ...noteStyle, color: 'var(--ink-faint)' }}>{t('sensor.queued')}</span>

    case 'skipped':
      return (
        <span style={{ ...noteStyle, color: 'var(--ink-faint)' }}>
          {t('sensor.skipped')}
          <span style={{ fontSize: '0.5625rem', fontStyle: 'italic', opacity: 0.7 }}>{t('sensor.skipped_reason')}</span>
        </span>
      )
  }
}

function RowMetric({ state, props }: { state: CardState; props: SensorCardProps; t: TFn }) {
  const { liveSensor, itemCount } = props
  const pill: React.CSSProperties = {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '0.625rem',
    fontWeight: 600,
    background: 'var(--surface-alt)',
    padding: '0.125rem 0.4375rem',
    borderRadius: 9,
    lineHeight: 1.6,
    flexShrink: 0,
  }

  // States that never show a count
  if (state === 'disabled' || state === 'config-error' || state === 'skipped' || state === 'waiting') return null

  // During active fetch/summarize: show live count only when > 0
  if (state === 'fetching' || state === 'summarizing') {
    if (!liveSensor || liveSensor.item_count === 0) return null
    return <span style={{ ...pill, color: 'var(--ink-faint)' }}>{liveSensor.item_count}</span>
  }

  // Done/cached/fetched: show live count (or fallback to report count)
  if (state === 'done' || state === 'cached' || state === 'fetched') {
    const count = liveSensor?.item_count ?? itemCount
    return <span style={{ ...pill, color: count > 0 ? 'var(--ink-muted)' : 'var(--ink-faint)' }}>{count}</span>
  }

  // Failed mid-run / paused-failed: show live count if available
  if (state === 'failed-mid-run' || state === 'paused-failed') {
    const count = liveSensor?.item_count ?? 0
    if (count === 0) return null
    return <span style={{ ...pill, color: 'var(--ink-faint)' }}>{count}</span>
  }

  // Healthy / selected / failed (idle): show report count
  const count = itemCount
  if (count === 0 && state === 'failed') return null
  return <span style={{ ...pill, color: count > 0 ? 'var(--ink-muted)' : 'var(--ink-faint)' }}>{count}</span>
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
        <span className="auto-retry-spin">⟳</span> {t('sensor.autoRetryAttempt', { attempt: String(props.retryAttempt || 1), max: String(props.retryMax || 3) })}
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
        <span style={{ width: DOT_SIZE, height: DOT_SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', color: 'var(--accent)', fontWeight: 700 }}>{'\u2713'}</span>
      ) : (
        <Dot state={state} />
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', minWidth: 0 }}>
        <span style={{ ...nameStyle, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', ...(state === 'selected' ? { color: 'var(--accent)' } : {}) }}>{label}</span>
        <RowMetric state={state} props={props} t={t} />
      </span>
      <span className="sensor-col-note" style={{ overflow: 'hidden', minWidth: 0 }}>
        <RowNote state={state} props={props} t={t} />
      </span>
      <span style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
        <RowActions state={state} props={props} t={t} />
      </span>
    </div>
  )
})
