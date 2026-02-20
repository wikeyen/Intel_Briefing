// ABOUTME: AI Summary configuration page — LLM provider, model, API key, and connection test.
// ABOUTME: Includes collapsible prompt customization for per-sensor and overall summary prompts.
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/api/client'
import type { OllamaModelInfo } from '@/api/client'
import { DEFAULT_SENSOR_PROMPTS, DEFAULT_OVERALL_PROMPT } from '@/lib/summary/prompts'

import { useToast } from '@/lib/toast-context'

/* ─── Shared form primitives (matches Pipeline.tsx) ─────────────────── */

const inputBase: React.CSSProperties = {
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

function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,107,79,0.1)'
}
function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.6875rem',
      fontWeight: 700,
      letterSpacing: '0.09em',
      textTransform: 'uppercase',
      color: 'var(--ink-faint)',
      marginBottom: '1rem',
    }}>
      {children}
    </div>
  )
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
      {children}
      {hint && (
        <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--ink-faint)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
      {children}
    </p>
  )
}

/* ─── Ollama Model Combobox ─────────────────────────────────────────── */

function OllamaModelPicker({
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
          fontSize: '0.625rem',
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
          boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
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

/* ─── OpenRouter Model Picker ─────────────────────────────────────── */

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

function OpenRouterModelPicker({
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
          fontSize: '0.625rem',
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
          boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
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

/* ─── Prompt Customization Sub-components ───────────────────────────── */

const PROMPT_SENSORS: Array<{ key: string; label: string }> = [
  { key: 'hacker_news', label: 'Hacker News' },
  { key: 'arxiv', label: 'ArXiv AI' },
  { key: 'github', label: 'GitHub Trending' },
  { key: 'product_hunt', label: 'Product Hunt' },
  { key: 'v2ex', label: 'V2EX' },
  { key: 'hn_blogs', label: 'HN Blogs' },
  { key: 'sources_36kr', label: '36Kr' },
  { key: 'wallstreetcn', label: 'WallStreetCN' },
  { key: 'social_accounts', label: 'Social Accounts' },
  { key: 'social_topics', label: 'Social Topics' },
  { key: 'social_trends', label: 'Social Trends' },
  { key: 'chrome_radar', label: 'Chrome Radar' },
  { key: 'rss_feeds', label: 'RSS Feeds' },
]

function StatusBadge({ isCustom }: { isCustom: boolean }) {
  if (!isCustom) return null
  return (
    <span style={{
      fontSize: '0.625rem',
      fontWeight: 600,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      padding: '0.125rem 0.375rem',
      borderRadius: 3,
      color: 'var(--accent)',
      background: 'var(--accent-wash)',
      flexShrink: 0,
    }}>
      Customized
    </span>
  )
}

/* ─── Main Component ────────────────────────────────────────────────── */

export function AiSummary() {
  const showToast = useToast()

  const [summaryProvider, setSummaryProvider] = useState<'openrouter' | 'local' | null>(null)
  const [summaryBaseUrl, setSummaryBaseUrl] = useState('https://openrouter.ai/api/v1')
  const [summaryModel, setSummaryModel] = useState('anthropic/claude-sonnet-4')
  const [testingLlm, setTestingLlm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [sensorPrompts, setSensorPrompts] = useState<Record<string, string>>({})
  const [overallPrompt, setOverallPrompt] = useState('')
  const [promptsExpanded, setPromptsExpanded] = useState(false)
  const [expandedSensor, setExpandedSensor] = useState<string | null>(null)

  const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
  const OLLAMA_BASE_URL = 'http://localhost:11434/v1'

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setSummaryProvider(cfg.summary_provider ?? null)
      setSummaryBaseUrl(cfg.summary_base_url || OPENROUTER_BASE_URL)
      setSummaryModel(cfg.summary_model || 'anthropic/claude-sonnet-4')
      setSensorPrompts(cfg.summary_sensor_prompts ?? {})
      setOverallPrompt(cfg.summary_overall_prompt ?? '')
    })
  }, [])

  const handleProviderChange = (v: string) => {
    const provider = v === '' ? null : v as 'openrouter' | 'local'
    setSummaryProvider(provider)
    if (provider === 'openrouter') {
      setSummaryBaseUrl(OPENROUTER_BASE_URL)
      setSummaryModel('anthropic/claude-sonnet-4')
    } else if (provider === 'local') {
      setSummaryBaseUrl(OLLAMA_BASE_URL)
      setSummaryModel('')
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({
        summary_provider: summaryProvider,
        summary_base_url: summaryBaseUrl,
        summary_model: summaryModel,
        summary_sensor_prompts: sensorPrompts,
        summary_overall_prompt: overallPrompt,
      })
      showToast('AI summary settings saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const testLlm = async () => {
    setTestingLlm(true)
    try {
      await save()
      const result = await api.testSummary()
      if (result.ok) {
        showToast(`LLM connected (${result.latency_ms}ms)`)
      } else {
        showToast('LLM test failed: ' + (result.error ?? 'Unknown error'))
      }
    } catch (e) {
      showToast('LLM test failed: ' + (e as Error).message)
    } finally {
      setTestingLlm(false)
    }
  }

  const updateSensorPrompt = (sensorKey: string, value: string) => {
    setSensorPrompts(prev => {
      const next = { ...prev }
      if (value) {
        next[sensorKey] = value
      } else {
        delete next[sensorKey]
      }
      return next
    })
  }

  const isOllama = summaryProvider === 'local'
  const isEnabled = summaryProvider !== null

  return (
    <section id="ai-summary" style={{ padding: '4.5rem 0' }}>

      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
          AI Summary
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
          Generate per-source summaries and an executive briefing after each fetch using an LLM.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

        {/* ── Connection ─────────────────────────────────────── */}
        <div>
          <SubLabel>Connection</SubLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Provider + Model — side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="settings-grid-2col">
              <div>
                <FieldLabel>Provider</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select
                    value={summaryProvider ?? ''}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    style={{
                      ...inputBase,
                      width: '100%',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      paddingRight: '2.25rem',
                      cursor: 'pointer',
                    }}
                    onFocus={focus}
                    onBlur={blur}
                  >
                    <option value="">Disabled</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="local">Local (Ollama)</option>
                  </select>
                  <span style={{
                    position: 'absolute',
                    right: '0.875rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'var(--ink-faint)',
                    fontSize: '0.625rem',
                    userSelect: 'none',
                  }}>
                    ▾
                  </span>
                </div>
              </div>
              <div>
                <FieldLabel>Model</FieldLabel>
                {isOllama ? (
                  <OllamaModelPicker
                    value={summaryModel}
                    onChange={setSummaryModel}
                    baseUrl={summaryBaseUrl}
                  />
                ) : isEnabled ? (
                  <OpenRouterModelPicker
                    value={summaryModel}
                    onChange={setSummaryModel}
                  />
                ) : (
                  <input
                    type="text"
                    value={summaryModel}
                    disabled
                    placeholder="anthropic/claude-sonnet-4"
                    style={{
                      ...inputBase,
                      width: '100%',
                      opacity: 0.5,
                      cursor: 'not-allowed',
                    }}
                    onFocus={focus}
                    onBlur={blur}
                  />
                )}
              </div>
            </div>

            {/* Base URL */}
            {isEnabled && (
              <div>
                <FieldLabel>Base URL</FieldLabel>
                <input
                  type="text"
                  value={summaryBaseUrl}
                  onChange={(e) => setSummaryBaseUrl(e.target.value)}
                  placeholder={isOllama ? OLLAMA_BASE_URL : OPENROUTER_BASE_URL}
                  style={{ ...inputBase, width: '100%' }}
                  onFocus={focus}
                  onBlur={blur}
                />
                <HelpText>
                  {isOllama
                    ? 'Points to your local Ollama instance. Change if running on a different host or port.'
                    : 'OpenAI-compatible endpoint. Only change if using a custom proxy.'}
                </HelpText>
              </div>
            )}

            {/* Test Connection */}
            {isEnabled && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
              }}>
                <div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                    Connection Test
                  </span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', margin: '0.125rem 0 0' }}>
                    Saves settings, then sends a test prompt to verify the LLM responds.
                  </p>
                </div>
                <button
                  onClick={testLlm}
                  disabled={testingLlm || saving}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    padding: '0.375rem 0.875rem',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    color: (testingLlm || saving) ? 'var(--ink-faint)' : 'var(--ink-muted)',
                    background: 'var(--surface)',
                    cursor: (testingLlm || saving) ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    marginLeft: '1.5rem',
                    transition: 'color 120ms, border-color 120ms',
                  }}
                >
                  {testingLlm ? 'Testing…' : 'Test Now'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Prompt Customization ──────────────────────────── */}
        {isEnabled && (
          <>
            <div style={{ height: 1, background: 'var(--border-soft)' }} />

            <div>
              <SubLabel>Prompts</SubLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* Overall Prompt */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <FieldLabel>Executive Summary Prompt</FieldLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <StatusBadge isCustom={!!overallPrompt} />
                      {overallPrompt && (
                        <button
                          onClick={() => setOverallPrompt('')}
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            color: 'var(--accent)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={overallPrompt}
                    onChange={(e) => setOverallPrompt(e.target.value)}
                    placeholder={DEFAULT_OVERALL_PROMPT.slice(0, 200) + '…'}
                    rows={5}
                    style={{
                      ...inputBase,
                      width: '100%',
                      resize: 'vertical',
                      lineHeight: 1.6,
                    }}
                    onFocus={focus}
                    onBlur={blur}
                  />
                  <HelpText>
                    System prompt for the final executive summary that synthesizes all sensor summaries.
                  </HelpText>
                </div>

                {/* Per-Sensor Prompts — collapsible list */}
                <div>
                  <button
                    onClick={() => setPromptsExpanded(!promptsExpanded)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: 0,
                      marginBottom: promptsExpanded ? '0.75rem' : 0,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--ink)',
                    }}
                  >
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      Per-Sensor Prompts
                    </span>
                    <span style={{
                      fontSize: '0.625rem',
                      color: 'var(--ink-faint)',
                      transition: 'transform 200ms',
                      transform: promptsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}>
                      ▾
                    </span>
                  </button>

                  {promptsExpanded && (
                    <div style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}>
                      {PROMPT_SENSORS.map((sensor, idx) => {
                        const isExpanded = expandedSensor === sensor.key
                        const isCustom = !!sensorPrompts[sensor.key]
                        const defaultPrompt = DEFAULT_SENSOR_PROMPTS[sensor.key] ?? ''

                        return (
                          <div key={sensor.key} style={{
                            borderBottom: idx < PROMPT_SENSORS.length - 1 ? '1px solid var(--border-soft)' : 'none',
                          }}>
                            <button
                              onClick={() => setExpandedSensor(isExpanded ? null : sensor.key)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                                padding: '0.625rem 1rem',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--ink)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{
                                  fontSize: '0.625rem',
                                  color: 'var(--ink-faint)',
                                  transition: 'transform 200ms',
                                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                }}>
                                  ▸
                                </span>
                                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                                  {sensor.label}
                                </span>
                              </div>
                              <StatusBadge isCustom={isCustom} />
                            </button>

                            {isExpanded && (
                              <div style={{ padding: '0 1rem 0.875rem' }}>
                                <textarea
                                  value={sensorPrompts[sensor.key] ?? ''}
                                  onChange={(e) => updateSensorPrompt(sensor.key, e.target.value)}
                                  placeholder={defaultPrompt.slice(0, 120) + '…'}
                                  rows={4}
                                  style={{
                                    ...inputBase,
                                    width: '100%',
                                    resize: 'vertical',
                                    lineHeight: 1.6,
                                    fontSize: '0.875rem',
                                  }}
                                  onFocus={focus}
                                  onBlur={blur}
                                />
                                {isCustom && (
                                  <button
                                    onClick={() => updateSensorPrompt(sensor.key, '')}
                                    style={{
                                      fontSize: '0.75rem',
                                      fontWeight: 500,
                                      color: 'var(--accent)',
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: 0,
                                      marginTop: '0.375rem',
                                    }}
                                  >
                                    Reset to default
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Save ──────────────────────────────────────────── */}
        <div>
          <button
            onClick={save}
            disabled={saving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '0.875rem',
              fontWeight: 500,
              padding: '0.625rem 1.5rem',
              borderRadius: 4,
              border: 'none',
              color: saving ? 'var(--ink-faint)' : '#FFFFFF',
              background: saving ? 'var(--border)' : 'var(--ink)',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background 120ms',
            }}
            onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = '#000000' }}
            onMouseLeave={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = 'var(--ink)' }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </section>
  )
}
