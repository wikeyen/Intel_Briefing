// ABOUTME: Shared form style primitives — inputBase, focus/blur handlers, label components.
// ABOUTME: Eliminates duplication across AiSummary, Pipeline, ApiKeys, and Sensors.
import React from 'react'

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
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,107,79,0.1)'
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
