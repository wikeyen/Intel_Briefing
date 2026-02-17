// ABOUTME: Topics page — manage keywords and hashtags searched via Grok.
// ABOUTME: Tag input for keyword list; preview cards show latest topics items.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { IntelItem } from '../api/client'
import { TagInput } from '../components/TagInput'
import { SectionHeader } from '../components/SectionHeader'

interface Props {
  showToast: (msg: string) => void
}

function PreviewCard({ item }: { item: IntelItem }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 4,
      padding: '1rem 1.25rem',
    }}>
      {item.topic && (
        <div style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: 'var(--accent-dim)',
          letterSpacing: '0.04em',
          marginBottom: '0.375rem',
        }}>
          {item.topic}
        </div>
      )}
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
      {item.handle && (
        <div style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>
          {item.handle}
        </div>
      )}
    </div>
  )
}

export function Topics({ showToast }: Props) {
  const [keywords, setKeywords] = useState<string[]>([])
  const [preview, setPreview] = useState<IntelItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => setKeywords(cfg.topics_keywords))
    api.getLatest().then((report) => {
      setPreview(report.items['topics'] ?? [])
    }).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({ topics_keywords: keywords })
      showToast('Topics saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="topics" style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      gap: '4.5rem',
      padding: '4.5rem 0',
      borderBottom: '1px solid var(--border-soft)',
    }}>
      <SectionHeader
        num="05"
        title="Topics"
        description="Keywords and hashtags searched via Grok for trend and sentiment tracking. Requires an xAI API key."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
            Keywords / Hashtags
          </label>
          <TagInput
            tags={keywords}
            onChange={setKeywords}
            placeholder="keyword or #hashtag — press Enter"
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.375rem' }}>
            Use # prefix for hashtags. Press Enter or Tab to add each term.
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
