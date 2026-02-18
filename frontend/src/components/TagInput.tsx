// ABOUTME: Reusable tag-input component — chip pills with add-on-enter and remove-on-click.
// ABOUTME: Supports optional validation; uses design system tokens for consistent styling.
'use client'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  validate?: (value: string) => string | null
}

export function TagInput({ tags, onChange, placeholder = 'Add…', validate }: Props) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    const val = input.trim()
    if (!val) return
    if (validate) {
      const err = validate(val)
      if (err) { setError(err); return }
    }
    if (!tags.includes(val)) onChange([...tags, val])
    setInput('')
    setError(null)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1))
  }

  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.625rem' }}>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                background: 'var(--accent-wash)',
                color: 'var(--accent)',
                border: '1px solid rgba(29,107,79,0.2)',
                borderRadius: 4,
                fontSize: '0.8125rem',
                fontWeight: 500,
                padding: '0.25rem 0.625rem',
              }}
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                style={{
                  color: 'var(--accent-dim)',
                  fontSize: '1rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  transition: 'color 120ms',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--err)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-dim)' }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value); setError(null) }}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '0.75rem 1rem',
          fontSize: '0.9375rem',
          color: 'var(--ink)',
          outline: 'none',
          transition: 'border-color 120ms, box-shadow 120ms',
          fontFamily: 'inherit',
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'var(--accent)'
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,107,79,0.1)'
        }}
        onBlurCapture={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      />
      {error && (
        <p style={{ fontSize: '0.75rem', color: 'var(--err)', marginTop: '0.375rem' }}>
          {error}
        </p>
      )}
    </div>
  )
}
