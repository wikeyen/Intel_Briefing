// ABOUTME: AI Summary configuration page — LLM provider, model, API key, and connection test.
// ABOUTME: Standalone page extracted from the unified settings component.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { SectionHeader } from '@/components/SectionHeader'
import { useToast } from '@/lib/toast-context'

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

function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,107,79,0.1)'
}
function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

export function AiSummary() {
  const showToast = useToast()

  const [summaryProvider, setSummaryProvider] = useState<'openrouter' | 'custom' | null>(null)
  const [summaryApiKey, setSummaryApiKey] = useState('')
  const [summaryBaseUrl, setSummaryBaseUrl] = useState('https://openrouter.ai/api/v1')
  const [summaryModel, setSummaryModel] = useState('anthropic/claude-sonnet-4')
  const [testingLlm, setTestingLlm] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setSummaryProvider(cfg.summary_provider ?? null)
      setSummaryApiKey(cfg.summary_api_key && cfg.summary_api_key !== '***' ? cfg.summary_api_key : '')
      setSummaryBaseUrl(cfg.summary_base_url || 'https://openrouter.ai/api/v1')
      setSummaryModel(cfg.summary_model || 'anthropic/claude-sonnet-4')
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({
        summary_provider: summaryProvider,
        summary_api_key: summaryApiKey || null,
        summary_base_url: summaryBaseUrl,
        summary_model: summaryModel,
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

  return (
    <section id="ai-summary" style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      gap: '4.5rem',
      padding: '4.5rem 0 6rem',
    }}>
      <SectionHeader
        num="03"
        title="AI Summary"
        description="Generate per-source summaries and an executive briefing after each fetch using an LLM."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Provider + Model row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
              Provider
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={summaryProvider ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setSummaryProvider(v === '' ? null : v as 'openrouter' | 'custom')
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
                <option value="">Disabled</option>
                <option value="openrouter">OpenRouter</option>
                <option value="custom">Custom</option>
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
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
              Model
            </label>
            <input
              type="text"
              value={summaryModel}
              disabled={summaryProvider === null}
              onChange={(e) => setSummaryModel(e.target.value)}
              placeholder="anthropic/claude-sonnet-4"
              style={{
                ...inputBase,
                width: '100%',
                opacity: summaryProvider === null ? 0.5 : 1,
                cursor: summaryProvider === null ? 'not-allowed' : 'text',
              }}
              onFocus={focus}
              onBlur={blur}
            />
          </div>
        </div>

        {/* API Key — shown when provider is set */}
        {summaryProvider !== null && (
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
              API Key
            </label>
            <input
              type="password"
              value={summaryApiKey}
              onChange={(e) => setSummaryApiKey(e.target.value)}
              placeholder="sk-..."
              style={{ ...inputBase, width: '100%' }}
              onFocus={focus}
              onBlur={blur}
            />
          </div>
        )}

        {/* Base URL — shown only for custom provider */}
        {summaryProvider === 'custom' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
              Base URL
            </label>
            <input
              type="text"
              value={summaryBaseUrl}
              onChange={(e) => setSummaryBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              style={{ ...inputBase, width: '100%' }}
              onFocus={focus}
              onBlur={blur}
            />
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
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

          {summaryProvider !== null && (
            <button
              onClick={testLlm}
              disabled={testingLlm || saving}
              style={{
                fontSize: '0.875rem',
                fontWeight: 500,
                padding: '0.625rem 1.5rem',
                borderRadius: 4,
                border: '1px solid var(--border)',
                color: (testingLlm || saving) ? 'var(--ink-faint)' : 'var(--ink)',
                background: 'var(--surface)',
                cursor: (testingLlm || saving) ? 'not-allowed' : 'pointer',
                transition: 'background 120ms',
              }}
            >
              {testingLlm ? 'Testing…' : 'Test Connection'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
