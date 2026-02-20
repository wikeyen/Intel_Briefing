// ABOUTME: AI Summary configuration page — LLM provider, model, API key, and connection test.
// ABOUTME: Includes collapsible prompt customization for per-sensor and overall summary prompts.
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/api/client'
import type { OllamaModelInfo } from '@/api/client'
import { DEFAULT_SENSOR_PROMPTS, DEFAULT_OVERALL_PROMPT } from '@/lib/summary/prompts'

import { useToast } from '@/lib/toast-context'

const inputBase: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '0.625rem 0.875rem',
  fontSize: '0.875rem',
  color: 'var(--ink)',
  outline: 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: 'var(--ink-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '0.375rem',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '1.25rem',
}

function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,107,79,0.08)'
}
function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

// ── Ollama Model Picker ────────────────────────────────────────────────
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
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Strip /v1 suffix to get Ollama base
      const ollamaBase = baseUrl.replace(/\/v1\/?$/, '')
      const result = await api.getOllamaModels(ollamaBase)
      setModels(result.models ?? [])
      if (result.models.length === 0) {
        setError('No models found')
      }
    } catch {
      setError('Cannot connect to Ollama')
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

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

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            ref={inputRef}
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
            placeholder={loading ? 'Loading models…' : 'Search or type model name…'}
            style={{ ...inputBase, width: '100%', paddingRight: '2rem' }}
          />
          <span
            style={{
              position: 'absolute',
              right: '0.75rem',
              top: '50%',
              transform: `translateY(-50%) rotate(${open ? '180deg' : '0deg'})`,
              pointerEvents: 'none',
              color: 'var(--ink-faint)',
              fontSize: '0.5625rem',
              transition: 'transform 150ms',
            }}
          >
            ▾
          </span>
        </div>
        <button
          onClick={fetchModels}
          disabled={loading}
          title="Refresh model list"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: loading ? 'var(--ink-faint)' : 'var(--ink-muted)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            flexShrink: 0,
          }}
        >
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 240,
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            zIndex: 50,
          }}
        >
          {error && (
            <div style={{ padding: '0.75rem 1rem', color: 'var(--ink-faint)', fontSize: '0.8125rem' }}>
              {error}
              <button
                onClick={fetchModels}
                style={{
                  marginLeft: '0.5rem',
                  color: 'var(--accent)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
              >
                Retry
              </button>
            </div>
          )}
          {!error && filtered.length === 0 && !loading && (
            <div style={{ padding: '0.75rem 1rem', color: 'var(--ink-faint)', fontSize: '0.8125rem' }}>
              {search ? `No models matching "${search}"` : 'No models available'}
            </div>
          )}
          {filtered.map((m) => (
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
                width: '100%',
                padding: '0.5rem 1rem',
                background: m.name === value ? 'rgba(29,107,79,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--ink)',
                transition: 'background 80ms',
              }}
              onMouseEnter={(e) => {
                if (m.name !== value) e.currentTarget.style.background = 'var(--surface-alt)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = m.name === value ? 'rgba(29,107,79,0.06)' : 'transparent'
              }}
            >
              <span style={{ fontSize: '0.8125rem', fontWeight: m.name === value ? 600 : 400 }}>
                {m.name}
              </span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
                {[m.size, m.family, m.quantization].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Prompt Sensors ─────────────────────────────────────────────────────
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

function PromptBadge({ isCustom }: { isCustom: boolean }) {
  return (
    <span style={{
      fontSize: '0.5625rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      padding: '0.125rem 0.5rem',
      borderRadius: 3,
      color: isCustom ? 'var(--accent)' : 'var(--ink-faint)',
      background: isCustom ? 'rgba(29,107,79,0.08)' : 'var(--surface-alt)',
      border: `1px solid ${isCustom ? 'var(--accent)' : 'var(--border)'}`,
      flexShrink: 0,
    }}>
      {isCustom ? 'Custom' : 'Default'}
    </span>
  )
}

// ── Main Component ─────────────────────────────────────────────────────
export function AiSummary() {
  const showToast = useToast()

  const [summaryProvider, setSummaryProvider] = useState<'openrouter' | 'custom' | null>(null)
  const [summaryApiKey, setSummaryApiKey] = useState('')
  const [summaryBaseUrl, setSummaryBaseUrl] = useState('https://openrouter.ai/api/v1')
  const [summaryModel, setSummaryModel] = useState('anthropic/claude-sonnet-4')
  const [testingLlm, setTestingLlm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Prompt customization state
  const [sensorPrompts, setSensorPrompts] = useState<Record<string, string>>({})
  const [overallPrompt, setOverallPrompt] = useState('')
  const [promptsExpanded, setPromptsExpanded] = useState(false)
  const [expandedSensor, setExpandedSensor] = useState<string | null>(null)

  const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
  const OLLAMA_BASE_URL = 'http://localhost:11434/v1'

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setSummaryProvider(cfg.summary_provider ?? null)
      setSummaryApiKey(cfg.summary_api_key && cfg.summary_api_key !== '***' ? cfg.summary_api_key : '')
      setSummaryBaseUrl(cfg.summary_base_url || OPENROUTER_BASE_URL)
      setSummaryModel(cfg.summary_model || 'anthropic/claude-sonnet-4')
      setSensorPrompts(cfg.summary_sensor_prompts ?? {})
      setOverallPrompt(cfg.summary_overall_prompt ?? '')
    })
  }, [])

  const handleProviderChange = (v: string) => {
    const provider = v === '' ? null : v as 'openrouter' | 'custom'
    setSummaryProvider(provider)
    if (provider === 'openrouter') {
      setSummaryBaseUrl(OPENROUTER_BASE_URL)
    } else if (provider === 'custom') {
      setSummaryBaseUrl(OLLAMA_BASE_URL)
      setSummaryModel('llama3.2')
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({
        summary_provider: summaryProvider,
        summary_api_key: summaryApiKey || null,
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
      // Save current config first so the endpoint uses the latest values
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

  const isOllama = summaryProvider === 'custom'

  return (
    <section id="ai-summary" style={{ padding: '4.5rem 0' }}>
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
          AI Summary
        </h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
          Generate per-source summaries and an executive briefing after each fetch.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* ── Provider Card ────────────────────────────────── */}
        <div style={cardStyle}>
          <label style={labelStyle}>Provider</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {[
              { value: '', label: 'Off' },
              { value: 'openrouter', label: 'OpenRouter' },
              { value: 'custom', label: 'Ollama' },
            ].map((opt) => {
              const selected = (summaryProvider ?? '') === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => handleProviderChange(opt.value)}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.8125rem',
                    fontWeight: selected ? 600 : 400,
                    borderRadius: 6,
                    border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected ? 'rgba(29,107,79,0.06)' : 'transparent',
                    color: selected ? 'var(--accent)' : 'var(--ink-muted)',
                    cursor: 'pointer',
                    transition: 'all 120ms',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Connection Card ──────────────────────────────── */}
        {summaryProvider !== null && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Model */}
              <div>
                <label style={labelStyle}>Model</label>
                {isOllama ? (
                  <OllamaModelPicker
                    value={summaryModel}
                    onChange={setSummaryModel}
                    baseUrl={summaryBaseUrl}
                  />
                ) : (
                  <input
                    type="text"
                    value={summaryModel}
                    onChange={(e) => setSummaryModel(e.target.value)}
                    placeholder="anthropic/claude-sonnet-4"
                    style={{ ...inputBase, width: '100%' }}
                    onFocus={focus}
                    onBlur={blur}
                  />
                )}
              </div>

              {/* API Key — not needed for Ollama typically, but still available */}
              <div>
                <label style={labelStyle}>
                  API Key
                  {isOllama && (
                    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '0.5rem', color: 'var(--ink-faint)' }}>
                      optional for Ollama
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  value={summaryApiKey}
                  onChange={(e) => setSummaryApiKey(e.target.value)}
                  placeholder={isOllama ? 'Usually not needed' : 'sk-...'}
                  style={{ ...inputBase, width: '100%' }}
                  onFocus={focus}
                  onBlur={blur}
                />
              </div>

              {/* Base URL */}
              <div>
                <label style={labelStyle}>Base URL</label>
                <input
                  type="text"
                  value={summaryBaseUrl}
                  onChange={(e) => setSummaryBaseUrl(e.target.value)}
                  placeholder={isOllama ? OLLAMA_BASE_URL : OPENROUTER_BASE_URL}
                  style={{ ...inputBase, width: '100%' }}
                  onFocus={focus}
                  onBlur={blur}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
                <button
                  onClick={save}
                  disabled={saving}
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    padding: '0.5rem 1.25rem',
                    borderRadius: 6,
                    border: 'none',
                    color: saving ? 'var(--ink-faint)' : '#FFFFFF',
                    background: saving ? 'var(--border)' : 'var(--ink)',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = '#000000' }}
                  onMouseLeave={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = 'var(--ink)' }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={testLlm}
                  disabled={testingLlm || saving}
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    padding: '0.5rem 1.25rem',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    color: (testingLlm || saving) ? 'var(--ink-faint)' : 'var(--ink)',
                    background: 'transparent',
                    cursor: (testingLlm || saving) ? 'not-allowed' : 'pointer',
                    transition: 'background 120ms',
                  }}
                >
                  {testingLlm ? 'Testing…' : 'Test'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Prompt Customization (collapsible) ──────────── */}
        {summaryProvider !== null && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setPromptsExpanded(!promptsExpanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '1rem 1.25rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink)',
              }}
            >
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                Prompt Customization
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
              <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* Overall Summary Prompt */}
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.5rem',
                  }}>
                    <label style={{
                      ...labelStyle,
                      marginBottom: 0,
                    }}>
                      Overall Summary Prompt
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <PromptBadge isCustom={!!overallPrompt} />
                      {overallPrompt && (
                        <button
                          onClick={() => setOverallPrompt('')}
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--accent)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textUnderlineOffset: '2px',
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
                    placeholder={DEFAULT_OVERALL_PROMPT.slice(0, 120) + '…'}
                    rows={6}
                    style={{
                      ...inputBase,
                      width: '100%',
                      resize: 'vertical',
                      lineHeight: 1.6,
                      fontSize: '0.8125rem',
                    }}
                    onFocus={focus}
                    onBlur={blur}
                  />
                </div>

                {/* Per-Sensor Prompts */}
                <div>
                  <label style={{
                    ...labelStyle,
                    marginBottom: '0.5rem',
                  }}>
                    Per-Sensor Prompts
                  </label>
                  <div style={{
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
                          borderBottom: idx < PROMPT_SENSORS.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                          <button
                            onClick={() => setExpandedSensor(isExpanded ? null : sensor.key)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              width: '100%',
                              padding: '0.5rem 1rem',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--ink)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{
                                fontSize: '0.6875rem',
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
                            <PromptBadge isCustom={isCustom} />
                          </button>

                          {isExpanded && (
                            <div style={{ padding: '0 1rem 0.75rem' }}>
                              <textarea
                                value={sensorPrompts[sensor.key] ?? ''}
                                onChange={(e) => updateSensorPrompt(sensor.key, e.target.value)}
                                placeholder={defaultPrompt.slice(0, 80) + '…'}
                                rows={5}
                                style={{
                                  ...inputBase,
                                  width: '100%',
                                  resize: 'vertical',
                                  lineHeight: 1.6,
                                  fontSize: '0.8125rem',
                                }}
                                onFocus={focus}
                                onBlur={blur}
                              />
                              {isCustom && (
                                <button
                                  onClick={() => updateSensorPrompt(sensor.key, '')}
                                  style={{
                                    fontSize: '0.6875rem',
                                    color: 'var(--accent)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    textUnderlineOffset: '2px',
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
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
