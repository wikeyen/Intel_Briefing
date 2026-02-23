// ABOUTME: Ollama model picker combobox — fetches local models and provides searchable dropdown.
// ABOUTME: Extracted from AiSummary.tsx to reduce file size.
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/api/client'
import type { OllamaModelInfo } from '@/api/client'
import { inputBase, focus, blur } from '@/components/form-styles'

export function OllamaModelPicker({
  value,
  onChange,
  baseUrl,
}: {
  value: string
  onChange: (v: string) => void
  baseUrl: string
}) {
  const [models, setModels] = useState<OllamaModelInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ollamaBase = baseUrl.replace(/\/v1\/?$/, '')
      const result = await api.getOllamaModels(ollamaBase)
      setModels(result.models ?? [])
      if (result.models.length === 0) setError('No models found')
    } catch {
      setError('Cannot connect to Ollama')
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => { fetchModels() }, [fetchModels])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = models.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  )

  const statusLine = loading
    ? 'Scanning local models…'
    : error
      ? error
      : `${models.length} model${models.length !== 1 ? 's' : ''} available`

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {/* Combobox input — matches inputBase */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={open ? search : value}
          onChange={(e) => {
            setSearch(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={(e) => {
            setOpen(true)
            setSearch('')
            focus(e)
          }}
          onBlur={blur}
          placeholder="Type to search models…"
          style={{ ...inputBase, width: '100%', paddingRight: '2.25rem' }}
        />
        <span style={{
          position: 'absolute',
          right: '0.875rem',
          top: '50%',
          transform: `translateY(-50%) rotate(${open ? '180deg' : '0deg'})`,
          pointerEvents: 'none',
          color: 'var(--ink-faint)',
          fontSize: '0.75rem',
          transition: 'transform 150ms',
          userSelect: 'none',
        }}>
          ▾
        </span>
      </div>

      {/* Status line */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '0.375rem',
      }}>
        <span style={{ fontSize: '0.75rem', color: error ? 'var(--warn)' : 'var(--ink-faint)' }}>
          {statusLine}
        </span>
        <button
          onClick={(e) => { e.preventDefault(); fetchModels() }}
          disabled={loading}
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: loading ? 'var(--ink-faint)' : 'var(--accent)',
            background: 'none',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            padding: 0,
          }}
        >
          {loading ? 'Scanning…' : 'Rescan'}
        </button>
      </div>

      {/* Dropdown list */}
      {open && !loading && (
        <div style={{
          position: 'absolute',
          top: 'calc(2.75rem + 2px)',
          left: 0,
          right: 0,
          maxHeight: 260,
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          boxShadow: 'var(--shadow-md)',
          zIndex: 50,
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: '0.875rem 1rem', color: 'var(--ink-faint)', fontSize: '0.8125rem' }}>
              {search ? `No models matching "${search}"` : 'No models available'}
            </div>
          )}
          {filtered.map((m, idx) => {
            const selected = m.name === value
            return (
              <button
                key={m.name}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(m.name)
                  setOpen(false)
                  setSearch('')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  width: '100%',
                  padding: '0.625rem 1rem',
                  background: selected ? 'var(--accent-wash)' : 'transparent',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border-soft)' : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--ink)',
                  transition: 'background 60ms',
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = 'var(--surface-alt)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = selected ? 'var(--accent-wash)' : 'transparent'
                }}
              >
                <span style={{
                  fontSize: '0.8125rem',
                  fontWeight: selected ? 600 : 400,
                  color: selected ? 'var(--accent)' : 'var(--ink)',
                }}>
                  {m.name}
                </span>
                <span style={{
                  fontSize: '0.6875rem',
                  color: 'var(--ink-faint)',
                  fontFamily: 'ui-monospace, monospace',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {[m.size, m.quantization].filter(Boolean).join(' / ')}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
