// ABOUTME: Shared form style primitives — inputBase, focus/blur handlers, label/indicator components.
// ABOUTME: Eliminates duplication across AiSummary, Pipeline, ApiKeys, and Sensors.
import React from 'react'
import type { AutoSaveStatus } from '@/lib/hooks/useAutoSave'

export const inputBase: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  color: 'var(--ink)',
  outline: 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
  fontFamily: 'inherit',
}

export function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = 'var(--focus-ring)'
}

export function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

export function SubLabel({ children }: { children: React.ReactNode }) {
  return React.createElement('div', {
    style: {
      fontSize: '0.6875rem',
      fontWeight: 700,
      letterSpacing: '0.09em',
      textTransform: 'uppercase' as const,
      color: 'var(--ink-faint)',
      marginBottom: '0.75rem',
    },
  }, children)
}

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return React.createElement('label', {
    style: { display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.375rem' },
  },
    children,
    hint ? React.createElement('span', {
      style: { fontSize: '0.75rem', fontWeight: 400, color: 'var(--ink-faint)' },
    }, hint) : null,
  )
}

export function HelpText({ children }: { children: React.ReactNode }) {
  return React.createElement('p', {
    style: { fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.25rem' },
  }, children)
}

const AUTO_SAVE_CONFIG: Record<Exclude<AutoSaveStatus, 'idle'>, { color: string; text: string }> = {
  saving: { color: 'var(--ink-faint)', text: 'Saving\u2026' },
  saved:  { color: 'var(--ok)',        text: 'Saved' },
  error:  { color: 'var(--err)',       text: 'Save failed' },
}

export function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
  if (status === 'idle') return null
  const cfg = AUTO_SAVE_CONFIG[status]
  return React.createElement('span', {
    style: {
      fontSize: '0.75rem',
      fontWeight: 500,
      color: cfg.color,
      transition: 'opacity 200ms',
    },
  }, cfg.text)
}
