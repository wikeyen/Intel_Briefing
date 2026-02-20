// ABOUTME: API key management page — saved keys show 20 asterisks; Show reveals the real value.
// ABOUTME: Saves to PUT /config; uses GET /config/raw to reveal stored keys on demand.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import type { ConfigSettings } from '@/api/client'
import { useToast } from '@/lib/toast-context'

interface KeyFieldDef { field: keyof ConfigSettings; label: string; hint: string }
interface PlainFieldDef { field: keyof ConfigSettings; label: string; hint?: string; placeholder?: string }
interface FieldGroup {
  title: string
  secrets: KeyFieldDef[]
  plains?: PlainFieldDef[]
}

const KEY_GROUPS: FieldGroup[] = [
  {
    title: 'AI Providers',
    secrets: [
      { field: 'summary_api_key',       label: 'OpenRouter API Key',       hint: 'API key for LLM summarization via OpenRouter. Get one at openrouter.ai/keys.' },
    ],
  },
  {
    title: 'Data Sources',
    secrets: [
      { field: 'github_token',          label: 'GitHub Token',             hint: 'Personal access token for GitHub Trending sensor.' },
      { field: 'producthunt_token',     label: 'Product Hunt Token',       hint: 'API token for Product Hunt daily launches.' },
    ],
  },
  {
    title: 'Social Platforms',
    secrets: [
      { field: 'bluesky_app_password',  label: 'Bluesky App Password',     hint: 'App password for Bluesky social sensors. Generate at bsky.app/settings/app-passwords.' },
      { field: 'mastodon_token',        label: 'Mastodon Access Token',    hint: 'Access token for Mastodon account monitoring.' },
    ],
    plains: [
      { field: 'bluesky_handle', label: 'Bluesky Handle', hint: 'Your Bluesky handle (e.g., alice.bsky.social).', placeholder: 'e.g., alice.bsky.social' },
    ],
  },
]

const KEY_FIELDS = KEY_GROUPS.flatMap(g => g.secrets)

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

const PLACEHOLDER_STARS = '∙'.repeat(20)

// mode: 'saved' = key exists, showing 20 dots | 'revealed' = showing real value | 'editing' = user typing new key
type Mode = 'saved' | 'revealed' | 'editing'

function MaskedInput({ label, hint, saved, newValue, onNewValue, onReveal }: {
  label: string
  hint: string
  saved: boolean        // true if a key is stored on the server
  newValue: string      // the value the user is typing (empty = no change pending)
  onNewValue: (v: string) => void
  onReveal: () => Promise<string>
}) {
  const [mode, setMode] = useState<Mode>(saved ? 'saved' : 'editing')
  const [realValue, setRealValue] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // When parent reloads after save, reset back to saved/editing based on new saved state
  useEffect(() => {
    setMode(saved ? 'saved' : 'editing')
    setRealValue(null)
  }, [saved])

  const handleShowHide = async () => {
    if (mode === 'revealed') {
      setMode('saved')
      return
    }
    if (mode === 'saved') {
      setLoading(true)
      try {
        const real = await onReveal()
        setRealValue(real)
        setMode('revealed')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleChange = () => {
    setMode('editing')
    setRealValue(null)
    onNewValue('')
  }

  const handleCancelChange = () => {
    setMode('saved')
    onNewValue('')
  }

  if (mode === 'saved' || mode === 'revealed') {
    const displayValue = mode === 'revealed' && realValue !== null ? realValue : PLACEHOLDER_STARS
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', fontFamily: 'inherit' }}>
            {label}
          </label>
          <span style={{
            fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--ok)', background: 'var(--ok-bg)',
            padding: '0.15rem 0.5rem', borderRadius: 999,
          }}>
            Saved
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <input
            readOnly
            type="text"
            value={displayValue}
            style={{
              ...inputBase,
              color: mode === 'revealed' ? 'var(--ink)' : 'var(--ink-faint)',
              letterSpacing: mode === 'revealed' ? 'normal' : '0.15em',
              cursor: 'default',
            }}
          />
          <button
            type="button"
            onClick={handleShowHide}
            disabled={loading}
            style={{
              fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)',
              padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 4,
              background: 'var(--surface)', whiteSpace: 'nowrap', cursor: 'pointer',
              transition: 'color 120ms', flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
          >
            {loading ? '…' : mode === 'revealed' ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            onClick={handleChange}
            style={{
              fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)',
              padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 4,
              background: 'var(--surface)', whiteSpace: 'nowrap', cursor: 'pointer',
              transition: 'color 120ms', flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
          >
            Change
          </button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem', lineHeight: 1.5, fontFamily: 'inherit' }}>
          {hint}
        </p>
      </div>
    )
  }

  // editing mode
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem', fontFamily: 'inherit' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: '0.625rem' }}>
        <input
          type="password"
          value={newValue}
          onChange={(e) => onNewValue(e.target.value)}
          placeholder={saved ? 'Enter new value to replace' : 'not set'}
          autoFocus={saved}
          style={inputBase}
          onFocus={focus}
          onBlur={blur}
        />
        {saved && (
          <button
            type="button"
            onClick={handleCancelChange}
            style={{
              fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)',
              padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 4,
              background: 'var(--surface)', whiteSpace: 'nowrap', cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
          >
            Cancel
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem', lineHeight: 1.5, fontFamily: 'inherit' }}>
        {hint}
      </p>
    </div>
  )
}

export function ApiKeys() {
  const showToast = useToast()
  // savedFlags: which fields have a key stored server-side
  const [savedFlags, setSavedFlags] = useState<Record<string, boolean>>({})
  // pendingValues: new values the user is typing (only sent if non-empty)
  const [pendingValues, setPendingValues] = useState<Record<string, string>>({})
  // plainValues: non-secret config fields (bluesky_handle)
  const [plainValues, setPlainValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const loadConfig = () => {
    api.getConfig().then((cfg) => {
      const flags: Record<string, boolean> = {}
      for (const { field } of KEY_FIELDS) {
        flags[field] = cfg[field] === '***'
      }
      setSavedFlags(flags)
      setPendingValues({})
      setPlainValues({
        bluesky_handle: cfg.bluesky_handle ?? '',
      })
    })
  }

  useEffect(() => { loadConfig() }, [])

  const save = async () => {
    setSaving(true)
    try {
      const partial: Partial<ConfigSettings> = {
        bluesky_handle: plainValues.bluesky_handle || null,
      }
      for (const { field } of KEY_FIELDS) {
        const v = pendingValues[field]
        if (v) (partial as Record<string, string>)[field] = v
      }
      await api.updateConfig(partial)
      loadConfig()
      showToast('API keys saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = { ...inputBase, fontFamily: 'inherit' }

  return (
    <section id="api-keys" style={{ padding: '2rem 0' }}>
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)',
          marginBottom: '0.25rem',
        }}>Credentials</h2>
        <p style={{
          fontSize: '0.8125rem', color: 'var(--ink-muted)',
        }}>
          Credentials for external data sources and AI providers. Saved keys can be revealed on demand.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {KEY_GROUPS.map((group) => (
          <div key={group.title} style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '1.25rem 1.5rem',
            background: 'var(--surface)',
          }}>
            <div style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              marginBottom: '1.25rem',
            }}>
              {group.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {group.secrets.map(({ field, label, hint }) => (
                <MaskedInput
                  key={field}
                  label={label}
                  hint={hint}
                  saved={savedFlags[field] ?? false}
                  newValue={pendingValues[field] ?? ''}
                  onNewValue={(v) => setPendingValues((prev) => ({ ...prev, [field]: v }))}
                  onReveal={async () => {
                    const raw = await api.getRawConfig()
                    return (raw[field] as string | null) ?? ''
                  }}
                />
              ))}
              {group.plains?.map(({ field, label, hint, placeholder }) => (
                <div key={field}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
                    {label}
                  </label>
                  <input
                    type="text"
                    value={plainValues[field] ?? ''}
                    onChange={(e) => setPlainValues((prev) => ({ ...prev, [field]: e.target.value }))}
                    placeholder={placeholder}
                    style={inputStyle}
                    onFocus={focus}
                    onBlur={blur}
                  />
                  {hint && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem', lineHeight: 1.5 }}>
                      {hint}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

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
