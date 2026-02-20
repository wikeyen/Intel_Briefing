// ABOUTME: Console component — displays sensor errors from the last pipeline run.
// ABOUTME: Shows error_kind badges (config vs api), error messages, and sensor names in a log-style layout.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import type { PipelineStatus } from '@/api/client'
import { Pagination } from './Pagination'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'

const MAX_ERRORS = 100
const PAGE_SIZE = 20

/** Threshold (chars) above which error messages are truncated with a "more" toggle. */
const TRUNCATE_LENGTH = 120

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

function ErrorRow({ entry }: { entry: { name: string; error: string; kind: 'config' | 'api' | null } }) {
  const label = SENSOR_LABELS[entry.name] ?? entry.name
  const msg = entry.error
  const isLong = msg.length > TRUNCATE_LENGTH
  const [expanded, setExpanded] = useState(false)

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
      <KindBadge kind={entry.kind} />

      {/* Error message with optional expand toggle */}
      <span style={{
        fontSize: '0.75rem',
        fontFamily: 'ui-monospace, monospace',
        color: 'var(--ink-muted)',
        lineHeight: 1.5,
        wordBreak: 'break-word',
        minWidth: 0,
      }}>
        {isLong && !expanded ? msg.slice(0, TRUNCATE_LENGTH) + '\u2026' : msg}
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              display: 'inline',
              marginLeft: '0.375rem',
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: 'var(--accent)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            {expanded ? 'less' : 'more'}
          </button>
        )}
      </span>
    </div>
  )
}

export function Console() {
  const [status, setStatus] = useState<PipelineStatus | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const load = () => {
      api.getPipelineStatus().then(setStatus).catch(() => {})
    }
    load()
    const iv = setInterval(load, 5_000)
    return () => clearInterval(iv)
  }, [])

  // Build errors from both fetch and summary stages, capped at MAX_ERRORS
  const allErrors: Array<{ name: string; error: string; kind: 'config' | 'api' | null }> = []
  for (const s of (status?.sensors ?? [])) {
    if (s.fetch_error) allErrors.push({ name: s.name, error: s.fetch_error, kind: s.fetch_error_kind })
    if (s.summary_error) allErrors.push({ name: s.name, error: s.summary_error, kind: null })
  }
  const errors = allErrors.slice(0, MAX_ERRORS)
  const configErrors = errors.filter(e => e.kind === 'config')
  const apiErrors = errors.filter(e => e.kind !== 'config')

  // Paginate the combined error list
  const totalPages = Math.ceil(errors.length / PAGE_SIZE)
  const currentPage = Math.min(page, totalPages || 1)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  // For a flat pagination across both groups: compute which items fall on the current page
  const pagedErrors = errors.slice(pageStart, pageStart + PAGE_SIZE)
  const pagedConfigErrors = pagedErrors.filter(e => e.kind === 'config')
  const pagedApiErrors = pagedErrors.filter(e => e.kind !== 'config')

  const runTime = status?.completed_at
    ? new Date(status.completed_at).toLocaleString()
    : status?.started_at
      ? `running since ${new Date(status.started_at).toLocaleString()}`
      : null

  return (
    <section id="console" style={{ padding: '4.5rem 0' }}>

      {/* Page header (hidden on mobile — shown in top bar) */}
      <div className="page-header" style={{ marginBottom: '2rem' }}>
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
          {pagedConfigErrors.length > 0 && (
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
              {pagedConfigErrors.map((e, i) => <ErrorRow key={`${e.name}-cfg-${i}`} entry={e} />)}
            </div>
          )}

          {/* API errors */}
          {pagedApiErrors.length > 0 && (
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
              {pagedApiErrors.map((e, i) => <ErrorRow key={`${e.name}-api-${i}`} entry={e} />)}
            </div>
          )}

          {/* Summary + pagination */}
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

          <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </section>
  )
}
