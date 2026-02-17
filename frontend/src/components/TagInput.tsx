// ABOUTME: Reusable tag-input component — Swiss-spa style chips with warm accent tones.
// ABOUTME: Supports add-on-enter/blur, remove-on-click, and optional validation.
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
            <span key={tag} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              background: 'var(--accent-wash)',
              color: 'var(--accent-dim)',
              border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
              borderRadius: 2,
              fontSize: '0.75rem',
              fontWeight: 500,
              padding: '0.2rem 0.5rem',
            }}>
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                style={{
                  color: 'var(--ink-muted)',
                  fontSize: '0.875rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  transition: 'color 150ms',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--err)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
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
          background: 'var(--canvas)',
          border: '1px solid var(--border)',
          borderRadius: 2,
          padding: '0.625rem 0.75rem',
          fontSize: '0.9375rem',
          color: 'var(--ink)',
          outline: 'none',
          transition: 'border-color 150ms',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
      />
      {error && (
        <p style={{ fontSize: '0.6875rem', color: 'var(--err)', marginTop: '0.375rem' }}>
          {error}
        </p>
      )}
    </div>
  )
}
