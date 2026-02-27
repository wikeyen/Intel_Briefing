// ABOUTME: Compact pill-shaped numeric input for sensor limits and lookback hours.
// ABOUTME: Extracted from Sensors.tsx for reuse across GroupCard and SensorDragItem.
'use client'
import { useState, useRef } from 'react'

export interface PillInputProps {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (v: number) => void
}

export function PillInput({ label, value, min, max, suffix, onChange }: PillInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    if (!isNaN(n) && n >= min) {
      onChange(Math.max(min, Math.min(max, n)))
    }
    setDraft(null)
  }

  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.1875rem',
      borderRadius: 999,
      border: '1px solid var(--border)',
      background: 'var(--canvas)',
      padding: '0.125rem 0.375rem',
      fontSize: '0.6875rem',
      lineHeight: 1,
      cursor: 'text',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>{label}</span>
      <input
        ref={inputRef}
        type="number"
        min={min}
        max={max}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); inputRef.current?.blur() } }}
        style={{
          width: suffix ? 26 : 30,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--ink)',
          fontSize: '0.6875rem',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontWeight: 600,
          textAlign: 'right',
          outline: 'none',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          MozAppearance: 'textfield' as any,
        }}
      />
      {suffix && (
        <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>{suffix}</span>
      )}
    </label>
  )
}
