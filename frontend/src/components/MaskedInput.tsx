// ABOUTME: Masked input component for API keys — shows 20 dots for saved keys, with show/hide/edit functionality.
// ABOUTME: Extracted from ApiKeys.tsx for reuse; supports saved, revealed, and editing modes.
'use client'
import { useState, useRef } from 'react'
import { inputBase as _inputBase, focus, blur } from '@/components/form-styles'
import { useTranslation } from '@/lib/i18n'

export interface MaskedInputProps {
  label: string
  hint: string
  saved: boolean        // true if a key is stored on the server
  newValue: string      // the value the user is typing (empty = no change pending)
  onNewValue: (v: string) => void
  onReveal: () => Promise<string>
}

const inputBase: React.CSSProperties = { ..._inputBase, width: '100%', fontFamily: 'ui-monospace, monospace' }

const PLACEHOLDER_STARS = '\u2219'.repeat(20)

// mode: 'saved' = key exists, showing 20 dots | 'revealed' = showing real value | 'editing' = user typing new key
type Mode = 'saved' | 'revealed' | 'editing'

export function MaskedInput({ label, hint, saved, newValue, onNewValue, onReveal }: MaskedInputProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>(saved ? 'saved' : 'editing')
  const [realValue, setRealValue] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // When parent reloads after save, reset back to saved/editing based on new saved state.
  // Tracks previous prop value via ref — no useEffect needed.
  const prevSavedRef = useRef(saved)
  if (prevSavedRef.current !== saved) {
    prevSavedRef.current = saved
    setMode(saved ? 'saved' : 'editing')
    setRealValue(null)
  }

  const handleShowHide = async () => {
    if (mode === 'revealed') {
      setMode('saved')
      return
    }
    if (mode === 'saved') {
      setLoading(true)
      try {
        const real = await onReveal()
        setRealValue(real)
        setMode('revealed')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleChange = () => {
    setMode('editing')
    setRealValue(null)
    onNewValue('')
  }

  const handleCancelChange = () => {
    setMode('saved')
    onNewValue('')
  }

  if (mode === 'saved' || mode === 'revealed') {
    const displayValue = mode === 'revealed' && realValue !== null ? realValue : PLACEHOLDER_STARS
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
          <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', fontFamily: 'inherit' }}>
            {label}
          </label>
          <span style={{
            fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--ok)', background: 'var(--ok-bg)',
            padding: '0.15rem 0.5rem', borderRadius: 999,
          }}>
            {t('masked.saved')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <input
            readOnly
            type="text"
            value={displayValue}
            style={{
              ...inputBase,
              color: mode === 'revealed' ? 'var(--ink)' : 'var(--ink-faint)',
              letterSpacing: mode === 'revealed' ? 'normal' : '0.15em',
              cursor: 'default',
            }}
          />
          <button
            type="button"
            onClick={handleShowHide}
            disabled={loading}
            style={{
              fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)',
              padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 4,
              background: 'var(--surface)', whiteSpace: 'nowrap', cursor: 'pointer',
              transition: 'color 120ms', flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
          >
            {loading ? '\u2026' : mode === 'revealed' ? t('masked.hide') : t('masked.show')}
          </button>
          <button
            type="button"
            onClick={handleChange}
            style={{
              fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)',
              padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 4,
              background: 'var(--surface)', whiteSpace: 'nowrap', cursor: 'pointer',
              transition: 'color 120ms', flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
          >
            {t('masked.change')}
          </button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem', lineHeight: 1.5, fontFamily: 'inherit' }}>
          {hint}
        </p>
      </div>
    )
  }

  // editing mode
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.375rem', fontFamily: 'inherit' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: '0.625rem' }}>
        <input
          type="password"
          value={newValue}
          onChange={(e) => onNewValue(e.target.value)}
          placeholder={saved ? t('masked.placeholder_replace') : t('masked.placeholder_empty')}
          autoFocus={saved}
          style={inputBase}
          onFocus={focus}
          onBlur={blur}
        />
        {saved && (
          <button
            type="button"
            onClick={handleCancelChange}
            style={{
              fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)',
              padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 4,
              background: 'var(--surface)', whiteSpace: 'nowrap', cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
          >
            {t('masked.cancel')}
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem', lineHeight: 1.5, fontFamily: 'inherit' }}>
        {hint}
      </p>
    </div>
  )
}
