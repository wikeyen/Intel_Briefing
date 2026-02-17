// ABOUTME: API key management page — masked inputs with reveal toggles for each key.
// ABOUTME: Saves to PUT /config; keys that are set show *** (masked); clear and retype to replace.
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
  fontFamily: 'ui-monospace, monospace',
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
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const isSet = value === '***'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', fontFamily: 'inherit' }}>
          {label}
        </label>
        {isSet && (
          <span style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ok)',
            background: 'var(--ok-bg)',
            padding: '0.15rem 0.5rem',
            borderRadius: 999,
          }}>
            Saved
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="not set"
          style={inputBase}
          onFocus={(e) => {
            focus(e)
            // Select all so user can immediately type a replacement
            if (isSet) e.currentTarget.select()
          }}
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
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-faint)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
          }}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem', lineHeight: 1.5, fontFamily: 'inherit' }}>
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
        // null → empty string (not set); '***' → '***' (set, masked)
        v[field] = (cfg[field] as string | null) ?? ''
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
        // Only send if non-empty; server ignores '***' so unchanged keys are preserved
        if (v) (partial as Record<string, string>)[field] = v
      }
      await api.updateConfig(partial)
      // Reload so the form reflects the current saved state
      const updated = await api.getConfig()
      const v: Record<string, string> = {}
      for (const { field } of KEY_FIELDS) {
        v[field] = (updated[field] as string | null) ?? ''
      }
      setValues(v)
      showToast('API keys saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    ...inputBase,
    fontFamily: 'inherit',
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
        description="Credentials for external data sources and AI providers. Keys are write-only — once saved, they show as *** and cannot be read back."
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
            style={inputStyle}
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
            style={inputStyle}
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
