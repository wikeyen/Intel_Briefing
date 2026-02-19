// ABOUTME: Pipeline section — schedule, filters, and output settings in one place.
// ABOUTME: Single save covers fetch timing, boost/suppress keywords, and item count limits.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'
import { SectionHeader } from '@/components/SectionHeader'
import { useToast } from '@/lib/toast-context'

const OUTPUT_SECTIONS = [
  { key: 'tech_trends',  label: 'Tech Trends' },
  { key: 'research',     label: 'Research' },
  { key: 'insights',     label: 'Insights' },
  { key: 'products',     label: 'Products' },
  { key: 'capital_flow', label: 'Capital Flow' },
  { key: 'community',    label: 'Community' },
  { key: 'politics',     label: 'Politics' },
  { key: 'topics',       label: 'Topics' },
]

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Seoul',
  'Australia/Sydney',
]

const inputBase: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '0.75rem 1rem',
  fontSize: '0.9375rem',
  color: 'var(--ink)',
  outline: 'none',
  transition: 'border-color 120ms, box-shadow 120ms',
  fontFamily: 'inherit',
}

function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,107,79,0.1)'
}
function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.6875rem',
      fontWeight: 700,
      letterSpacing: '0.09em',
      textTransform: 'uppercase',
      color: 'var(--ink-faint)',
      marginBottom: '1rem',
    }}>
      {children}
    </div>
  )
}

export function Pipeline() {
  const showToast = useToast()
  const [fetchTime, setFetchTime] = useState('07:00')
  const [timezone, setTimezone] = useState('UTC')
  const [cacheTtl, setCacheTtl] = useState(25)
  const [boost, setBoost] = useState<string[]>([])
  const [suppress, setSuppress] = useState<string[]>([])
  const [defaultLimit, setDefaultLimit] = useState(10)
  const [sectionLimits, setSectionLimits] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setFetchTime(cfg.fetch_time)
      setTimezone(cfg.fetch_timezone)
      setCacheTtl(cfg.cache_ttl_hours)
      setBoost(cfg.boost_keywords)
      setSuppress(cfg.suppress_keywords)
      setDefaultLimit(cfg.default_limit)
      setSectionLimits(cfg.sensor_limits ?? {})
    })
  }, [])

  const updateSection = (section: string, value: number) =>
    setSectionLimits((prev) => ({ ...prev, [section]: value }))

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({
        fetch_time: fetchTime,
        fetch_timezone: timezone,
        cache_ttl_hours: cacheTtl,
        boost_keywords: boost,
        suppress_keywords: suppress,
        default_limit: defaultLimit,
        sensor_limits: sectionLimits,
      })
      showToast('Pipeline settings saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="pipeline" style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      gap: '4.5rem',
      padding: '4.5rem 0 6rem',
    }}>
      <SectionHeader
        num="03"
        title="Pipeline"
        description="Scheduling, ranking filters, and output limits for the generated briefing."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

        {/* ── Schedule ── */}
        <div>
          <SubLabel>Schedule</SubLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
                  Daily Fetch Time
                </label>
                <input
                  type="time"
                  value={fetchTime}
                  onChange={(e) => setFetchTime(e.target.value)}
                  style={{ ...inputBase, width: '100%' }}
                  onFocus={focus}
                  onBlur={blur}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
                  Timezone
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    style={{
                      ...inputBase,
                      width: '100%',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      paddingRight: '2.25rem',
                      cursor: 'pointer',
                    }}
                    onFocus={focus}
                    onBlur={blur}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  <span style={{
                    position: 'absolute',
                    right: '0.875rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'var(--ink-faint)',
                    fontSize: '0.625rem',
                    userSelect: 'none',
                  }}>
                    ▾
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  Cache TTL
                </label>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
                  {cacheTtl}h
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={72}
                value={cacheTtl}
                onChange={(e) => setCacheTtl(Number(e.target.value))}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                Data older than this threshold is flagged as stale.
              </p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-soft)' }} />

        {/* ── Filters ── */}
        <div>
          <SubLabel>Filters</SubLabel>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0 }} />
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  Boost Keywords
                </label>
              </div>
              <TagInput tags={boost} onChange={setBoost} placeholder="keyword — press Enter" />
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.5rem' }}>
                Items matching these terms rank higher within their section.
              </p>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--err)', flexShrink: 0 }} />
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
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-soft)' }} />

        {/* ── Output ── */}
        <div>
          <SubLabel>Output</SubLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  Default Items per Section
                </label>
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em' }}>
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
                {OUTPUT_SECTIONS.map(({ key, label }, i) => {
                  const val = sectionLimits[key] ?? defaultLimit
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1.25rem',
                        padding: '0.875rem 1.25rem',
                        borderBottom: i < OUTPUT_SECTIONS.length - 1 ? '1px solid var(--border-soft)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', width: 104, flexShrink: 0 }}>
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
