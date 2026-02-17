// ABOUTME: Filters page — boost and suppress keyword lists for ranking pipeline.
// ABOUTME: Two independent tag inputs; saves both lists to PUT /config.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { TagInput } from '../components/TagInput'
import { SectionHeader } from '../components/SectionHeader'

interface Props {
  showToast: (msg: string) => void
}

export function Filters({ showToast }: Props) {
  const [boost, setBoost] = useState<string[]>([])
  const [suppress, setSuppress] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setBoost(cfg.boost_keywords)
      setSuppress(cfg.suppress_keywords)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({ boost_keywords: boost, suppress_keywords: suppress })
      showToast('Filters saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="filters" style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      gap: '4.5rem',
      padding: '4.5rem 0',
      borderBottom: '1px solid var(--border-soft)',
    }}>
      <SectionHeader
        num="06"
        title="Filters"
        description="Keyword-based ranking rules applied across all sections of the generated briefing."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          overflow: 'hidden',
        }}>
          {/* Boost */}
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--ok)',
                flexShrink: 0,
              }} />
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                Boost Keywords
              </label>
            </div>
            <TagInput tags={boost} onChange={setBoost} placeholder="keyword — press Enter" />
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.5rem' }}>
              Items matching these terms rank higher within their section.
            </p>
          </div>

          {/* Suppress */}
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--err)',
                flexShrink: 0,
              }} />
              <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                Suppress Keywords
              </label>
            </div>
            <TagInput tags={suppress} onChange={setSuppress} placeholder="keyword — press Enter" />
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.5rem' }}>
              Items matching these terms are removed from the briefing entirely.
            </p>
          </div>
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
