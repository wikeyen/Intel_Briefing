// ABOUTME: Three stat cards for the Status dashboard — Last Run, Next Run, and Items Fetched.
// ABOUTME: Displays key metrics from health checks, config, and the latest report.
import type { HealthResponse, IntelReport, ConfigSettings } from '@/api/client'
import { timeAgo, nextFetchIn } from './time-helpers'

export interface StatCardsProps {
  health: HealthResponse | null
  report: IntelReport | null
  config: ConfigSettings | null
  totalItems: number
  okCount: number
  failedCount: number
}

export function StatCards({ health, report, config, totalItems, okCount, failedCount }: StatCardsProps) {
  return (
    <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>

      {/* Last Run */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: '3px solid var(--accent-dim)',
        borderRadius: 8,
        padding: '1.25rem 1.5rem',
      }}>
        <div style={{
          fontSize: '0.625rem',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          marginBottom: '0.75rem',
        }}>
          Last Run
        </div>
        {health?.last_fetch ? (
          <>
            <div style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--ink)',
              fontFamily: 'ui-monospace, monospace',
              marginBottom: '0.25rem',
            }}>
              {timeAgo(health.last_fetch)}
            </div>
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--ink-faint)',
              fontFamily: 'ui-monospace, monospace',
            }}>
              {health.last_fetch.slice(0, 16).replace('T', ' ')}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>Never</div>
        )}
      </div>

      {/* Next Run */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: '3px solid var(--accent-dim)',
        borderRadius: 8,
        padding: '1.25rem 1.5rem',
      }}>
        <div style={{
          fontSize: '0.625rem',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          marginBottom: '0.75rem',
        }}>
          Next Run
        </div>
        {config ? (
          <>
            <div style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--ink)',
              fontFamily: 'ui-monospace, monospace',
              marginBottom: '0.25rem',
            }}>
              {config.fetch_time}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
              {nextFetchIn(config.fetch_time, config.fetch_timezone)}
              <span style={{ color: 'var(--ink-faint)', marginLeft: '0.25rem' }}>{'\u00b7'} {config.fetch_timezone}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>Loading\u2026</div>
        )}
      </div>

      {/* Items Fetched */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: '3px solid var(--accent-dim)',
        borderRadius: 8,
        padding: '1.25rem 1.5rem',
      }}>
        <div style={{
          fontSize: '0.625rem',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          marginBottom: '0.75rem',
        }}>
          Items Fetched
        </div>
        {report ? (
          <>
            <div style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--ink)',
              fontFamily: 'ui-monospace, monospace',
              marginBottom: '0.25rem',
            }}>
              {totalItems}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
              <span style={{ color: 'var(--ok)' }}>{okCount} ok</span>
              {failedCount > 0 && (
                <span style={{ color: 'var(--err)', marginLeft: '0.5rem' }}>{failedCount} failed</span>
              )}
              <span style={{ color: 'var(--ink-faint)', marginLeft: '0.5rem' }}>sensors</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>
            {health && !health.last_fetch ? '\u2014' : 'Loading\u2026'}
          </div>
        )}
      </div>
    </div>
  )
}
