// ABOUTME: API key management page — saved keys show 20 asterisks; Show reveals the real value.
// ABOUTME: Auto-saves on change; uses GET /config/raw to reveal stored keys on demand.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import type { ConfigSettings } from '@/api/client'
import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/lib/toast-context'
import { useAutoSave } from '@/lib/hooks/useAutoSave'
import { inputBase as _inputBase, focus, blur, AutoSaveIndicator } from '@/components/form-styles'
import { MaskedInput } from '@/components/MaskedInput'
import { ConnectionsSkeleton } from '@/components/Skeleton'

interface KeyFieldDef { field: keyof ConfigSettings; label: string; hint: string }
interface PlainFieldDef { field: keyof ConfigSettings; label: string; hint?: string; placeholder?: string }
interface FieldGroup {
  title: string
  secrets: KeyFieldDef[]
  plains?: PlainFieldDef[]
}

const KEY_GROUPS: FieldGroup[] = [
  {
    title: 'creds.ai_providers',
    secrets: [
      { field: 'summary_api_key',       label: 'creds.summary_key',          hint: 'creds.summary_hint' },
    ],
  },
  {
    title: 'creds.data_sources',
    secrets: [
      { field: 'github_token',          label: 'creds.github_token',             hint: 'creds.github_hint' },
      { field: 'producthunt_token',     label: 'creds.producthunt_token',       hint: 'creds.producthunt_hint' },
    ],
  },
  {
    title: 'creds.social_platforms',
    secrets: [
      { field: 'twitter_auth_token',    label: 'creds.twitter_auth', hint: 'creds.twitter_auth_hint' },
      { field: 'twitter_ct0',           label: 'creds.twitter_ct0',        hint: 'creds.twitter_ct0_hint' },
      { field: 'apify_token',           label: 'creds.apify_token',           hint: 'creds.apify_hint' },
      { field: 'bluesky_app_password',  label: 'creds.bluesky_password',     hint: 'creds.bluesky_hint' },
      { field: 'mastodon_token',        label: 'creds.mastodon_token',    hint: 'creds.mastodon_hint' },
    ],
    plains: [
      { field: 'bluesky_handle', label: 'creds.bluesky_handle', hint: 'creds.bluesky_handle_hint', placeholder: 'creds.bluesky_handle_placeholder' },
    ],
  },
]

const KEY_FIELDS = KEY_GROUPS.flatMap(g => g.secrets)

const inputBase: React.CSSProperties = { ..._inputBase, width: '100%', fontFamily: 'ui-monospace, monospace' }

const GROUP_CARD_BASE: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '1.25rem 1.5rem',
  background: 'var(--surface)',
  boxShadow: 'var(--shadow-card)',
  transition: 'box-shadow 200ms ease, border-color 200ms ease',
}

export function ApiKeys() {
  const { t } = useTranslation()
  const showToast = useToast()
  // savedFlags: which fields have a key stored server-side
  const [savedFlags, setSavedFlags] = useState<Record<string, boolean>>({})
  // pendingValues: new values the user is typing (only sent if non-empty)
  const [pendingValues, setPendingValues] = useState<Record<string, string>>({})
  // plainValues: non-secret config fields (bluesky_handle)
  const [plainValues, setPlainValues] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

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
      setLoaded(true)
    })
  }

  const { status: saveStatus, trigger } = useAutoSave(
    () => {
      const partial: Partial<ConfigSettings> = {
        bluesky_handle: plainValues.bluesky_handle || null,
      }
      for (const { field } of KEY_FIELDS) {
        const v = pendingValues[field]
        if (v) (partial as Record<string, string>)[field] = v
      }
      return partial
    },
    {
      delay: 1200,
      onError: (e) => showToast(t('ai.save_failed', { error: e.message })),
      onSaved: () => {
        // Mark fields as saved and clear their pending values
        const savedFields = KEY_FIELDS.filter(({ field }) => !!pendingValues[field]).map(f => f.field)
        if (savedFields.length > 0) {
          setSavedFlags(prev => {
            const next = { ...prev }
            for (const f of savedFields) next[f] = true
            return next
          })
          setPendingValues(prev => {
            const next = { ...prev }
            for (const f of savedFields) delete next[f]
            return next
          })
        }
      },
    },
  )

  useEffect(() => { loadConfig() }, [])

  const inputStyle: React.CSSProperties = { ...inputBase, fontFamily: 'inherit' }

  if (!loaded) {
    return (
      <section id="api-keys">
        <div className="page-header" style={{ paddingBottom: '1rem' }}>
          <h2 style={{
            fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)',
            letterSpacing: '-0.01em',
            marginBottom: '0.25rem',
          }}>{t('creds.title')}</h2>
          <p style={{
            fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5,
          }}>
            {t('creds.desc')}
          </p>
        </div>
        <ConnectionsSkeleton />
      </section>
    )
  }

  return (
    <section id="api-keys">
      <div className="page-header" style={{ paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)',
            letterSpacing: '-0.01em',
            marginBottom: '0.25rem',
          }}>{t('creds.title')}</h2>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <p style={{
          fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5,
        }}>
          {t('creds.desc')}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {KEY_GROUPS.map((group) => (
          <div
            key={group.title}
            style={GROUP_CARD_BASE}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)'
              e.currentTarget.style.borderColor = 'var(--border-strong)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'var(--shadow-card)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            <div style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              marginBottom: '1rem',
            }}>
              {t(group.title)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {group.secrets.map(({ field, label, hint }) => (
                <MaskedInput
                  key={field}
                  label={t(label)}
                  hint={t(hint)}
                  saved={savedFlags[field] ?? false}
                  newValue={pendingValues[field] ?? ''}
                  onNewValue={(v) => { setPendingValues((prev) => ({ ...prev, [field]: v })); if (v) trigger() }}
                  onReveal={async () => {
                    const raw = await api.getRawConfig()
                    return (raw[field] as string | null) ?? ''
                  }}
                />
              ))}
              {group.plains?.map(({ field, label, hint, placeholder }) => (
                <div key={field}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.375rem' }}>
                    {t(label)}
                  </label>
                  <input
                    type="text"
                    value={plainValues[field] ?? ''}
                    onChange={(e) => { setPlainValues((prev) => ({ ...prev, [field]: e.target.value })); trigger() }}
                    placeholder={placeholder ? t(placeholder) : undefined}
                    style={inputStyle}
                    onFocus={focus}
                    onBlur={blur}
                  />
                  {hint && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem', lineHeight: 1.5 }}>
                      {t(hint)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
