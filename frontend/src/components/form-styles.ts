// ABOUTME: Shared form style primitives — inputBase, focus/blur handlers, label/indicator components.
// ABOUTME: Eliminates duplication across AiSummary, Pipeline, ApiKeys, and Sensors.
import React from 'react'
import type { AutoSaveStatus } from '@/lib/hooks/useAutoSave'

export const inputBase: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '0.75rem 1rem',
  fontSize: '0.9375rem',
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
      marginBottom: '1rem',
    },
  }, children)
}

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return React.createElement('label', {
    style: { display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' },
  },
    children,
    hint ? React.createElement('span', {
      style: { fontSize: '0.75rem', fontWeight: 400, color: 'var(--ink-faint)' },
    }, hint) : null,
  )
}

export function HelpText({ children }: { children: React.ReactNode }) {
  return React.createElement('p', {
    style: { fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.5rem' },
  }, children)
}

/* ─── SVG Chevron icons ───────────────────────────────────────────── */

/** Dropdown chevron (points down). size defaults to 16. */
export function ChevronDown({ size = 16, color = 'currentColor', className }: { size?: number; color?: string; className?: string }) {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round',
    className, style: { display: 'block', flexShrink: 0 },
  }, React.createElement('path', { d: 'M4 6l4 4 4-4' }))
}

/** Disclosure chevron (points right). size defaults to 16. */
export function ChevronRight({ size = 16, color = 'currentColor', className }: { size?: number; color?: string; className?: string }) {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round',
    className, style: { display: 'block', flexShrink: 0 },
  }, React.createElement('path', { d: 'M6 4l4 4-4 4' }))
}

/** Play icon (right-pointing triangle). size defaults to 16. */
export function PlayIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: color,
    style: { display: 'block', flexShrink: 0 },
  }, React.createElement('path', { d: 'M5 3l8 5-8 5V3z' }))
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
