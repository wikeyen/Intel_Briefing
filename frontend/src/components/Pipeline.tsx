// ABOUTME: Pipeline page — schedule, cache, expiry, filters, and output limits.
// ABOUTME: Single save covers fetch timing, retention, boost/suppress keywords, and item count limits.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'

import { useToast } from '@/lib/toast-context'
import { ALL_CATEGORIES, CATEGORY_META } from '@/lib/sensors/taxonomy'

const OUTPUT_SECTIONS = ALL_CATEGORIES.map(key => ({
  key,
  label: CATEGORY_META[key].label,
}))

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
  const [defaultConcurrency, setDefaultConcurrency] = useState(4)
  const [localSummaryConcurrency, setLocalSummaryConcurrency] = useState(1)
  const [cacheTtl, setCacheTtl] = useState(25)
  const [postExpiryDays, setPostExpiryDays] = useState(30)
  const [boost, setBoost] = useState<string[]>([])
  const [suppress, setSuppress] = useState<string[]>([])
  const [defaultLimit, setDefaultLimit] = useState(10)
  const [sectionLimits, setSectionLimits] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [invalidating, setInvalidating] = useState(false)
  const [cleaning, setCleaning] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setFetchTime(cfg.fetch_time)
      setTimezone(cfg.fetch_timezone)
      setDefaultConcurrency(cfg.default_concurrency ?? 4)
      setLocalSummaryConcurrency(cfg.local_summary_concurrency ?? 1)
      setCacheTtl(cfg.cache_ttl_hours)
      setPostExpiryDays(cfg.post_expiry_days ?? 30)
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
        default_concurrency: defaultConcurrency,
        local_summary_concurrency: localSummaryConcurrency,
        cache_ttl_hours: cacheTtl,
        post_expiry_days: postExpiryDays,
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

  const handleInvalidate = async () => {
    setInvalidating(true)
    try {
      const result = await api.invalidateCache()
      showToast(result.invalidated > 0
        ? `Marked ${result.invalidated} cached items as stale`
        : 'No cached items to invalidate')
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    } finally {
      setInvalidating(false)
    }
  }

  const handleCleanup = async () => {
    setCleaning(true)
    try {
      const result = await api.cleanupExpired()
      showToast(result.removed > 0
        ? `Removed ${result.removed} expired items`
        : 'No expired items to remove')
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    } finally {
      setCleaning(false)
    }
  }

  return (
    <section id="pipeline" style={{ padding: '4.5rem 0' }}>

      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
          Pipeline
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
          Scheduling, ranking filters, and output limits for the generated briefing.
        </p>
      </div>

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
                  Default Concurrency
                </label>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
                  {defaultConcurrency}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={13}
                value={defaultConcurrency}
                onChange={(e) => setDefaultConcurrency(Number(e.target.value))}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                Parallel limit for fetching and summarization. Applies to both stages.
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  Local Model Summary Concurrency
                </label>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
                  {localSummaryConcurrency}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={13}
                value={localSummaryConcurrency}
                onChange={(e) => setLocalSummaryConcurrency(Number(e.target.value))}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                Override for local models (Ollama). Cloud providers use the default concurrency above.
              </p>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, margin: 0 }}>
                  Data older than this threshold is flagged as stale.
                </p>
                <button
                  onClick={handleInvalidate}
                  disabled={invalidating}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    padding: '0.375rem 0.875rem',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    color: invalidating ? 'var(--ink-faint)' : 'var(--ink-muted)',
                    background: 'var(--surface)',
                    cursor: invalidating ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    marginLeft: '1rem',
                    transition: 'color 120ms, border-color 120ms',
                  }}
                >
                  {invalidating ? 'Marking…' : 'Mark Stale Now'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  Post Expiry
                </label>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
                  {postExpiryDays}d
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={90}
                value={postExpiryDays}
                onChange={(e) => setPostExpiryDays(Number(e.target.value))}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, margin: 0 }}>
                  Posts older than this are automatically deleted by the cleanup cron job.
                </p>
                <button
                  onClick={handleCleanup}
                  disabled={cleaning}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    padding: '0.375rem 0.875rem',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    color: cleaning ? 'var(--ink-faint)' : 'var(--ink-muted)',
                    background: 'var(--surface)',
                    cursor: cleaning ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    marginLeft: '1rem',
                    transition: 'color 120ms, border-color 120ms',
                  }}
                >
                  {cleaning ? 'Cleaning…' : 'Delete Expired Now'}
                </button>
              </div>
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
                max={200}
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
                        max={200}
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
