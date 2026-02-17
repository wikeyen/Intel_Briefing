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
    <section id="filters" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionHeader title="Filters" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          Boost Keywords
        </label>
        <p style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)', margin: '0 0 0.375rem' }}>
          Items matching these keywords rank higher in their section.
        </p>
        <TagInput
          tags={boost}
          onChange={setBoost}
          placeholder="keyword — press Enter"
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          Suppress Keywords
        </label>
        <p style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)', margin: '0 0 0.375rem' }}>
          Items matching these keywords are filtered out entirely.
        </p>
        <TagInput
          tags={suppress}
          onChange={setSuppress}
          placeholder="keyword — press Enter"
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
