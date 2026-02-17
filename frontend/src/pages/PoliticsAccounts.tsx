// ABOUTME: Politics accounts page — manage X/Twitter handles monitored via Grok.
// ABOUTME: Tag input for handle list; preview cards show latest politics items.
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

function PreviewCard({ item }: { item: IntelItem }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 4,
      padding: '1rem 1.25rem',
    }}>
      <div style={{
        fontSize: '0.6875rem',
        fontWeight: 600,
        color: 'var(--accent-dim)',
        letterSpacing: '0.04em',
        marginBottom: '0.375rem',
      }}>
        {item.account ?? item.handle}
      </div>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          fontSize: '0.875rem',
          color: 'var(--ink)',
          lineHeight: 1.5,
          marginBottom: '0.375rem',
          transition: 'color 120ms',
        }}
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
  )
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

  const handleAdd = (tags: string[]) => setAccounts(tags.map(normalizeHandle))

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
    <section id="politics" style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      gap: '4.5rem',
      padding: '4.5rem 0',
      borderBottom: '1px solid var(--border-soft)',
    }}>
      <SectionHeader
        num="04"
        title="Politics Accounts"
        description="X/Twitter handles monitored via Grok for political intelligence. Requires an xAI API key."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
            Handles
          </label>
          <TagInput
            tags={accounts}
            onChange={handleAdd}
            placeholder="@handle — press Enter"
            validate={validateHandle}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem' }}>
            Type a handle and press Enter or Tab to add.
          </p>
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

        {preview.length > 0 && (
          <div>
            <div style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              marginBottom: '0.875rem',
            }}>
              Latest Items
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {preview.map((item) => <PreviewCard key={item.id} item={item} />)}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
