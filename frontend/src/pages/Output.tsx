// ABOUTME: Output settings page — language toggle, global limit, and per-section limit sliders.
// ABOUTME: Saves default_language, default_limit, and section_limits to PUT /config.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { SectionHeader } from '../components/SectionHeader'

interface Props {
  showToast: (msg: string) => void
}

const SECTIONS = [
  'tech_trends',
  'research',
  'insights',
  'products',
  'capital_flow',
  'community',
  'politics',
  'topics',
]

export function Output({ showToast }: Props) {
  const [lang, setLang] = useState<'en' | 'zh'>('en')
  const [defaultLimit, setDefaultLimit] = useState(10)
  const [sectionLimits, setSectionLimits] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setLang((cfg.default_language as 'en' | 'zh') ?? 'en')
      setDefaultLimit(cfg.default_limit)
      setSectionLimits(cfg.section_limits ?? {})
    })
  }, [])

  const updateSection = (section: string, value: number) =>
    setSectionLimits((prev) => ({ ...prev, [section]: value }))

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({
        default_language: lang,
        default_limit: defaultLimit,
        section_limits: sectionLimits,
      })
      showToast('Output settings saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="output" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionHeader title="Output" />

      {/* Language segmented control */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          Language
        </label>
        <div style={{
          display: 'inline-flex',
          border: '1px solid var(--border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          {(['en', 'zh'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              style={{
                padding: '0.5rem 1.5rem',
                fontSize: '0.8125rem',
                fontWeight: lang === l ? 500 : 400,
                color: lang === l ? 'var(--canvas)' : 'var(--ink-muted)',
                background: lang === l ? 'var(--accent)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 150ms, color 150ms',
              }}
            >
              {l === 'en' ? 'English' : 'Chinese'}
            </button>
          ))}
        </div>
      </div>

      {/* Global limit */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          Default Items per Section —{' '}
          <span style={{ color: 'var(--ink)' }}>{defaultLimit}</span>
        </label>
        <input
          type="range"
          min={3}
          max={50}
          value={defaultLimit}
          onChange={(e) => setDefaultLimit(Number(e.target.value))}
        />
      </div>

      {/* Per-section overrides */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>
          Per-Section Overrides
        </label>
        {SECTIONS.map((section) => {
          const val = sectionLimits[section] ?? defaultLimit
          return (
            <div key={section} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--ink-muted)',
                width: 128,
                flexShrink: 0,
                fontFamily: 'ui-monospace, monospace',
              }}>
                {section}
              </span>
              <input
                type="range"
                min={1}
                max={50}
                value={val}
                onChange={(e) => updateSection(section, Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{
                fontSize: '0.8125rem',
                color: 'var(--ink)',
                width: 24,
                textAlign: 'right',
                fontFamily: 'ui-monospace, monospace',
                flexShrink: 0,
              }}>
                {val}
              </span>
            </div>
          )
        })}
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
