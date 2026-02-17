// ABOUTME: Politics accounts page — manage X/Twitter handles monitored via Grok.
// ABOUTME: Tag input for handle list; preview panel shows latest politics items.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { IntelItem } from '../api/client'
import { TagInput } from '../components/TagInput'
import { SectionHeader } from '../components/SectionHeader'

interface Props {
  showToast: (msg: string) => void
}

function validateHandle(value: string): string | null {
  const clean = value.startsWith('@') ? value : `@${value}`
  if (!/^@[A-Za-z0-9_]{1,50}$/.test(clean)) return 'Invalid handle format'
  return null
}

function normalizeHandle(value: string): string {
  return value.startsWith('@') ? value : `@${value}`
}

export function PoliticsAccounts({ showToast }: Props) {
  const [accounts, setAccounts] = useState<string[]>([])
  const [preview, setPreview] = useState<IntelItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => setAccounts(cfg.politics_accounts))
    api.getLatest().then((report) => {
      setPreview(report.items['politics'] ?? [])
    }).catch(() => {})
  }, [])

  const handleAdd = (tags: string[]) => {
    // normalize all handles to start with @
    setAccounts(tags.map(normalizeHandle))
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({ politics_accounts: accounts })
      showToast('Politics accounts saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="politics" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionHeader title="Politics Accounts" />
      <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', margin: 0 }}>
        X/Twitter handles to monitor via Grok. Requires xAI API key.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          Handles
        </label>
        <TagInput
          tags={accounts}
          onChange={handleAdd}
          placeholder="@handle — press Enter"
          validate={validateHandle}
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

      {preview.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          <div style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: '0.75rem',
          }}>
            Latest Politics Items
          </div>
          {preview.map((item) => (
            <div key={item.id} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              padding: '0.75rem 0 0.75rem 1rem',
              borderLeft: '2px solid var(--border)',
              marginBottom: '0.75rem',
            }}>
              <div style={{ fontSize: '0.6875rem', color: 'var(--accent-dim)', fontWeight: 500 }}>
                {item.account ?? item.handle}
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.875rem', color: 'var(--ink)', transition: 'color 150ms' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
              >
                {item.title}
              </a>
              {item.published_at && (
                <div style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>
                  {item.published_at.slice(0, 16).replace('T', ' ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
