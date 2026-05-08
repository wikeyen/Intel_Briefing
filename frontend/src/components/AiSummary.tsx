// ABOUTME: AI Summary configuration page — LLM provider, model, API key, and connection test.
// ABOUTME: Includes prompt customization with read-mode display and full-page modal editor.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { DEFAULT_SENSOR_PROMPTS, DEFAULT_OVERALL_PROMPT } from '@/lib/summary/prompts'

import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/lib/toast-context'
import { useAutoSave } from '@/lib/hooks/useAutoSave'
import { inputBase, focus, blur, SubLabel, FieldLabel, HelpText, AutoSaveIndicator, ChevronDown } from '@/components/form-styles'
import { OllamaModelPicker } from '@/components/OllamaModelPicker'
import { OpenRouterModelPicker } from '@/components/OpenRouterModelPicker'
import { AiSummarySkeleton } from '@/components/Skeleton'
import { PromptEditorModal } from '@/components/PromptEditorModal'

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

/* ─── MiniMax Model Picker ──────────────────────────────────────────── */

const MINIMAX_MODELS = [
  'MiniMax-M2.7',
  'MiniMax-Text-01',
  'abab6.5s-chat',
  'abab6.5g-chat',
]

function MiniMaxModelPicker({
  value,
  onChange,
  allowEmpty = false,
}: {
  value: string
  onChange: (v: string) => void
  allowEmpty?: boolean
}) {
  const isKnown = MINIMAX_MODELS.includes(value)
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={isKnown ? value : (value === '' ? '' : '__other__')}
        onChange={(e) => {
          if (e.target.value !== '__other__') onChange(e.target.value)
        }}
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
        {allowEmpty && <option value="">— none —</option>}
        {MINIMAX_MODELS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
        {!isKnown && value && (
          <option value="__other__">{value}</option>
        )}
      </select>
      <span style={{
        position: 'absolute',
        right: '0.75rem',
        top: '50%',
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        color: 'var(--ink-faint)',
      }}>
        <ChevronDown size={18} />
      </span>
    </div>
  )
}

/* ─── Main Component ────────────────────────────────────────────────── */

export function AiSummary() {
  const { locale, t } = useTranslation()
  const showToast = useToast()

  const [summaryProvider, setSummaryProvider] = useState<'openrouter' | 'minimax' | 'local' | null>(null)
  const [summaryBaseUrl, setSummaryBaseUrl] = useState('https://openrouter.ai/api/v1')
  const [summaryModel, setSummaryModel] = useState('deepseek/deepseek-v3.2')
  const [attributionModel, setAttributionModel] = useState('')
  const [testingLlm, setTestingLlm] = useState(false)
  const [testBtnHover, setTestBtnHover] = useState(false)

  const [sensorPrompts, setSensorPrompts] = useState<Record<string, string>>({})
  const [overallPrompt, setOverallPrompt] = useState('')
  const [promptsExpanded, setPromptsExpanded] = useState(false)
  const [localConcurrency, setLocalConcurrency] = useState(1)
  const [loaded, setLoaded] = useState(false)

  const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
  const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-v3.2'
  const MINIMAX_BASE_URL = 'https://api.minimax.io/v1'
  const MINIMAX_DEFAULT_MODEL = 'MiniMax-M2.7'
  const OLLAMA_BASE_URL = 'http://localhost:11434/v1'

  const { status: saveStatus, trigger, save } = useAutoSave(
    () => ({
      summary_provider: summaryProvider,
      summary_base_url: summaryBaseUrl,
      summary_model: summaryModel,
      summary_attribution_model: attributionModel,
      summary_sensor_prompts: sensorPrompts,
      summary_overall_prompt: overallPrompt,
      summary_language: locale,
      ...(summaryProvider === 'local' ? { local_summary_concurrency: localConcurrency } : {}),
    }),
    { onError: (e) => showToast('Save failed: ' + e.message) },
  )

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setSummaryProvider(cfg.summary_provider ?? null)
      setSummaryBaseUrl(cfg.summary_base_url || OPENROUTER_BASE_URL)
      setSummaryModel(cfg.summary_model || OPENROUTER_DEFAULT_MODEL)
      setAttributionModel(cfg.summary_attribution_model || '')
      setSensorPrompts(cfg.summary_sensor_prompts ?? {})
      setOverallPrompt(cfg.summary_overall_prompt ?? '')
      setLocalConcurrency(cfg.local_summary_concurrency ?? 1)
      setLoaded(true)
    })
  }, [])

  const handleProviderChange = (v: string) => {
    const provider = v === '' ? null : v as 'openrouter' | 'minimax' | 'local'
    setSummaryProvider(provider)
    if (provider === 'openrouter') {
      setSummaryBaseUrl(OPENROUTER_BASE_URL)
      setSummaryModel(OPENROUTER_DEFAULT_MODEL)
      setAttributionModel('')
    } else if (provider === 'minimax') {
      setSummaryBaseUrl(MINIMAX_BASE_URL)
      setSummaryModel(MINIMAX_DEFAULT_MODEL)
      setAttributionModel(MINIMAX_DEFAULT_MODEL)
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
  const isMinimax = summaryProvider === 'minimax'
  const isOpenRouter = summaryProvider === 'openrouter'
  const isEnabled = summaryProvider !== null

  if (!loaded) {
    return (
      <section id="ai-summary">
        <div className="page-header" style={{ paddingBottom: '1rem' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            marginBottom: '0.25rem',
          }}>
            {t('ai.title')}
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            {t('ai.desc')}
          </p>
        </div>
        <AiSummarySkeleton />
      </section>
    )
  }

  return (
    <section id="ai-summary">

      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="page-header" style={{ paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            marginBottom: '0.25rem',
          }}>
            {t('ai.title')}
          </h2>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
          {t('ai.desc')}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* ── Connection ─────────────────────────────────────── */}
        <div>
          <SubLabel>{t('ai.connection')}</SubLabel>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-card)',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>

            {/* Provider + Model — side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="settings-grid-2col">
              <div>
                <FieldLabel>{t('ai.provider')}</FieldLabel>
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
                    <option value="">{t('ai.disabled')}</option>
                    <option value="openrouter">{t('ai.openrouter')}</option>
                    <option value="minimax">MiniMax</option>
                    <option value="local">{t('ai.local')}</option>
                  </select>
                  <span style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'var(--ink-faint)',
                  }}>
                    <ChevronDown size={18} />
                  </span>
                </div>
              </div>
              <div>
                <FieldLabel>{t('ai.model')}</FieldLabel>
                {isOllama ? (
                  <OllamaModelPicker
                    value={summaryModel}
                    onChange={(v) => { setSummaryModel(v); trigger() }}
                    baseUrl={summaryBaseUrl}
                  />
                ) : isOpenRouter ? (
                  <OpenRouterModelPicker
                    value={summaryModel}
                    onChange={(v) => { setSummaryModel(v); trigger() }}
                  />
                ) : isMinimax ? (
                  <MiniMaxModelPicker
                    value={summaryModel}
                    onChange={(v) => { setSummaryModel(v); trigger() }}
                  />
                ) : (
                  <input
                    type="text"
                    value={summaryModel}
                    disabled
                    placeholder={OPENROUTER_DEFAULT_MODEL}
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
                <FieldLabel>{t('ai.attribution_model')}</FieldLabel>
                {isOllama ? (
                  <OllamaModelPicker
                    value={attributionModel}
                    onChange={(v) => { setAttributionModel(v); trigger() }}
                    baseUrl={summaryBaseUrl}
                  />
                ) : isMinimax ? (
                  <MiniMaxModelPicker
                    value={attributionModel}
                    onChange={(v) => { setAttributionModel(v); trigger() }}
                    allowEmpty
                  />
                ) : (
                  <OpenRouterModelPicker
                    value={attributionModel}
                    onChange={(v) => { setAttributionModel(v); trigger() }}
                  />
                )}
                <HelpText>
                  {t('ai.attribution_desc')}
                </HelpText>
              </div>
            )}

            {/* Base URL */}
            {isEnabled && (
              <div>
                <FieldLabel>{t('ai.base_url')}</FieldLabel>
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
                  {isOllama ? t('ai.base_url_ollama') : isMinimax ? 'MiniMax chat-completions-compatible endpoint.' : t('ai.base_url_openrouter')}
                </HelpText>
              </div>
            )}

            {/* Concurrency — local models only */}
            {isOllama && (
              <div>
                <FieldLabel hint="1–8">{t('ai.summary_concurrency')}</FieldLabel>
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
                  {t('ai.concurrency_desc')}
                </HelpText>
              </div>
            )}

            {/* Active runtime readout */}
            {isEnabled && (
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--ink-faint)',
                padding: '0.375rem 0.75rem',
                background: 'var(--bg, #f8f8f8)',
                border: '1px solid var(--border-soft)',
                borderRadius: 6,
                fontFamily: 'ui-monospace, monospace',
                lineHeight: 1.6,
              }}>
                <span style={{ color: 'var(--ink-muted)', fontFamily: 'inherit' }}>Using: </span>
                {summaryModel || '—'} via {summaryBaseUrl}
                {attributionModel && (
                  <span>
                    {' · '}
                    <span style={{ color: 'var(--ink-muted)', fontFamily: 'inherit' }}>Attribution: </span>
                    {attributionModel}
                  </span>
                )}
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
                    {t('ai.connection_test')}
                  </span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', margin: '0.125rem 0 0' }}>
                    {t('ai.test_desc')}
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
                  {testingLlm ? t('ai.testing') : t('ai.test_now')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Prompt Customization ──────────────────────────── */}
        {isEnabled && (
          <div>
            <SubLabel>{t('ai.prompts')}</SubLabel>
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-card)',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}>

              {/* Executive Summary Prompt */}
              <PromptEditorModal
                label={t('ai.exec_prompt')}
                value={overallPrompt}
                defaultPrompt={DEFAULT_OVERALL_PROMPT}
                onChange={(v) => { setOverallPrompt(v); trigger() }}
                isCustom={!!overallPrompt}
                customBadgeLabel={t('ai.customized')}
                resetLabel={t('ai.reset_default')}
                cancelLabel={t('ai.cancel')}
                saveLabel={t('ai.save')}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.4, margin: '-0.25rem 0 0 0.25rem' }}>
                {t('ai.exec_prompt_desc')}
              </p>

              {/* Per-Sensor Prompts — collapsible settings list */}
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  onClick={() => setPromptsExpanded(!promptsExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '0.25rem 0.125rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--ink)',
                    borderRadius: 4,
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover, rgba(0,0,0,0.03))' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                >
                  <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                    {t('ai.per_sensor_prompts')}
                  </span>
                  <span style={{
                    color: 'var(--ink-muted)',
                    transition: 'transform 200ms',
                    transform: promptsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}>
                    <ChevronDown size={18} />
                  </span>
                </button>

                {promptsExpanded && (
                  <div style={{
                    marginTop: '0.25rem',
                    background: 'var(--bg, #fafafa)',
                    borderRadius: 8,
                    padding: '0.25rem 0.5rem',
                  }}>
                    {PROMPT_SENSORS.map((sensor, i) => {
                      const isCustom = !!sensorPrompts[sensor.key]
                      const defaultPrompt = DEFAULT_SENSOR_PROMPTS[sensor.key] ?? ''

                      return (
                        <div key={sensor.key} style={{
                          borderBottom: i < PROMPT_SENSORS.length - 1
                            ? '1px solid var(--border-soft)' : 'none',
                        }}>
                          <PromptEditorModal
                            label={sensor.label}
                            value={sensorPrompts[sensor.key] ?? ''}
                            defaultPrompt={defaultPrompt}
                            onChange={(v) => updateSensorPrompt(sensor.key, v)}
                            isCustom={isCustom}
                            showDot
                            customBadgeLabel={t('ai.customized')}
                            resetLabel={t('ai.reset_default')}
                            cancelLabel={t('ai.cancel')}
                            saveLabel={t('ai.save')}
                          />
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
