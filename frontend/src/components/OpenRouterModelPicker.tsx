// ABOUTME: OpenRouter model picker combobox — fetches cloud models and provides searchable dropdown.
// ABOUTME: Extracted from AiSummary.tsx to reduce file size.
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { inputBase, focus, blur } from '@/components/form-styles'

interface OpenRouterModel {
  id: string
  name: string
  promptPrice: number   // raw per-token cost (as returned by OpenRouter API)
  completionPrice: number // raw per-token cost (as returned by OpenRouter API)
  contextLength: number
}

const OPENROUTER_CACHE_TTL_MS = 5 * 60 * 1000
let openRouterCache: { models: OpenRouterModel[]; ts: number } | null = null

/** Format a raw per-token price string into a per-million-token display. */
function formatPrice(perToken: number): string {
  const n = Number(perToken) * 1_000_000
  if (n === 0) return 'free'
  if (n < 0.01) return '<$0.01'
  if (n < 1) return `$${n.toFixed(2)}`
  if (n < 10) return `$${n.toFixed(1)}`
  return `$${Math.round(n)}`
}

/** Format context length as e.g. "200K" or "1M". */
function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
  return `${Math.round(tokens / 1000)}K`
}

export function OpenRouterModelPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  const fetchModels = useCallback(async (bypassCache = false) => {
    if (!bypassCache && openRouterCache && Date.now() - openRouterCache.ts < OPENROUTER_CACHE_TTL_MS) {
      setModels(openRouterCache.models)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const parsed: OpenRouterModel[] = (data.data ?? []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        name: (m.name as string) ?? (m.id as string),
        promptPrice: Number((m.pricing as Record<string, string>)?.prompt ?? 0),
        completionPrice: Number((m.pricing as Record<string, string>)?.completion ?? 0),
        contextLength: (m.context_length as number) ?? 0,
      }))
      openRouterCache = { models: parsed, ts: Date.now() }
      setModels(parsed)
      if (parsed.length === 0) setError('No models returned')
    } catch {
      setError('Cannot reach OpenRouter')
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [])

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

  const lowerSearch = search.toLowerCase()
  const filtered = models.filter((m) =>
    m.id.toLowerCase().includes(lowerSearch) || m.name.toLowerCase().includes(lowerSearch),
  )

  const statusLine = loading
    ? 'Loading models…'
    : error
      ? error
      : `${models.length} model${models.length !== 1 ? 's' : ''} available`

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {/* Combobox input */}
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
          fontSize: '1.25rem',
          transition: 'transform 150ms',
          userSelect: 'none',
        }}>
          ▼
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
          onClick={(e) => { e.preventDefault(); fetchModels(true) }}
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
          {loading ? 'Loading…' : 'Refresh'}
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
            const selected = m.id === value
            return (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(m.id)
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
                  border: 'none',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border-soft)' : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--ink)',
                  transition: 'background 60ms',
                  font: 'inherit',
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
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}>
                  {m.id}
                </span>
                <span style={{
                  fontSize: '0.6875rem',
                  color: 'var(--ink-faint)',
                  fontFamily: 'ui-monospace, monospace',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {formatPrice(m.promptPrice)} / {formatPrice(m.completionPrice)}
                  {m.contextLength > 0 ? ` · ${formatContext(m.contextLength)}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
