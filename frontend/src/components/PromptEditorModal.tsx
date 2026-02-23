// ABOUTME: Full-page prompt editor modal with animated backdrop for editing long prompts.
// ABOUTME: Settings-row read mode with colored indicator; edit mode opens a centered modal overlay.
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const MODAL_CSS = `
@keyframes promptBackdropIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes promptModalSlideUp {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
`

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

function ChevronRightIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

/** Derive a stable hue from a string for the coloured indicator dot */
function labelHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return ((h % 360) + 360) % 360
}

export interface PromptEditorModalProps {
  /** Label shown in read mode and as the modal title */
  label: string
  /** Current prompt value (empty = using default) */
  value: string
  /** Default/placeholder prompt text shown when value is empty */
  defaultPrompt: string
  /** Called when the user saves a new value */
  onChange: (value: string) => void
  /** Whether this prompt has been customized */
  isCustom?: boolean
  /** Show a coloured dot derived from the label */
  showDot?: boolean
  /** Label for "customized" badge */
  customBadgeLabel?: string
  /** Label for "reset" action */
  resetLabel?: string
  /** Label for the cancel button */
  cancelLabel?: string
  /** Label for the save button */
  saveLabel?: string
}

export function PromptEditorModal({
  label,
  value,
  defaultPrompt,
  onChange,
  isCustom,
  showDot,
  customBadgeLabel = 'Customized',
  resetLabel = 'Reset to default',
  cancelLabel = 'Cancel',
  saveLabel = 'Save',
}: PromptEditorModalProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleOpen = useCallback(() => {
    setDraft(value)
    setOpen(true)
  }, [value])

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  const handleSave = useCallback(() => {
    onChange(draft)
    setOpen(false)
  }, [draft, onChange])

  const handleReset = useCallback(() => {
    setDraft('')
  }, [])

  /* Focus textarea on open */
  useEffect(() => {
    if (open && textareaRef.current) {
      const t = setTimeout(() => textareaRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  /* Lock body scroll + handle Escape */
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, handleClose])

  const dotColor = showDot ? `hsl(${labelHue(label)}, 55%, 55%)` : undefined

  return (
    <>
      {/* ── Read Mode — settings row ───────────────────────────── */}
      <button
        type="button"
        onClick={handleOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          padding: '0.5rem 0.125rem',
          cursor: 'pointer',
          borderRadius: 4,
          transition: 'background 100ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover, rgba(0,0,0,0.03))' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
      >
        {showDot && (
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
          }} />
        )}
        <span style={{
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: 'var(--ink)',
          flex: 1,
        }}>
          {label}
        </span>
        {isCustom && (
          <span style={{
            fontSize: '0.6875rem',
            color: 'var(--accent)',
            fontWeight: 500,
            flexShrink: 0,
          }}>
            {customBadgeLabel}
          </span>
        )}
        <span style={{ color: 'var(--ink-faint)', flexShrink: 0, opacity: 0.4 }}>
          <ChevronRightIcon size={14} />
        </span>
      </button>

      {/* ── Modal Overlay ─────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <style>{MODAL_CSS}</style>

          {/* Backdrop */}
          <div
            onClick={handleClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--bg, #f5f5f5)',
              opacity: 0.92,
              animation: 'promptBackdropIn 200ms ease both',
            }}
          />

          {/* Modal card */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 800,
              maxHeight: 'calc(100dvh - 4rem)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'promptModalSlideUp 250ms ease both',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1.25rem',
              borderBottom: '1px solid var(--border-soft)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {showDot && (
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }} />
                )}
                <h3 style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  margin: 0,
                }}>
                  {label}
                </h3>
                {draft !== '' && (
                  <span style={{
                    fontSize: '0.5625rem',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    padding: '0.0625rem 0.3125rem',
                    borderRadius: 3,
                    color: 'var(--accent)',
                    background: 'var(--accent-wash)',
                  }}>
                    {customBadgeLabel}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ink-muted)',
                  padding: 4,
                  borderRadius: 4,
                  transition: 'color 100ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-muted)' }}
              >
                <CloseIcon />
              </button>
            </div>

            {/* Textarea body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={defaultPrompt}
                rows={20}
                style={{
                  width: '100%',
                  minHeight: 300,
                  resize: 'none',
                  lineHeight: 1.7,
                  fontSize: '0.8125rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                  color: 'var(--ink)',
                  background: 'var(--bg, #fafafa)',
                  border: 'none',
                  outline: 'none',
                  padding: '1.25rem 1.5rem',
                }}
              />
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.625rem 1.25rem',
              borderTop: '1px solid var(--border-soft)',
              flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={handleReset}
                disabled={draft === ''}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: draft === '' ? 'var(--ink-disabled)' : 'var(--accent)',
                  background: 'none',
                  border: 'none',
                  cursor: draft === '' ? 'default' : 'pointer',
                  padding: 0,
                }}
              >
                {resetLabel}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    padding: '0.5rem 1rem',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--ink-muted)',
                    cursor: 'pointer',
                    transition: 'border-color 120ms, color 120ms',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--ink-faint)'
                    e.currentTarget.style.color = 'var(--ink)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--ink-muted)'
                  }}
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    padding: '0.5rem 1.25rem',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'opacity 120ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                >
                  {saveLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
