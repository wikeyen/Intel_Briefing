// ABOUTME: Console panel showing pipeline errors grouped by config and API categories.
// ABOUTME: Displays sensor fetch and summary errors from the last pipeline run.
import type { PipelineStatus } from '@/api/client'
import { ErrorRow } from './StageBadge'

export interface ConsoleProps {
  pipelineStatus: PipelineStatus | null
}

export function Console({ pipelineStatus }: ConsoleProps) {
  // Build errors from both fetch and summary stages
  const allErrors: Array<{ name: string; error: string; kind: 'config' | 'api' | null }> = []
  for (const s of (pipelineStatus?.sensors ?? [])) {
    if (s.fetch_error) allErrors.push({ name: s.name, error: s.fetch_error, kind: s.fetch_error_kind })
    if (s.summary_error) allErrors.push({ name: s.name, error: s.summary_error, kind: null })
  }
  const errors = allErrors.slice(0, 100)
  const configErrors = errors.filter(e => e.kind === 'config')
  const apiErrors = errors.filter(e => e.kind !== 'config')

  return (
    <div style={{ marginTop: '2rem' }}>
      <h3 style={{
        fontSize: '0.625rem',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--ink-faint)',
        marginBottom: '0.75rem',
      }}>
        Console
      </h3>

      {errors.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '1.25rem',
          textAlign: 'center',
          color: 'var(--ink-faint)',
          fontSize: '0.8125rem',
        }}>
          {pipelineStatus ? 'No errors \u2014 all sensors reporting clean.' : 'Loading pipeline status\u2026'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
              {configErrors.map((e, i) => <ErrorRow key={`${e.name}-cfg-${i}`} entry={e} />)}
            </div>
          )}

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
              {apiErrors.map((e, i) => <ErrorRow key={`${e.name}-api-${i}`} entry={e} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
