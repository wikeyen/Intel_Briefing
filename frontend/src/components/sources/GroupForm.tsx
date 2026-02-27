// ABOUTME: Inline form for creating or editing a source group.
// ABOUTME: Renders name input, color palette, processing type select, and submit/cancel buttons.
'use client'
import { useState, useRef, useEffect } from 'react'
import type { GroupProcessing, CreateGroupPayload } from '@/lib/groups/types'
import { GROUP_CARD } from './group-styles'

/** 8 preset colors for group color selection. */
const COLOR_PRESETS = [
  '#1A7A6D',
  '#2E7D9A',
  '#C4851C',
  '#7E6B9A',
  '#3D9E85',
  '#C4606E',
  '#5B7553',
  '#8B6C5C',
] as const

/** Processing type options with display labels. */
const PROCESSING_OPTIONS: { value: GroupProcessing; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'trend', label: 'Trend' },
  { value: 'topic', label: 'Topic' },
  { value: 'social', label: 'Social' },
  { value: 'research', label: 'Research' },
  { value: 'news', label: 'News' },
  { value: 'opinion', label: 'Opinion' },
]

interface GroupFormProps {
  initial?: { name: string; color: string; processing: GroupProcessing }
  parentId?: string | null
  onSubmit: (data: CreateGroupPayload) => void
  onCancel: () => void
}

export function GroupForm({ initial, parentId, onSubmit, onCancel }: GroupFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? COLOR_PRESETS[0])
  const [processing, setProcessing] = useState<GroupProcessing>(initial?.processing ?? 'general')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus name input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Group name is required')
      return
    }
    if (trimmed.length > 50) {
      setError('Group name must be 50 characters or less')
      return
    }
    setError(null)
    onSubmit({
      name: trimmed,
      color,
      processing,
      parent_id: parentId ?? null,
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{
      ...GROUP_CARD,
      border: '2px solid var(--accent)',
      padding: '1rem 1.25rem',
    }}>
      {/* Name input */}
      <div style={{ marginBottom: '0.75rem' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Group name"
          value={name}
          onChange={e => { setName(e.target.value); setError(null) }}
          maxLength={50}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--ink)',
            background: 'var(--canvas)',
            border: error ? '1px solid var(--err)' : '1px solid var(--border)',
            borderRadius: 8,
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color 120ms',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = error ? 'var(--err)' : 'var(--accent)'; e.currentTarget.style.boxShadow = 'var(--focus-ring)' }}
          onBlur={e => { e.currentTarget.style.borderColor = error ? 'var(--err)' : 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
        />
        {error && (
          <div style={{ fontSize: '0.6875rem', color: 'var(--err)', marginTop: '0.25rem' }}>
            {error}
          </div>
        )}
      </div>

      {/* Color palette */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink-muted)',
          marginBottom: '0.375rem',
        }}>
          Color
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {COLOR_PRESETS.map(preset => (
            <button
              key={preset}
              type="button"
              onClick={() => setColor(preset)}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: preset,
                border: color === preset ? '2px solid var(--ink)' : '2px solid transparent',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'border-color 120ms',
              }}
              aria-label={`Select color ${preset}`}
            >
              {color === preset && (
                <svg width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Processing type */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink-muted)',
          marginBottom: '0.375rem',
        }}>
          Processing type
        </div>
        <select
          value={processing}
          onChange={e => setProcessing(e.target.value as GroupProcessing)}
          style={{
            padding: '0.375rem 0.625rem',
            fontSize: '0.8125rem',
            color: 'var(--ink)',
            background: 'var(--canvas)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            outline: 'none',
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          {PROCESSING_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '0.375rem 0.875rem',
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: 'var(--ink-muted)',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={{
            padding: '0.375rem 0.875rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'white',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)' }}
        >
          {initial ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  )
}
