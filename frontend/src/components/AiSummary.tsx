// ABOUTME: AI Summary configuration page — LLM provider, model, API key, and connection test.
// ABOUTME: Includes collapsible prompt customization for per-sensor and overall summary prompts.
'use client'
import { useState, useEffect } from 'react'
import { api, type SummaryLanguage } from '@/api/client'
import { DEFAULT_SENSOR_PROMPTS, DEFAULT_OVERALL_PROMPT } from '@/lib/summary/prompts'

import { useToast } from '@/lib/toast-context'
import { useAutoSave } from '@/lib/hooks/useAutoSave'
import { inputBase, focus, blur, SubLabel, FieldLabel, HelpText, AutoSaveIndicator } from '@/components/form-styles'
import { OllamaModelPicker } from '@/components/OllamaModelPicker'
import { OpenRouterModelPicker } from '@/components/OpenRouterModelPicker'

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
  { key: 'x', label: 'X' },
  { key: 'bluesky', label: 'Bluesky' },
  { key: 'mastodon', label: 'Mastodon' },
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
  const [attributionModel, setAttributionModel] = useState('')
  const [testingLlm, setTestingLlm] = useState(false)
  const [testBtnHover, setTestBtnHover] = useState(false)

  const [sensorPrompts, setSensorPrompts] = useState<Record<string, string>>({})
  const [overallPrompt, setOverallPrompt] = useState('')
  const [promptsExpanded, setPromptsExpanded] = useState(false)
  const [expandedSensor, setExpandedSensor] = useState<string | null>(null)
  const [localConcurrency, setLocalConcurrency] = useState(1)
  const [summaryLanguage, setSummaryLanguage] = useState<SummaryLanguage>('zh')

  const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
  const OLLAMA_BASE_URL = 'http://localhost:11434/v1'

  const { status: saveStatus, trigger, save } = useAutoSave(
    () => ({
      summary_provider: summaryProvider,
      summary_base_url: summaryBaseUrl,
      summary_model: summaryModel,
      summary_attribution_model: attributionModel,
      summary_sensor_prompts: sensorPrompts,
      summary_overall_prompt: overallPrompt,
      summary_language: summaryLanguage,
      ...(summaryProvider === 'local' ? { local_summary_concurrency: localConcurrency } : {}),
    }),
    { onError: (e) => showToast('Save failed: ' + e.message) },
  )

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setSummaryProvider(cfg.summary_provider ?? null)
      setSummaryBaseUrl(cfg.summary_base_url || OPENROUTER_BASE_URL)
      setSummaryModel(cfg.summary_model || 'anthropic/claude-sonnet-4')
      setAttributionModel(cfg.summary_attribution_model || '')
      setSensorPrompts(cfg.summary_sensor_prompts ?? {})
      setOverallPrompt(cfg.summary_overall_prompt ?? '')
      setLocalConcurrency(cfg.local_summary_concurrency ?? 1)
      setSummaryLanguage(cfg.summary_language ?? 'zh')
    })
  }, [])

  const handleProviderChange = (v: string) => {
    const provider = v === '' ? null : v as 'openrouter' | 'local'
    setSummaryProvider(provider)
    if (provider === 'openrouter') {
      setSummaryBaseUrl(OPENROUTER_BASE_URL)
      setSummaryModel('anthropic/claude-sonnet-4')
      setAttributionModel('')
    } else if (provider === 'local') {
      setSummaryBaseUrl(OLLAMA_BASE_URL)
      setSummaryModel('')
      setAttributionModel('')
    }
    trigger()
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
    trigger()
  }

  const isOllama = summaryProvider === 'local'
  const isEnabled = summaryProvider !== null

  return (
    <section id="ai-summary">

      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="page-header" style={{ paddingTop: '2.5rem', paddingBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            marginBottom: '0.25rem',
          }}>
            AI Summary
          </h2>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
          Generate per-source summaries and an executive briefing after each fetch using an LLM.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '4rem' }}>

        {/* ── Connection ─────────────────────────────────────── */}
        <div>
          <SubLabel>Connection</SubLabel>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-card)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}>

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
                    onChange={(v) => { setSummaryModel(v); trigger() }}
                    baseUrl={summaryBaseUrl}
                  />
                ) : isEnabled ? (
                  <OpenRouterModelPicker
                    value={summaryModel}
                    onChange={(v) => { setSummaryModel(v); trigger() }}
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

            {/* Attribution Model */}
            {isEnabled && (
              <div>
                <FieldLabel>Attribution Model</FieldLabel>
                {isOllama ? (
                  <OllamaModelPicker
                    value={attributionModel}
                    onChange={(v) => { setAttributionModel(v); trigger() }}
                    baseUrl={summaryBaseUrl}
                  />
                ) : (
                  <OpenRouterModelPicker
                    value={attributionModel}
                    onChange={(v) => { setAttributionModel(v); trigger() }}
                  />
                )}
                <HelpText>
                  Cheaper model for per-section citation matching. Falls back to generation model if unset.
                </HelpText>
              </div>
            )}

            {/* Summary Language */}
            {isEnabled && (
              <div>
                <FieldLabel>Summary Language</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select
                    value={summaryLanguage}
                    onChange={(e) => { setSummaryLanguage(e.target.value as SummaryLanguage); trigger() }}
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
                    <option value="zh">Chinese</option>
                    <option value="en">English</option>
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
                <HelpText>
                  Language for generated summaries. Does not affect custom prompt overrides.
                </HelpText>
              </div>
            )}

            {/* Base URL */}
            {isEnabled && (
              <div>
                <FieldLabel>Base URL</FieldLabel>
                <input
                  type="text"
                  value={summaryBaseUrl}
                  onChange={(e) => { setSummaryBaseUrl(e.target.value); trigger() }}
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

            {/* Concurrency — local models only */}
            {isOllama && (
              <div>
                <FieldLabel hint="1–8">Summary Concurrency</FieldLabel>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={localConcurrency}
                  onChange={(e) => { setLocalConcurrency(Math.max(1, Math.min(8, Number(e.target.value) || 1))); trigger() }}
                  style={{ ...inputBase, width: 100 }}
                  onFocus={focus}
                  onBlur={blur}
                />
                <HelpText>
                  Number of per-sensor LLM calls to run in parallel. Keep low for local models to avoid OOM.
                </HelpText>
              </div>
            )}

            {/* Test Connection */}
            {isEnabled && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 0 0',
                borderTop: '1px solid var(--border-soft)',
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
                  disabled={testingLlm}
                  onMouseEnter={() => setTestBtnHover(true)}
                  onMouseLeave={() => setTestBtnHover(false)}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    padding: '0.375rem 0.875rem',
                    borderRadius: 6,
                    border: `1px solid ${!testingLlm && testBtnHover ? 'var(--accent-dim)' : 'var(--border)'}`,
                    color: testingLlm ? 'var(--ink-faint)' : testBtnHover ? 'var(--accent)' : 'var(--ink-muted)',
                    background: !testingLlm && testBtnHover ? 'var(--accent-wash)' : 'var(--surface)',
                    cursor: testingLlm ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    marginLeft: '1.5rem',
                    transition: 'color 120ms, border-color 120ms, background 120ms',
                  }}
                >
                  {testingLlm ? 'Testing\u2026' : 'Test Now'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Prompt Customization ──────────────────────────── */}
        {isEnabled && (
          <div>
            <SubLabel>Prompts</SubLabel>
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-card)',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}>

              {/* Overall Prompt */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <FieldLabel>Executive Summary Prompt</FieldLabel>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <StatusBadge isCustom={!!overallPrompt} />
                    {overallPrompt && (
                      <button
                        onClick={() => { setOverallPrompt(''); trigger() }}
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
                  onChange={(e) => { setOverallPrompt(e.target.value); trigger() }}
                  placeholder={DEFAULT_OVERALL_PROMPT.slice(0, 200) + '\u2026'}
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
                    boxShadow: 'var(--shadow-card)',
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
                                placeholder={defaultPrompt.slice(0, 120) + '\u2026'}
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
        )}
      </div>
    </section>
  )
}
