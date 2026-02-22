// ABOUTME: System status strip — dense horizontal bar at the top of the Status page (Zone 1).
// ABOUTME: Shows health indicator, key metrics, and schedule/progress. Stat-cell grid on mobile.
'use client'

import type { HealthResponse, ConfigSettings } from '@/api/client'
import { STATUS_META } from './constants'
import { timeAgo, nextFetchIn } from './time-helpers'

export type Phase = 'idle' | 'fetching' | 'summarizing' | 'briefing' | 'stopping' | 'paused'

export interface StatusStripProps {
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
}

const PHASE_LABELS: Record<Phase, string> = {
  idle: '',
  fetching: 'Fetching',
  summarizing: 'Summarizing',
  briefing: 'Briefing',
  stopping: 'Stopping',
  paused: 'Paused',
}

export const STATUS_STRIP_CSS = `
.status-strip-mobile { display: none; }

@media (max-width: 768px) {
  .status-strip-desktop { display: none !important; }
  .status-strip-mobile { display: flex !important; }
}
`

const labelStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const metricValueStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--ink)',
}

const metricLabelStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--ink-faint)',
  marginLeft: '0.25rem',
}

/* ── Mobile stat cell styles ── */
const cellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.125rem',
  flex: 1,
  padding: '0.5rem 0',
}

const cellValueStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '1.125rem',
  fontWeight: 700,
  color: 'var(--ink)',
  lineHeight: 1,
}

const cellLabelStyle: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 500,
  color: 'var(--ink-faint)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

export function StatusStrip({
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
}: StatusStripProps) {
  const status = health?.status ?? 'no_data'
  const meta = STATUS_META[status] ?? STATUS_META.no_data
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const dotColor = isRunning ? 'var(--accent)' : meta.color
  const statusLabel = isRunning ? PHASE_LABELS[phase] || PHASE_LABELS.fetching : meta.label

  const schedule = config?.fetch_time
    ? nextFetchIn(config.fetch_time, config.fetch_timezone)
    : null

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STATUS_STRIP_CSS }} />

      {/* ── Desktop: horizontal bar (unchanged) ── */}
      <div
        className="status-strip status-strip-desktop page-padding"
        style={{
          position: 'relative',
          maxWidth: 1024,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          background: 'var(--canvas)',
          borderBottom: isRunning ? 'none' : '1px solid var(--border)',
          minHeight: 52,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span
            data-testid="strip-health-dot"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
              flexShrink: 0,
              animation: isRunning ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
            }}
          />
          <span style={{ ...labelStyle, color: dotColor }}>
            {statusLabel}
          </span>
        </div>

        <div
          className="status-strip-metrics"
          style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}
        >
          {isRunning ? (
            <>
              <span>
                <span style={metricValueStyle}>{progress.done}/{progress.total}</span>
                <span style={metricLabelStyle}>sensors</span>
              </span>
              {failedCount > 0 && (
                <span>
                  <span style={{ ...metricValueStyle, color: 'var(--err)' }}>{failedCount}</span>
                  <span style={{ ...metricLabelStyle, color: 'var(--err)' }}>failed</span>
                </span>
              )}
              {detail && (
                <span style={{
                  fontStyle: 'italic',
                  fontSize: '0.8125rem',
                  color: 'var(--ink-muted)',
                }}>
                  {detail}
                </span>
              )}
            </>
          ) : (
            <>
              <span>
                <span style={metricValueStyle}>{sourcesOk}/{sourcesTotal}</span>
                <span style={metricLabelStyle}>sources</span>
              </span>
              <span>
                <span style={metricValueStyle}>{totalItems}</span>
                <span style={metricLabelStyle}>items</span>
              </span>
              {health?.last_fetch && (
                <span>
                  <span style={metricValueStyle}>{timeAgo(health.last_fetch)}</span>
                </span>
              )}
            </>
          )}
        </div>

        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          {isRunning ? (
            <span
              data-testid="strip-progress-pct"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontWeight: 600,
                fontSize: '0.8125rem',
                color: 'var(--accent)',
              }}
            >
              {pct}%
            </span>
          ) : (
            <span
              data-testid="strip-schedule"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '0.75rem',
                color: 'var(--ink-muted)',
              }}
            >
              {schedule ? `Next: ${schedule}` : 'No schedule'}
            </span>
          )}
        </div>

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
              transition: 'width 300ms ease',
            }} />
          </div>
        )}
      </div>

      {/* ── Mobile: stat-cell card layout ── */}
      <div
        className="status-strip-mobile"
        style={{
          flexDirection: 'column',
          margin: '0 0.75rem',
          background: 'var(--surface)',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Header row: health + schedule */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: dotColor,
                flexShrink: 0,
                animation: isRunning ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
              }}
            />
            <span style={{ ...labelStyle, fontSize: '0.625rem', color: dotColor }}>
              {statusLabel}
            </span>
          </div>
          <span style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: '0.6875rem',
            color: 'var(--ink-faint)',
          }}>
            {isRunning ? `${pct}%` : (schedule ? `Next ${schedule}` : '')}
          </span>
        </div>

        {/* Stat cells */}
        <div style={{
          display: 'flex',
          borderTopWidth: 1,
          borderTopStyle: 'solid',
          borderTopColor: 'var(--border)',
        }}>
          {isRunning ? (
            <>
              <div style={cellStyle}>
                <span style={{ ...cellValueStyle, color: 'var(--accent)' }}>
                  {progress.done}/{progress.total}
                </span>
                <span style={cellLabelStyle}>sensors</span>
              </div>
              <div style={{
                width: 1,
                background: 'var(--border)',
                alignSelf: 'stretch',
                margin: '0.375rem 0',
              }} />
              <div style={cellStyle}>
                {failedCount > 0 ? (
                  <>
                    <span style={{ ...cellValueStyle, color: 'var(--err)' }}>{failedCount}</span>
                    <span style={{ ...cellLabelStyle, color: 'var(--err)' }}>failed</span>
                  </>
                ) : (
                  <>
                    <span style={cellValueStyle}>{pct}%</span>
                    <span style={cellLabelStyle}>complete</span>
                  </>
                )}
              </div>
              <div style={{
                width: 1,
                background: 'var(--border)',
                alignSelf: 'stretch',
                margin: '0.375rem 0',
              }} />
              <div style={cellStyle}>
                <span style={{ ...cellValueStyle, fontSize: '0.875rem', fontWeight: 500 }}>
                  {detail || PHASE_LABELS[phase] || '\u2014'}
                </span>
                <span style={cellLabelStyle}>current</span>
              </div>
            </>
          ) : (
            <>
              <div style={cellStyle}>
                <span style={cellValueStyle}>{sourcesOk}/{sourcesTotal}</span>
                <span style={cellLabelStyle}>sources</span>
              </div>
              <div style={{
                width: 1,
                background: 'var(--border)',
                alignSelf: 'stretch',
                margin: '0.375rem 0',
              }} />
              <div style={cellStyle}>
                <span style={cellValueStyle}>{totalItems}</span>
                <span style={cellLabelStyle}>items</span>
              </div>
              <div style={{
                width: 1,
                background: 'var(--border)',
                alignSelf: 'stretch',
                margin: '0.375rem 0',
              }} />
              <div style={cellStyle}>
                <span style={cellValueStyle}>
                  {health?.last_fetch ? timeAgo(health.last_fetch) : '\u2014'}
                </span>
                <span style={cellLabelStyle}>last fetch</span>
              </div>
            </>
          )}
        </div>

        {/* Progress bar at bottom when running */}
        {isRunning && (
          <div style={{
            height: 3,
            background: 'var(--border)',
          }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: 'var(--accent)',
              borderRadius: '0 2px 2px 0',
              transition: 'width 300ms ease',
            }} />
          </div>
        )}
      </div>
    </>
  )
}
