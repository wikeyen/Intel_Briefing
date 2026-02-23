// ABOUTME: Foldable section wrapper for the Sources page.
// ABOUTME: Collapsible card with header showing title, enabled count, and chevron.
'use client'
import { useState, type ReactNode } from 'react'

interface FoldableSectionProps {
  title: string
  enabledCount: number
  totalCount: number
  children: ReactNode
  defaultOpen?: boolean
}

export function FoldableSection({ title, enabledCount, totalCount, children, defaultOpen = true }: FoldableSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '0.25rem 0',
          marginBottom: open ? '0.375rem' : 0,
          cursor: 'pointer',
        }}
      >
        <span style={{
          fontSize: '0.875rem',
          color: 'var(--ink-faint)',
          transition: 'transform 150ms',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>
          ▶
        </span>
        <span style={{
          fontSize: '0.625rem',
          fontWeight: 600,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
        }}>
          {title}
        </span>
        <span style={{
          fontSize: '0.5625rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--ink-faint)',
          marginLeft: '0.25rem',
        }}>
          {enabledCount} / {totalCount}
        </span>
      </button>
      {open && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-card)',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}
