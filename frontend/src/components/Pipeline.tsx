// ABOUTME: Pipeline page — schedule, cache, expiry, filters, and output limits.
// ABOUTME: Auto-saves on every change; action buttons (mark stale, cleanup) are independent operations.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'

import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/lib/toast-context'
import { useAutoSave } from '@/lib/hooks/useAutoSave'
import { inputBase, focus, blur, SubLabel, AutoSaveIndicator, ChevronDown } from '@/components/form-styles'
import { ALL_CATEGORIES, CATEGORY_META } from '@/lib/sensors/taxonomy'
import { PipelineSkeleton } from '@/components/Skeleton'

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

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-card)',
  padding: '1.25rem 1.5rem',
  transition: 'box-shadow 200ms ease, border-color 200ms ease',
}

const actionBtnBase: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 500,
  padding: '0.375rem 0.875rem',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  marginLeft: '1rem',
  transition: 'color 200ms ease, border-color 200ms ease, background 200ms ease',
}

export function Pipeline() {
  const { t } = useTranslation()
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
  const [invalidating, setInvalidating] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [hoverInvalidate, setHoverInvalidate] = useState(false)
  const [hoverCleanup, setHoverCleanup] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { status: saveStatus, trigger } = useAutoSave(
    () => ({
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
    }),
    { onError: (e) => showToast(t('ai.save_failed', { error: e.message })) },
  )

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
      setLoaded(true)
    })
  }, [])

  const updateSection = (section: string, value: number) => {
    setSectionLimits((prev) => ({ ...prev, [section]: value }))
    trigger()
  }

  const handleInvalidate = async () => {
    setInvalidating(true)
    try {
      const result = await api.invalidateCache()
      showToast(result.invalidated > 0
        ? t('pipeline.stale_toast', { count: String(result.invalidated) })
        : t('pipeline.stale_none'))
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
        ? t('pipeline.expired_toast', { count: String(result.removed) })
        : t('pipeline.expired_none'))
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    } finally {
      setCleaning(false)
    }
  }

  if (!loaded) {
    return (
      <section id="pipeline">
        <div className="page-header" style={{ paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)', marginBottom: '0.25rem' }}>
            {t('pipeline.title')}
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            {t('pipeline.desc')}
          </p>
        </div>
        <PipelineSkeleton />
      </section>
    )
  }

  return (
    <section id="pipeline">

      <div className="page-header" style={{ paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)', marginBottom: '0.25rem' }}>
            {t('pipeline.title')}
          </h2>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
          {t('pipeline.desc')}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* ── Schedule ── */}
        <div style={cardStyle}>
          <SubLabel>{t('pipeline.schedule')}</SubLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
                  {t('pipeline.daily_fetch_time')}
                </label>
                <input
                  type="time"
                  value={fetchTime}
                  onChange={(e) => { setFetchTime(e.target.value); trigger() }}
                  style={{ ...inputBase, width: '100%' }}
                  onFocus={focus}
                  onBlur={blur}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
                  {t('pipeline.timezone')}
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={timezone}
                    onChange={(e) => { setTimezone(e.target.value); trigger() }}
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
                      <option key={tz} value={tz}>{t('tz.' + tz)}</option>
                    ))}
                  </select>
                  <span style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    color: 'var(--ink-faint)',
                  }}>
                    <ChevronDown size={18} />
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {t('pipeline.concurrency')}
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
                onChange={(e) => { setDefaultConcurrency(Number(e.target.value)); trigger() }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                {t('pipeline.concurrency_desc')}
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {t('pipeline.local_concurrency')}
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
                onChange={(e) => { setLocalSummaryConcurrency(Number(e.target.value)); trigger() }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                {t('pipeline.local_concurrency_desc')}
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {t('pipeline.cache_ttl')}
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
                onChange={(e) => { setCacheTtl(Number(e.target.value)); trigger() }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, margin: 0 }}>
                  {t('pipeline.cache_desc')}
                </p>
                <button
                  onClick={handleInvalidate}
                  disabled={invalidating}
                  onMouseEnter={() => !invalidating && setHoverInvalidate(true)}
                  onMouseLeave={() => setHoverInvalidate(false)}
                  style={{
                    ...actionBtnBase,
                    color: invalidating ? 'var(--ink-faint)' : hoverInvalidate ? 'var(--accent)' : 'var(--ink-muted)',
                    borderColor: invalidating ? 'var(--border)' : hoverInvalidate ? 'var(--accent-dim)' : 'var(--border)',
                    background: hoverInvalidate && !invalidating ? 'var(--accent-wash)' : 'var(--surface)',
                    cursor: invalidating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {invalidating ? t('pipeline.marking') : t('pipeline.mark_stale')}
                </button>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {t('pipeline.post_expiry')}
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
                onChange={(e) => { setPostExpiryDays(Number(e.target.value)); trigger() }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5, margin: 0 }}>
                  {t('pipeline.post_expiry_desc')}
                </p>
                <button
                  onClick={handleCleanup}
                  disabled={cleaning}
                  onMouseEnter={() => !cleaning && setHoverCleanup(true)}
                  onMouseLeave={() => setHoverCleanup(false)}
                  style={{
                    ...actionBtnBase,
                    color: cleaning ? 'var(--ink-faint)' : hoverCleanup ? 'var(--accent)' : 'var(--ink-muted)',
                    borderColor: cleaning ? 'var(--border)' : hoverCleanup ? 'var(--accent-dim)' : 'var(--border)',
                    background: hoverCleanup && !cleaning ? 'var(--accent-wash)' : 'var(--surface)',
                    cursor: cleaning ? 'not-allowed' : 'pointer',
                  }}
                >
                  {cleaning ? t('pipeline.cleaning') : t('pipeline.delete_expired')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Filters ── */}
        <div style={cardStyle}>
          <SubLabel>{t('pipeline.filters')}</SubLabel>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0 }} />
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {t('pipeline.boost')}
                </label>
              </div>
              <TagInput tags={boost} onChange={(tags) => { setBoost(tags); trigger() }} placeholder={t('pipeline.keyword_placeholder')} />
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.5rem' }}>
                {t('pipeline.boost_desc')}
              </p>
            </div>
            <div style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--err)', flexShrink: 0 }} />
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {t('pipeline.suppress')}
                </label>
              </div>
              <TagInput tags={suppress} onChange={(tags) => { setSuppress(tags); trigger() }} placeholder={t('pipeline.keyword_placeholder')} />
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.5rem' }}>
                {t('pipeline.suppress_desc')}
              </p>
            </div>
          </div>
        </div>

        {/* ── Output ── */}
        <div style={cardStyle}>
          <SubLabel>{t('pipeline.output')}</SubLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)' }}>
                  {t('pipeline.default_items')}
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
                onChange={(e) => { setDefaultLimit(Number(e.target.value)); trigger() }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '1rem' }}>
                {t('pipeline.per_section')}
              </label>
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                overflow: 'hidden',
                boxShadow: 'var(--shadow-card)',
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
      </div>
    </section>
  )
}
