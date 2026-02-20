// ABOUTME: Badge and row components for pipeline stage visualization.
// ABOUTME: StageBadge shows fetch/summary stage state; KindBadge shows error classification; ErrorRow displays sensor errors.
'use client'
import { useState } from 'react'
import type { StageState } from '@/api/client'
import { SENSOR_LABEL_MAP, ERROR_TRUNCATE_LENGTH } from './constants'

export function KindBadge({ kind }: { kind: 'config' | 'api' | null | undefined }) {
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

export function ErrorRow({ entry }: { entry: { name: string; error: string; kind: 'config' | 'api' | null } }) {
  const label = SENSOR_LABEL_MAP[entry.name] ?? entry.name
  const msg = entry.error
  const isLong = msg.length > ERROR_TRUNCATE_LENGTH
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
      padding: '0.75rem 1.25rem',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: 'var(--ink)',
        minWidth: 120,
        flexShrink: 0,
      }}>
        {label}
      </span>
      <KindBadge kind={entry.kind} />
      <span style={{
        fontSize: '0.75rem',
        fontFamily: 'ui-monospace, monospace',
        color: 'var(--ink-muted)',
        lineHeight: 1.5,
        wordBreak: 'break-word',
        minWidth: 0,
      }}>
        {isLong && !expanded ? msg.slice(0, ERROR_TRUNCATE_LENGTH) + '...' : msg}
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

export function StageBadge({ state, label }: { state: StageState; label: string }) {
  const colors: Record<StageState, { dot: string; text: string }> = {
    queued: { dot: 'var(--border)', text: 'var(--ink-faint)' },
    running: { dot: 'var(--accent)', text: 'var(--ink-muted)' },
    ok: { dot: 'var(--ok)', text: 'var(--ok)' },
    failed: { dot: 'var(--err)', text: 'var(--err)' },
    skipped: { dot: 'var(--border)', text: 'var(--ink-faint)' },
  }
  const c = colors[state]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.6875rem' }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: state === 'skipped' ? 'none' : c.dot,
        border: state === 'skipped' ? '1px solid var(--border)' : 'none',
        flexShrink: 0,
        animation: state === 'running' ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
      }} />
      <span style={{ color: c.text, fontWeight: state === 'ok' || state === 'failed' ? 500 : 400 }}>
        {state === 'skipped' ? '\u2014' : label}
      </span>
    </span>
  )
}
