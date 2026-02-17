// ABOUTME: API key management page — masked inputs with reveal toggles for each key.
// ABOUTME: Saves to PUT /config; shows success/error toast via callback.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { ConfigSettings } from '../api/client'
import { SectionHeader } from '../components/SectionHeader'

interface Props {
  showToast: (msg: string) => void
}

const KEY_FIELDS: { field: keyof ConfigSettings; label: string; hint: string }[] = [
  { field: 'gemini_api_key',     label: 'Gemini API Key',      hint: 'Used for AI summarization via Google Gemini.' },
  { field: 'xai_api_key',        label: 'xAI API Key',         hint: 'Required for Grok-based politics and topics sensors.' },
  { field: 'github_token',       label: 'GitHub Token',        hint: 'Personal access token for GitHub Trending sensor.' },
  { field: 'producthunt_token',  label: 'Product Hunt Token',  hint: 'API token for Product Hunt daily launches.' },
]

const inputBase: React.CSSProperties = {
  width: '100%',
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

function focus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,107,79,0.1)'
}
function blur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

function MaskedInput({ label, hint, value, onChange }: {
  label: string; hint: string; value: string; onChange: (v: string) => void
}) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="not set"
          style={inputBase}
          onFocus={focus}
          onBlur={blur}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--ink-muted)',
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--border)',
            borderRadius: 4,
            background: 'var(--surface)',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            transition: 'color 120ms, border-color 120ms',
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--ink)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong, var(--ink-faint))'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
          }}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem', lineHeight: 1.5 }}>
        {hint}
      </p>
    </div>
  )
}

export function ApiKeys({ showToast }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [xaiModel, setXaiModel] = useState('')
  const [xaiBaseUrl, setXaiBaseUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      const v: Record<string, string> = {}
      for (const { field } of KEY_FIELDS) {
        const raw = cfg[field] as string | null
        v[field] = raw === '***' || !raw ? '' : raw
      }
      setValues(v)
      setXaiModel(cfg.xai_model)
      setXaiBaseUrl(cfg.xai_base_url)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const partial: Partial<ConfigSettings> = { xai_model: xaiModel, xai_base_url: xaiBaseUrl }
      for (const { field } of KEY_FIELDS) {
        const v = values[field]
        if (v) (partial as Record<string, string>)[field] = v
      }
      await api.updateConfig(partial)
      showToast('API keys saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="api-keys" style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      gap: '4.5rem',
      padding: '4.5rem 0',
      borderBottom: '1px solid var(--border-soft)',
    }}>
      <SectionHeader
        num="01"
        title="API Keys"
        description="Credentials for external data sources and AI providers. Keys are stored encrypted and never returned in plaintext."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {KEY_FIELDS.map(({ field, label, hint }) => (
          <MaskedInput
            key={field}
            label={label}
            hint={hint}
            value={values[field] ?? ''}
            onChange={(v) => setValues((prev) => ({ ...prev, [field]: v }))}
          />
        ))}

        <div style={{ height: 1, background: 'var(--border-soft)' }} />

        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
            xAI Model
          </label>
          <input
            type="text"
            value={xaiModel}
            onChange={(e) => setXaiModel(e.target.value)}
            style={inputBase}
            onFocus={focus}
            onBlur={blur}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem' }}>
            Model identifier used for Grok queries (e.g., <code style={{ fontFamily: 'ui-monospace, monospace' }}>grok-3-mini-fast</code>).
          </p>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
            xAI Base URL
          </label>
          <input
            type="text"
            value={xaiBaseUrl}
            onChange={(e) => setXaiBaseUrl(e.target.value)}
            style={inputBase}
            onFocus={focus}
            onBlur={blur}
          />
        </div>

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
