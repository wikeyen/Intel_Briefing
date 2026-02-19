// ABOUTME: Console component — displays sensor errors from the last pipeline run.
// ABOUTME: Shows error_kind badges (config vs api), error messages, and sensor names in a log-style layout.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import type { PipelineStatus, SensorProgress } from '@/api/client'

const SENSOR_LABELS: Record<string, string> = {
  hacker_news: 'Hacker News',
  arxiv: 'ArXiv AI',
  github: 'GitHub Trending',
  product_hunt: 'Product Hunt',
  v2ex: 'V2EX',
  hn_blogs: 'HN Blogs',
  grok: 'Grok',
  sources_36kr: '36Kr',
  wallstreetcn: 'WallStreetCN',
  politics: 'Accounts',
  topics: 'Topics',
}

function KindBadge({ kind }: { kind: 'config' | 'api' | null | undefined }) {
  const isConfig = kind === 'config'
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.5625rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      padding: '0.125rem 0.5rem',
      borderRadius: 3,
      color: isConfig ? 'var(--warn)' : 'var(--err)',
      background: isConfig ? 'var(--warn-bg)' : 'var(--err-bg)',
      border: `1px solid ${isConfig ? 'var(--warn)' : 'var(--err)'}`,
      opacity: 0.85,
      flexShrink: 0,
    }}>
      {isConfig ? 'config' : 'api'}
    </span>
  )
}

function ErrorRow({ sensor }: { sensor: SensorProgress }) {
  const label = SENSOR_LABELS[sensor.name] ?? sensor.name
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
      padding: '0.75rem 1.25rem',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Sensor name */}
      <span style={{
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: 'var(--ink)',
        minWidth: 120,
        flexShrink: 0,
      }}>
        {label}
      </span>

      {/* Error kind badge */}
      <KindBadge kind={sensor.error_kind} />

      {/* Error message */}
      <span style={{
        fontSize: '0.75rem',
        fontFamily: 'ui-monospace, monospace',
        color: 'var(--ink-muted)',
        lineHeight: 1.5,
        wordBreak: 'break-word',
        minWidth: 0,
      }}>
        {sensor.error}
      </span>
    </div>
  )
}

export function Console() {
  const [status, setStatus] = useState<PipelineStatus | null>(null)

  useEffect(() => {
    const load = () => {
      api.getPipelineStatus().then(setStatus).catch(() => {})
    }
    load()
    const iv = setInterval(load, 5_000)
    return () => clearInterval(iv)
  }, [])

  const errors = status?.sensors.filter(s => s.error !== null) ?? []
  const configErrors = errors.filter(s => s.error_kind === 'config')
  const apiErrors = errors.filter(s => s.error_kind !== 'config')

  const runTime = status?.completed_at
    ? new Date(status.completed_at).toLocaleString()
    : status?.started_at
      ? `running since ${new Date(status.started_at).toLocaleString()}`
      : null

  return (
    <section id="console" style={{ padding: '4.5rem 0' }}>

      {/* Page header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
          Console
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
          Sensor errors and warnings from the last pipeline run.
        </p>
      </div>

      {/* Timestamp */}
      {runTime && (
        <div style={{
          fontSize: '0.75rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--ink-faint)',
          marginBottom: '1rem',
        }}>
          Last run: {runTime}
        </div>
      )}

      {/* Error list */}
      {errors.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--ink-faint)',
          fontSize: '0.875rem',
        }}>
          {status ? 'No errors — all sensors reporting clean.' : 'Loading pipeline status…'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Config errors */}
          {configErrors.length > 0 && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderTop: '3px solid var(--warn)',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '0.75rem 1.25rem',
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--warn)',
              }}>
                Configuration ({configErrors.length})
              </div>
              {configErrors.map(s => <ErrorRow key={s.name} sensor={s} />)}
            </div>
          )}

          {/* API errors */}
          {apiErrors.length > 0 && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderTop: '3px solid var(--err)',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '0.75rem 1.25rem',
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--err)',
              }}>
                API Errors ({apiErrors.length})
              </div>
              {apiErrors.map(s => <ErrorRow key={s.name} sensor={s} />)}
            </div>
          )}

          {/* Summary */}
          <div style={{
            textAlign: 'center',
            fontSize: '0.8125rem',
            color: 'var(--ink-muted)',
            paddingTop: '0.25rem',
          }}>
            <span style={{
              fontWeight: 700,
              color: 'var(--ink)',
              fontFamily: 'ui-monospace, monospace',
            }}>
              {errors.length}
            </span>
            {' '}sensor{errors.length !== 1 ? 's' : ''} with issues
          </div>
        </div>
      )}
    </section>
  )
}
