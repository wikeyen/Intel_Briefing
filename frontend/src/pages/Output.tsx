// ABOUTME: Output settings page — language toggle, global limit, and per-section item count sliders.
// ABOUTME: Saves default_language, default_limit, and section_limits to PUT /config.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import { SectionHeader } from '../components/SectionHeader'

interface Props {
  showToast: (msg: string) => void
}

const SECTIONS = [
  { key: 'tech_trends',   label: 'Tech Trends' },
  { key: 'research',      label: 'Research' },
  { key: 'insights',      label: 'Insights' },
  { key: 'products',      label: 'Products' },
  { key: 'capital_flow',  label: 'Capital Flow' },
  { key: 'community',     label: 'Community' },
  { key: 'politics',      label: 'Politics' },
  { key: 'topics',        label: 'Topics' },
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
    <section id="output" style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      gap: '4.5rem',
      padding: '4.5rem 0 6rem',
    }}>
      <SectionHeader
        num="07"
        title="Output"
        description="Language preference and item count limits for the generated daily briefing."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

        {/* Language */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.625rem' }}>
            Language
          </label>
          <div style={{
            display: 'inline-flex',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
            background: 'var(--surface)',
          }}>
            {(['en', 'zh'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                style={{
                  padding: '0.5rem 1.75rem',
                  fontSize: '0.875rem',
                  fontWeight: lang === l ? 600 : 400,
                  color: lang === l ? '#FFFFFF' : 'var(--ink-muted)',
                  background: lang === l ? 'var(--ink)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {l === 'en' ? 'English' : '中文'}
              </button>
            ))}
          </div>
        </div>

        {/* Global limit */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
              Default Items per Section
            </label>
            <span style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              color: 'var(--ink)',
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '-0.02em',
            }}>
              {defaultLimit}
            </span>
          </div>
          <input
            type="range"
            min={3}
            max={50}
            value={defaultLimit}
            onChange={(e) => setDefaultLimit(Number(e.target.value))}
          />
        </div>

        {/* Per-section overrides */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '1rem' }}>
            Per-Section Overrides
          </label>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            {SECTIONS.map(({ key, label }, i) => {
              const val = sectionLimits[key] ?? defaultLimit
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.25rem',
                    padding: '0.875rem 1.25rem',
                    borderBottom: i < SECTIONS.length - 1 ? '1px solid var(--border-soft)' : 'none',
                  }}
                >
                  <span style={{
                    fontSize: '0.8125rem',
                    color: 'var(--ink-muted)',
                    width: 104,
                    flexShrink: 0,
                  }}>
                    {label}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={val}
                    onChange={(e) => updateSection(key, Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    width: 28,
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
