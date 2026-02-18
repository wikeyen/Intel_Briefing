// ABOUTME: Unified settings page — sources, limits, schedule, and filters in one place.
// ABOUTME: Table-first card merges source toggles with per-sensor limit overrides.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'
import { useToast } from '@/lib/toast-context'

/* ── Sensor definitions ── */

interface SensorDef {
  key: string
  label: string
  desc: string
}

const SENSOR_GROUPS: { label: string; sensors: SensorDef[] }[] = [
  {
    label: 'General',
    sensors: [
      { key: 'hacker_news',  label: 'Hacker News',     desc: 'Top stories from news.ycombinator.com' },
      { key: 'arxiv',        label: 'ArXiv AI',         desc: 'Latest AI/ML research preprints' },
      { key: 'github',       label: 'GitHub Trending',  desc: 'Daily trending repositories' },
      { key: 'product_hunt', label: 'Product Hunt',     desc: 'Top products of the day' },
      { key: 'hn_blogs',     label: 'HN Blogs',         desc: 'Curated blog posts from Hacker News' },
    ],
  },
  {
    label: 'Chinese / 中文',
    sensors: [
      { key: 'v2ex',         label: 'V2EX',          desc: 'Chinese tech community hot posts' },
      { key: 'sources_36kr', label: '36Kr',           desc: 'Chinese startup and tech news' },
      { key: 'wallstreetcn', label: 'WallStreetCN',   desc: 'Chinese financial and macro news' },
    ],
  },
  {
    label: 'Grok / xAI',
    sensors: [
      { key: 'grok',     label: 'Grok Tech Trends',  desc: 'Tech trends via xAI Grok search' },
      { key: 'politics', label: 'Accounts',           desc: 'X/Twitter accounts monitored via Grok' },
      { key: 'topics',   label: 'Topics Keywords',   desc: 'Keyword searches via Grok' },
    ],
  },
]

const ALL_SENSORS = SENSOR_GROUPS.flatMap((g) => g.sensors)

/** Maps sensor names to their default lookback hours. Sensors not listed have no lookback support. */
const SENSOR_LOOKBACK_SUPPORT: Record<string, number> = {
  hacker_news: 24,
  github: 168,
  grok: 24,
  politics: 48,
  topics: 48,
  hn_blogs: 72,
  arxiv: 72,
  wallstreetcn: 24,
}

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

type SensorStatus = 'ok' | 'failed' | 'disabled'

/* ── Shared sub-components ── */

function Badge({ status }: { status: SensorStatus | undefined }) {
  if (!status) return null
  const map: Record<string, { bg: string; color: string; label: string }> = {
    ok:       { bg: 'var(--ok-bg)',       color: 'var(--ok)',        label: 'OK' },
    failed:   { bg: 'var(--err-bg)',      color: 'var(--err)',       label: 'Failed' },
    disabled: { bg: 'var(--surface-alt)', color: 'var(--ink-faint)', label: 'Off' },
  }
  const s = map[status]
  return (
    <span style={{
      fontSize: '0.6875rem',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      background: s.bg,
      color: s.color,
      padding: '0.2rem 0.625rem',
      borderRadius: 999,
    }}>
      {s.label}
    </span>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        borderRadius: 10,
        border: on ? 'none' : '1.5px solid var(--border)',
        background: on ? 'var(--accent)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 150ms, border-color 150ms',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: on ? 3 : 2,
        left: on ? 19 : 2,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: on ? '#FFFFFF' : 'var(--ink-faint)',
        transition: 'left 150ms, background 150ms',
        boxShadow: on ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
      }} />
    </button>
  )
}

function CardHeader({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h3 style={{
        fontSize: '1rem',
        fontWeight: 600,
        color: 'var(--ink)',
        letterSpacing: '-0.01em',
        marginBottom: '0.25rem',
      }}>
        {title}
      </h3>
      <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.6875rem',
      fontWeight: 700,
      letterSpacing: '0.09em',
      textTransform: 'uppercase',
      color: 'var(--ink-faint)',
      marginBottom: '0.75rem',
    }}>
      {children}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '1.5rem',
}

const cardDivider: React.CSSProperties = {
  height: 1,
  background: 'var(--border-soft)',
  margin: '1.25rem 0',
}

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

function focusInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)'
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,107,79,0.1)'
}
function blurInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}

function validateHandle(value: string): string | null {
  const clean = value.startsWith('@') ? value : `@${value}`
  if (!/^@[A-Za-z0-9_]{1,50}$/.test(clean)) return 'Invalid handle format'
  return null
}

function normalizeHandle(value: string): string {
  return value.startsWith('@') ? value : `@${value}`
}

/** CSS to hide number input spinners across browsers */
const HIDE_SPINNERS_CSS = `
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
`

/* ── Main component ── */

export function Settings() {
  const showToast = useToast()

  // Sources state
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [statuses, setStatuses] = useState<Record<string, SensorStatus>>({})
  const [politicsAccounts, setPoliticsAccounts] = useState<string[]>([])
  const [topicsKeywords, setTopicsKeywords] = useState<string[]>([])

  // Limits state
  const [defaultLimit, setDefaultLimit] = useState(10)
  const [defaultLookback, setDefaultLookback] = useState(24)
  const [sensorLimits, setSensorLimits] = useState<Record<string, number>>({})
  const [sensorLookback, setSensorLookback] = useState<Record<string, number>>({})

  // Schedule state
  const [fetchTime, setFetchTime] = useState('07:00')
  const [timezone, setTimezone] = useState('UTC')
  const [cacheTtl, setCacheTtl] = useState(25)
  const [postExpiryDays, setPostExpiryDays] = useState(30)

  // Filters state
  const [boost, setBoost] = useState<string[]>([])
  const [suppress, setSuppress] = useState<string[]>([])

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then((cfg) => {
      const defaults: Record<string, boolean> = {}
      for (const { key } of ALL_SENSORS) defaults[key] = true
      setEnabled({ ...defaults, ...cfg.sensors_enabled })
      setPoliticsAccounts(cfg.politics_accounts)
      setTopicsKeywords(cfg.topics_keywords)
      setSensorLimits(cfg.sensor_limits ?? {})
      setSensorLookback(cfg.sensor_lookback_hours ?? {})
      setDefaultLimit(cfg.default_limit)
      setFetchTime(cfg.fetch_time)
      setTimezone(cfg.fetch_timezone)
      setCacheTtl(cfg.cache_ttl_hours)
      setBoost(cfg.boost_keywords)
      setSuppress(cfg.suppress_keywords)
      setPostExpiryDays(cfg.post_expiry_days ?? 30)
    })
    api.getLatest().then((report) => {
      const map: Record<string, SensorStatus> = {}
      for (const key of report.sources_ok) map[key] = 'ok'
      for (const key of report.sources_failed) map[key] = 'failed'
      setStatuses(map)
    }).catch(() => {})
  }, [])

  const toggle = (key: string) => setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))

  const updateSensorLimit = (key: string, value: string) => {
    if (value === '') {
      setSensorLimits((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } else {
      const n = Number(value)
      if (!isNaN(n) && n >= 1 && n <= 50) {
        setSensorLimits((prev) => ({ ...prev, [key]: n }))
      }
    }
  }

  const updateSensorLookback = (key: string, value: string) => {
    if (value === '') {
      setSensorLookback((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } else {
      const n = Number(value)
      if (!isNaN(n) && n >= 1 && n <= 336) {
        setSensorLookback((prev) => ({ ...prev, [key]: n }))
      }
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig({
        sensors_enabled: enabled,
        sensor_limits: sensorLimits,
        sensor_lookback_hours: sensorLookback,
        default_limit: defaultLimit,
        politics_accounts: politicsAccounts,
        topics_keywords: topicsKeywords,
        fetch_time: fetchTime,
        fetch_timezone: timezone,
        cache_ttl_hours: cacheTtl,
        post_expiry_days: postExpiryDays,
        boost_keywords: boost,
        suppress_keywords: suppress,
      })
      showToast('Settings saved')
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const getBadge = (key: string): SensorStatus | undefined =>
    !enabled[key] ? 'disabled' : statuses[key]

  /* ── Compact number input for the table ── */
  const numInput = (
    value: number | undefined,
    placeholder: number,
    onChange: (v: string) => void,
  ) => (
    <input
      type="number"
      min={1}
      max={336}
      value={value ?? ''}
      placeholder={String(placeholder)}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: 56,
        padding: '0.375rem 0.5rem',
        border: '1px solid var(--border-soft)',
        borderRadius: 4,
        background: 'var(--canvas)',
        color: value !== undefined ? 'var(--ink)' : 'var(--ink-faint)',
        fontSize: '0.8125rem',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontWeight: 500,
        textAlign: 'right',
        outline: 'none',
        transition: 'border-color 120ms',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        MozAppearance: 'textfield' as any,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-soft)' }}
    />
  )

  return (
    <section id="settings" style={{ padding: '2.5rem 0 6rem' }}>
      <style dangerouslySetInnerHTML={{ __html: HIDE_SPINNERS_CSS }} />

      {/* Page title */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          color: 'var(--ink)',
          letterSpacing: '-0.01em',
          marginBottom: '0.375rem',
        }}>
          Settings
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
          Sources, limits, scheduling, and filters — all in one place.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* ═══ Card 1: Sources & Limits (merged) ═══ */}
        <div style={cardStyle}>
          <CardHeader
            title="Sources & Limits"
            description="Toggle sources and configure how many items to fetch. Leave limit fields blank to use defaults."
          />

          {/* Global defaults */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            padding: '1rem',
            background: 'var(--canvas)',
            borderRadius: 6,
            border: '1px solid var(--border-soft)',
            marginBottom: '1.25rem',
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                Default Items
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={defaultLimit}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (!isNaN(n) && n >= 1 && n <= 50) setDefaultLimit(n)
                }}
                style={{ ...inputBase, width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600 }}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                Default Lookback (hours)
              </label>
              <input
                type="number"
                min={1}
                max={336}
                value={defaultLookback}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (!isNaN(n) && n >= 1 && n <= 336) setDefaultLookback(n)
                }}
                style={{ ...inputBase, width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600 }}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>
          </div>

          {/* Source table by group */}
          {SENSOR_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: '1rem' }}>
              <SubLabel>{group.label}</SubLabel>

              <div style={{
                border: '1px solid var(--border-soft)',
                borderRadius: 6,
                overflow: 'hidden',
              }}>
                {/* Table header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 64px 64px 56px',
                  gap: '0.5rem',
                  alignItems: 'center',
                  padding: '0.4rem 1rem',
                  background: 'var(--canvas)',
                  borderBottom: '1px solid var(--border-soft)',
                }}>
                  <span />
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Source
                  </span>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>
                    Items
                  </span>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>
                    Hours
                  </span>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>
                    Status
                  </span>
                </div>

                {group.sensors.map(({ key, label, desc }, i) => {
                  const isLast = i === group.sensors.length - 1
                  const isPolitics = key === 'politics'
                  const isTopics = key === 'topics'
                  const isOn = enabled[key] ?? true
                  const hasLookback = key in SENSOR_LOOKBACK_SUPPORT
                  const lookbackDefault = SENSOR_LOOKBACK_SUPPORT[key] ?? defaultLookback
                  const showSubConfig = (isPolitics || isTopics) && isOn

                  return (
                    <div key={key}>
                      {/* Sensor row */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '36px 1fr 64px 64px 56px',
                          gap: '0.5rem',
                          alignItems: 'center',
                          padding: '0.625rem 1rem',
                          borderBottom: showSubConfig || !isLast ? '1px solid var(--border-soft)' : 'none',
                          transition: 'background 120ms',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <Toggle on={isOn} onClick={() => toggle(key)} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: isOn ? 'var(--ink)' : 'var(--ink-faint)',
                          }}>
                            {label}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)', lineHeight: 1.3 }}>
                            {desc}
                          </div>
                        </div>

                        {/* Items input */}
                        {isOn ? (
                          numInput(sensorLimits[key], defaultLimit, (v) => updateSensorLimit(key, v))
                        ) : (
                          <span style={{ textAlign: 'right', color: 'var(--ink-faint)', fontSize: '0.8125rem' }}>—</span>
                        )}

                        {/* Lookback input */}
                        {isOn && hasLookback ? (
                          numInput(sensorLookback[key], lookbackDefault, (v) => updateSensorLookback(key, v))
                        ) : (
                          <span style={{ textAlign: 'right', color: 'var(--ink-faint)', fontSize: '0.8125rem' }}>—</span>
                        )}

                        {/* Status badge */}
                        <div style={{ textAlign: 'right' }}>
                          <Badge status={getBadge(key)} />
                        </div>
                      </div>

                      {/* Inline sub-config: Politics Accounts */}
                      {isPolitics && isOn && (
                        <div style={{
                          padding: '1rem 1rem 1.25rem 3.5rem',
                          background: 'var(--canvas)',
                          borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                        }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
                            X/Twitter handles to monitor
                          </div>
                          <TagInput
                            tags={politicsAccounts}
                            onChange={(tags) => setPoliticsAccounts(tags.map(normalizeHandle))}
                            placeholder="@handle — press Enter"
                            validate={validateHandle}
                          />
                        </div>
                      )}

                      {/* Inline sub-config: Topics Keywords */}
                      {isTopics && isOn && (
                        <div style={{
                          padding: '1rem 1rem 1.25rem 3.5rem',
                          background: 'var(--canvas)',
                          borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                        }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
                            Keywords and hashtags to search
                          </div>
                          <TagInput
                            tags={topicsKeywords}
                            onChange={setTopicsKeywords}
                            placeholder="keyword or #hashtag — press Enter"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ═══ Card 2: Schedule ═══ */}
        <div style={cardStyle}>
          <CardHeader
            title="Schedule"
            description="When to fetch data and how long to keep it."
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.5rem' }}>
                Daily Fetch Time
              </label>
              <input
                type="time"
                value={fetchTime}
                onChange={(e) => setFetchTime(e.target.value)}
                style={{ ...inputBase, width: '100%' }}
                onFocus={focusInput}
                onBlur={blurInput}
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
                  onFocus={focusInput}
                  onBlur={blurInput}
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

          <div style={cardDivider} />

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
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.5rem', lineHeight: 1.5 }}>
              Posts older than this are automatically deleted by the cleanup cron job.
            </p>
          </div>
        </div>

        {/* ═══ Card 3: Filters ═══ */}
        <div style={cardStyle}>
          <CardHeader
            title="Filters"
            description="Boost or suppress items by keyword."
          />

          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
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

          <div style={cardDivider} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
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

        {/* ═══ Save ═══ */}
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
