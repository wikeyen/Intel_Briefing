// ABOUTME: API key management page — masked inputs with reveal toggles for each key.
// ABOUTME: Saves to PUT /config; shows success/error toast via callback.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { ConfigSettings } from '../api/client'
import { SectionHeader } from '../components/SectionHeader'

interface Props {
  showToast: (msg: string) => void
}

const KEY_FIELDS: { field: keyof ConfigSettings; label: string }[] = [
  { field: 'gemini_api_key', label: 'Gemini API Key' },
  { field: 'xai_api_key', label: 'xAI API Key' },
  { field: 'github_token', label: 'GitHub Token' },
  { field: 'producthunt_token', label: 'Product Hunt Token' },
]

const inputStyle = {
  flex: 1,
  background: 'var(--canvas)',
  border: '1px solid var(--border)',
  borderRadius: 2,
  padding: '0.625rem 0.75rem',
  fontSize: '0.9375rem',
  color: 'var(--ink)',
  outline: 'none',
  transition: 'border-color 150ms',
  fontFamily: 'inherit',
  width: '100%',
}

function MaskedInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="not set"
          style={inputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          style={{
            fontSize: '0.6875rem',
            fontWeight: 500,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--ink-muted)',
            padding: '0.25rem 0.5rem',
            whiteSpace: 'nowrap',
            transition: 'color 150ms',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
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
    <section id="api-keys" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionHeader title="API Keys" />
      {KEY_FIELDS.map(({ field, label }) => (
        <MaskedInput
          key={field}
          label={label}
          value={values[field] ?? ''}
          onChange={(v) => setValues((prev) => ({ ...prev, [field]: v }))}
        />
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          xAI Model
        </label>
        <input
          type="text"
          value={xaiModel}
          onChange={(e) => setXaiModel(e.target.value)}
          style={inputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          xAI Base URL
        </label>
        <input
          type="text"
          value={xaiBaseUrl}
          onChange={(e) => setXaiBaseUrl(e.target.value)}
          style={inputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
      </div>
      <div>
        <button
          onClick={save}
          disabled={saving}
          style={{
            fontSize: '0.75rem',
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: saving ? 'var(--ink-faint)' : 'var(--accent)',
            border: '1.5px solid',
            borderColor: saving ? 'var(--border)' : 'var(--accent)',
            borderRadius: 2,
            padding: '0.4rem 1.25rem',
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'all 150ms ease',
            background: 'transparent',
          }}
          onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.background = 'var(--accent-wash)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}
