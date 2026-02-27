// ABOUTME: Inline form for creating or editing a source group.
// ABOUTME: Renders name input, color palette, analysis toggle pills, and submit/cancel buttons.
'use client'
import { useState, useRef, useEffect } from 'react'
import type { CreateGroupPayload } from '@/lib/groups/types'
import { useTranslation } from '@/lib/i18n'
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

/** Analysis toggle definitions for the form. */
const FORM_TOGGLES = [
  { key: 'trend_enabled' as const, i18nKey: 'sources.workflow_trend' },
  { key: 'topic_enabled' as const, i18nKey: 'sources.workflow_topic' },
  { key: 'social_enabled' as const, i18nKey: 'sources.workflow_social' },
  { key: 'sentiment_enabled' as const, i18nKey: 'sources.workflow_sentiment' },
] as const

interface GroupFormInitial {
  name: string
  color: string
  trend_enabled: boolean
  topic_enabled: boolean
  social_enabled: boolean
  sentiment_enabled: boolean
}

interface GroupFormProps {
  initial?: GroupFormInitial
  parentId?: string | null
  onSubmit: (data: CreateGroupPayload) => void
  onCancel: () => void
}

export function GroupForm({ initial, parentId, onSubmit, onCancel }: GroupFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? COLOR_PRESETS[0])
  const [trendEnabled, setTrendEnabled] = useState(initial?.trend_enabled ?? false)
  const [topicEnabled, setTopicEnabled] = useState(initial?.topic_enabled ?? false)
  const [socialEnabled, setSocialEnabled] = useState(initial?.social_enabled ?? false)
  const [sentimentEnabled, setSentimentEnabled] = useState(initial?.sentiment_enabled ?? true)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus name input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /** Toggle state setters by key. */
  const toggleSetters: Record<string, (fn: (prev: boolean) => boolean) => void> = {
    trend_enabled: setTrendEnabled,
    topic_enabled: setTopicEnabled,
    social_enabled: setSocialEnabled,
    sentiment_enabled: setSentimentEnabled,
  }

  const toggleValues: Record<string, boolean> = {
    trend_enabled: trendEnabled,
    topic_enabled: topicEnabled,
    social_enabled: socialEnabled,
    sentiment_enabled: sentimentEnabled,
  }

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
      parent_id: parentId ?? null,
      trend_enabled: trendEnabled,
      topic_enabled: topicEnabled,
      social_enabled: socialEnabled,
      sentiment_enabled: sentimentEnabled,
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
          placeholder={t('sources.group_name')}
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
          {t('sources.group_color')}
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

      {/* Analysis toggles */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink-muted)',
          marginBottom: '0.375rem',
        }}>
          {t('sources.workflow_analysis')}
        </div>
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {FORM_TOGGLES.map(toggle => {
            const isEnabled = toggleValues[toggle.key]
            return (
              <button
                key={toggle.key}
                type="button"
                onClick={() => toggleSetters[toggle.key](prev => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.625rem',
                  borderRadius: 999,
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 120ms, color 120ms',
                  ...(isEnabled
                    ? {
                        background: 'var(--accent)',
                        color: 'white',
                        border: '1px solid var(--accent)',
                      }
                    : {
                        background: 'none',
                        color: 'var(--ink-muted)',
                        border: '1px solid var(--border)',
                      }),
                }}
              >
                {t(toggle.i18nKey)}
              </button>
            )
          })}
        </div>
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
