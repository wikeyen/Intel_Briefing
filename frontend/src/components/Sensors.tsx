// ABOUTME: Sources section — sensor toggles grouped by language/provider with inline pill controls.
// ABOUTME: Per-sensor item limits, lookback hours, social accounts, and social topics configured inline.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'

import { useToast } from '@/lib/toast-context'
import { useAutoSave } from '@/lib/hooks/useAutoSave'
import { AutoSaveIndicator } from '@/components/form-styles'
import { sensorsByLanguageAndCategory } from '@/lib/sensors/taxonomy'
import { normalizeRssFeeds, type RssFeedEntry, type RssFeedType } from '@/lib/models'
import { SkeletonCard } from '@/components/Skeleton'

interface SensorDef {
  key: string
  label: string
  desc: string
}

type Language = 'row' | 'cn'

const LANGUAGE_GROUPS: Record<Language, { label: string; sensors: SensorDef[] }[]> = {
  row: [],
  cn: [],
}

for (const lang of sensorsByLanguageAndCategory()) {
  LANGUAGE_GROUPS[lang.language] = lang.categories.map(cat => ({
    label: cat.label,
    sensors: cat.sensors.map(s => ({ key: s.key, label: s.label, desc: s.desc })),
  }))
}

const ALL_SENSORS = Object.values(LANGUAGE_GROUPS).flat().flatMap(g => g.sensors)

const LANGUAGE_TABS: { key: Language; label: string; desc: string }[] = [
  { key: 'row', label: 'Global', desc: 'English-language sources' },
  { key: 'cn', label: 'China', desc: 'Chinese-language sources' },
]

/** Maps sensor names to their default lookback hours. Sensors not listed have no lookback support. */
const SENSOR_LOOKBACK_SUPPORT: Record<string, number> = {
  hacker_news: 24,
  github: 168,
  x: 48,
  bluesky: 48,
  mastodon: 48,
  hn_blogs: 72,
  arxiv: 72,
  wallstreetcn: 24,
  rss_feeds: 72,
}

type SensorStatus = 'ok' | 'failed' | 'disabled'

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
        background: on ? 'var(--surface)' : 'var(--ink-faint)',
        transition: 'left 150ms, background 150ms',
        boxShadow: on ? 'var(--shadow-sm)' : 'none',
      }} />
    </button>
  )
}

interface PillInputProps {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (v: number) => void
}

function PillInput({ label, value, min, max, suffix, onChange }: PillInputProps) {
  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      borderRadius: 999,
      border: '1px solid var(--border)',
      background: 'var(--canvas)',
      padding: '0.2rem 0.5rem 0.2rem 0.5rem',
      fontSize: '0.75rem',
      lineHeight: 1,
      cursor: 'text',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
        }}
        style={{
          width: suffix ? 28 : 32,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--ink)',
          fontSize: '0.75rem',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontWeight: 600,
          textAlign: 'right',
          outline: 'none',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          MozAppearance: 'textfield' as any,
        }}
      />
      {suffix && (
        <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>{suffix}</span>
      )}
    </label>
  )
}

function validateXHandle(value: string): string | null {
  const clean = value.startsWith('@') ? value : `@${value}`
  if (!/^@[A-Za-z0-9_]{1,50}$/.test(clean)) return 'Invalid handle format'
  return null
}

function normalizeXHandle(value: string): string {
  return value.startsWith('@') ? value : `@${value}`
}

function validateBlueskyHandle(value: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$/.test(value)) return 'Use format: name.bsky.social'
  return null
}

function validateMastodonHandle(value: string): string | null {
  const clean = value.startsWith('@') ? value : `@${value}`
  if (!/^@[A-Za-z0-9_]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(clean)) return 'Use format: @user@instance'
  return null
}

function validateUrl(value: string): string | null {
  try {
    const u = new URL(value)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Must be an HTTP(S) URL'
    return null
  } catch {
    return 'Invalid URL'
  }
}

function normalizeMastodonHandle(value: string): string {
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

export function Sensors() {
  const showToast = useToast()
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [statuses, setStatuses] = useState<Record<string, SensorStatus>>({})
  const [socialAccountsX, setSocialAccountsX] = useState<string[]>([])
  const [socialAccountsBluesky, setSocialAccountsBluesky] = useState<string[]>([])
  const [socialAccountsMastodon, setSocialAccountsMastodon] = useState<string[]>([])
  const [disabledAccounts, setDisabledAccounts] = useState<Set<string>>(new Set())
  const [socialTopicsKeywords, setSocialTopicsKeywords] = useState<string[]>([])
  const [followingBluesky, setFollowingBluesky] = useState(false)
  const [followingMastodon, setFollowingMastodon] = useState(false)
  const [hasBlueskyCredentials, setHasBlueskyCredentials] = useState(false)
  const [hasMastodonCredentials, setHasMastodonCredentials] = useState(false)
  const [blueskyTopicsEnabled, setBlueskyTopicsEnabled] = useState(true)
  const [mastodonTopicsEnabled, setMastodonTopicsEnabled] = useState(true)
  const [mastodonTrendsEnabled, setMastodonTrendsEnabled] = useState(true)
  const [rssFeeds, setRssFeeds] = useState<RssFeedEntry[]>([])
  const [sensorLimits, setSensorLimits] = useState<Record<string, number>>({})
  const [sensorLookback, setSensorLookback] = useState<Record<string, number>>({})
  const [defaultLimit, setDefaultLimit] = useState(10)
  const [activeLanguage, setActiveLanguage] = useState<Language>('row')
  const [xScraperProvider, setXScraperProvider] = useState<'twitter-scraper' | 'apify' | 'mixed'>('twitter-scraper')
  const [loaded, setLoaded] = useState(false)

  const { status: saveStatus, trigger } = useAutoSave(
    () => ({
      sensors_enabled: enabled,
      social_accounts_x: socialAccountsX,
      social_accounts_bluesky: socialAccountsBluesky,
      social_accounts_mastodon: socialAccountsMastodon,
      social_accounts_disabled: [...disabledAccounts],
      social_topics_keywords: socialTopicsKeywords,
      social_following_bluesky: followingBluesky,
      social_following_mastodon: followingMastodon,
      bluesky_topics_enabled: blueskyTopicsEnabled,
      mastodon_topics_enabled: mastodonTopicsEnabled,
      mastodon_trends_enabled: mastodonTrendsEnabled,
      rss_feed_urls: rssFeeds,
      sensor_limits: sensorLimits,
      sensor_lookback_hours: sensorLookback,
      x_scraper_provider: xScraperProvider,
    }),
    { onError: (e) => showToast('Save failed: ' + e.message) },
  )

  useEffect(() => {
    api.getConfig().then((cfg) => {
      const defaults: Record<string, boolean> = {}
      for (const { key } of ALL_SENSORS) defaults[key] = true
      setEnabled({ ...defaults, ...cfg.sensors_enabled })
      setSocialAccountsX(cfg.social_accounts_x)
      setSocialAccountsBluesky(cfg.social_accounts_bluesky)
      setSocialAccountsMastodon(cfg.social_accounts_mastodon)
      setDisabledAccounts(new Set(cfg.social_accounts_disabled ?? []))
      setSocialTopicsKeywords(cfg.social_topics_keywords)
      setFollowingBluesky(cfg.social_following_bluesky ?? false)
      setFollowingMastodon(cfg.social_following_mastodon ?? false)
      setHasBlueskyCredentials(!!cfg.bluesky_handle && !!cfg.bluesky_app_password)
      setHasMastodonCredentials(!!cfg.mastodon_token)
      setBlueskyTopicsEnabled(cfg.bluesky_topics_enabled ?? true)
      setMastodonTopicsEnabled(cfg.mastodon_topics_enabled ?? true)
      setMastodonTrendsEnabled(cfg.mastodon_trends_enabled ?? true)
      setRssFeeds(normalizeRssFeeds(cfg.rss_feed_urls ?? []))
      setSensorLimits(cfg.sensor_limits ?? {})
      setSensorLookback(cfg.sensor_lookback_hours ?? {})
      setDefaultLimit(cfg.default_limit)
      setXScraperProvider(cfg.x_scraper_provider ?? 'twitter-scraper')
      setLoaded(true)
    })
    const fetchStatuses = () => {
      api.getLatest().then((report) => {
        const map: Record<string, SensorStatus> = {}
        for (const key of report.sources_ok) map[key] = 'ok'
        for (const key of report.sources_failed) map[key] = 'failed'
        setStatuses(map)
      }).catch(() => {})
    }
    fetchStatuses()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchStatuses() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const toggle = (key: string) => {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))
    trigger()
  }

  const toggleAccountDisabled = (account: string) => {
    setDisabledAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(account)) next.delete(account)
      else next.add(account)
      return next
    })
    trigger()
  }

  const enableAllAccounts = (accounts: string[]) => {
    setDisabledAccounts((prev) => {
      const next = new Set(prev)
      for (const a of accounts) next.delete(a)
      return next
    })
    trigger()
  }

  const disableAllAccounts = (accounts: string[]) => {
    setDisabledAccounts((prev) => {
      const next = new Set(prev)
      for (const a of accounts) next.add(a)
      return next
    })
    trigger()
  }

  const updateSensorLimit = (key: string, value: number) => {
    setSensorLimits((prev) => ({ ...prev, [key]: value }))
    trigger()
  }

  const updateSensorLookback = (key: string, value: number) => {
    setSensorLookback((prev) => ({ ...prev, [key]: value }))
    trigger()
  }

  const getBadge = (key: string): SensorStatus | undefined =>
    !enabled[key] ? 'disabled' : statuses[key]

  if (!loaded) {
    return (
      <div>
        <div className="page-header" style={{ paddingBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: '0.25rem' }}>
            Sources
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            Active data sources for your pipeline.
          </p>
        </div>
        <div style={{ paddingBottom: '4rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={5} />
            <SkeletonCard lines={3} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: HIDE_SPINNERS_CSS }} />

      <div className="page-header" style={{ paddingBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: '0.25rem' }}>
            Sources
          </h2>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
          Active data sources for your pipeline.
        </p>
      </div>

      <div style={{ paddingBottom: '4rem' }}>

        {/* Language tabs */}
        <div style={{
          display: 'flex',
          gap: '0.25rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid var(--border)',
        }}>
          {LANGUAGE_TABS.map(tab => {
            const active = activeLanguage === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveLanguage(tab.key)}
                style={{
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.8125rem',
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--ink)' : 'var(--ink-muted)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'color 120ms, border-color 120ms',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {LANGUAGE_GROUPS[activeLanguage].map((group) => (
            <div key={group.label}>
              {/* Group label */}
              <div style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
                marginBottom: '0.5rem',
              }}>
                {group.label}
              </div>

              {/* Sensor cards in this group */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: 'var(--shadow-card)',
                transition: 'box-shadow 200ms, border-color 200ms',
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card-hover)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card)'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                }}
              >
                {group.sensors.map(({ key, label, desc }, i) => {
                  const isLast = i === group.sensors.length - 1
                  const isX = key === 'x'
                  const isBluesky = key === 'bluesky'
                  const isMastodon = key === 'mastodon'
                  const isRssFeeds = key === 'rss_feeds'
                  const isOn = enabled[key] ?? true
                  const hasLookback = key in SENSOR_LOOKBACK_SUPPORT
                  const hasPlatformSubConfig = (isX || isBluesky || isMastodon || isRssFeeds) && isOn

                  return (
                    <div key={key}>
                      {/* Sensor row — toggle, label, inline pills, badge */}
                      <div
                        className="sensor-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '1rem 1.25rem',
                          borderBottom: hasPlatformSubConfig || !isLast ? '1px solid var(--border-soft)' : 'none',
                          transition: 'background 120ms',
                          gap: '0.75rem',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                      >
                        {/* Left: toggle + label */}
                        <div className="sensor-row-left" style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: 0 }}>
                          <Toggle on={isOn} onClick={() => toggle(key)} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              color: isOn ? 'var(--ink)' : 'var(--ink-faint)',
                              marginBottom: '0.125rem',
                            }}>
                              {label}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                              {desc}
                            </div>
                          </div>
                        </div>

                        {/* Right: inline pill controls + badge */}
                        <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          {isOn && (
                            <PillInput
                              label="Items"
                              value={sensorLimits[key] ?? defaultLimit}
                              min={1}
                              max={200}
                              onChange={(v) => updateSensorLimit(key, v)}
                            />
                          )}
                          {isOn && hasLookback && (
                            <PillInput
                              label="Lookback"
                              value={sensorLookback[key] ?? SENSOR_LOOKBACK_SUPPORT[key]}
                              min={1}
                              max={336}
                              suffix="h"
                              onChange={(v) => updateSensorLookback(key, v)}
                            />
                          )}
                          <Badge status={getBadge(key)} />
                        </div>
                      </div>

                      {/* X sub-config */}
                      {isX && isOn && (
                        <div style={{
                          padding: '1.25rem 1.25rem 1.25rem 1.25rem',
                          paddingLeft: '1.25rem',
                          background: 'var(--canvas)',
                          borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1rem',
                        }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--ink)' }} />
                              Scraper
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.8125rem', color: 'var(--ink)' }}>Twitter Scraper</span>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--ink)' }} />
                              Accounts
                            </div>
                            <TagInput
                              tags={socialAccountsX}
                              onChange={(tags) => { setSocialAccountsX(tags.map(normalizeXHandle)); trigger() }}
                              placeholder="@handle — press Enter"
                              validate={validateXHandle}
                              disabledTags={disabledAccounts}
                              onToggleDisabled={toggleAccountDisabled}
                              onEnableAll={() => enableAllAccounts(socialAccountsX)}
                              onDisableAll={() => disableAllAccounts(socialAccountsX)}
                            />
                          </div>
                        </div>
                      )}

                      {/* Bluesky sub-config */}
                      {isBluesky && isOn && (
                        <div style={{
                          padding: '1.25rem 1.25rem 1.25rem 1.25rem',
                          paddingLeft: '1.25rem',
                          background: 'var(--canvas)',
                          borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1rem',
                        }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-bluesky)' }} />
                              Accounts
                            </div>
                            <TagInput
                              tags={socialAccountsBluesky}
                              onChange={(tags) => { setSocialAccountsBluesky(tags); trigger() }}
                              placeholder="name.bsky.social — press Enter"
                              validate={validateBlueskyHandle}
                              disabledTags={disabledAccounts}
                              onToggleDisabled={toggleAccountDisabled}
                              onEnableAll={() => enableAllAccounts(socialAccountsBluesky)}
                              onDisableAll={() => disableAllAccounts(socialAccountsBluesky)}
                            />
                            <label style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              marginTop: '0.5rem',
                              cursor: hasBlueskyCredentials ? 'pointer' : 'not-allowed',
                              opacity: hasBlueskyCredentials ? 1 : 0.4,
                            }}>
                              <input
                                type="checkbox"
                                checked={followingBluesky}
                                disabled={!hasBlueskyCredentials}
                                onChange={(e) => { setFollowingBluesky(e.target.checked); trigger() }}
                                style={{ accentColor: 'var(--brand-bluesky)', cursor: 'inherit' }}
                              />
                              <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                Include accounts I follow
                              </span>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Mastodon sub-config */}
                      {isMastodon && isOn && (
                        <div style={{
                          padding: '1.25rem 1.25rem 1.25rem 1.25rem',
                          paddingLeft: '1.25rem',
                          background: 'var(--canvas)',
                          borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1rem',
                        }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-mastodon)' }} />
                              Accounts
                            </div>
                            <TagInput
                              tags={socialAccountsMastodon}
                              onChange={(tags) => { setSocialAccountsMastodon(tags.map(normalizeMastodonHandle)); trigger() }}
                              placeholder="@user@mastodon.social — press Enter"
                              validate={validateMastodonHandle}
                              disabledTags={disabledAccounts}
                              onToggleDisabled={toggleAccountDisabled}
                              onEnableAll={() => enableAllAccounts(socialAccountsMastodon)}
                              onDisableAll={() => disableAllAccounts(socialAccountsMastodon)}
                            />
                            <label style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              marginTop: '0.5rem',
                              cursor: hasMastodonCredentials ? 'pointer' : 'not-allowed',
                              opacity: hasMastodonCredentials ? 1 : 0.4,
                            }}>
                              <input
                                type="checkbox"
                                checked={followingMastodon}
                                disabled={!hasMastodonCredentials}
                                onChange={(e) => { setFollowingMastodon(e.target.checked); trigger() }}
                                style={{ accentColor: 'var(--brand-mastodon)', cursor: 'inherit' }}
                              />
                              <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                Include accounts I follow
                              </span>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Inline sub-config: RSS Feeds */}
                      {isRssFeeds && isOn && (
                        <div style={{
                          padding: '1.25rem 1.25rem 1.25rem 1.25rem',
                          paddingLeft: '1.25rem',
                          background: 'var(--canvas)',
                          borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                        }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
                            Feed URLs
                          </div>
                          <TagInput
                            tags={rssFeeds.map(f => f.url)}
                            onChange={(tags) => {
                              const currentUrls = rssFeeds.map(f => f.url)
                              const added = tags.find((t) => !currentUrls.includes(t))
                              if (!added) {
                                // Removal — keep entries that still exist in tags
                                setRssFeeds(prev => prev.filter(f => tags.includes(f.url)))
                                trigger()
                                return
                              }
                              // Addition — default new feeds to 'other'
                              setRssFeeds(prev => [...prev, { url: added, type: 'other' }])
                              api.discoverRssFeed(added).then((result) => {
                                if (result.type === 'discovered' && result.feedUrl) {
                                  setRssFeeds((prev) => prev.map((f) => f.url === added ? { ...f, url: result.feedUrl! } : f))
                                  showToast(`Feed discovered: ${result.feedTitle ?? result.feedUrl}`)
                                } else if (result.type === 'not_found') {
                                  setRssFeeds((prev) => prev.filter((f) => f.url !== added))
                                  showToast('No RSS feed found at that URL')
                                } else if (result.type === 'error') {
                                  setRssFeeds((prev) => prev.filter((f) => f.url !== added))
                                  showToast(`Feed discovery failed: ${result.message}`)
                                }
                                trigger()
                              }).catch(() => {
                                trigger()
                              })
                            }}
                            placeholder="https://example.com/feed.xml — press Enter"
                            validate={validateUrl}
                          />
                          {/* Per-feed type selector */}
                          {rssFeeds.length > 0 && (
                            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                              <div style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)', marginBottom: '0.125rem' }}>
                                Feed Types
                              </div>
                              {rssFeeds.map((feed) => {
                                const typeColors: Record<RssFeedType, string> = {
                                  news: 'var(--cat-news)',
                                  blog: 'var(--cat-opinion)',
                                  other: 'var(--ink-faint)',
                                }
                                const nextType: Record<RssFeedType, RssFeedType> = {
                                  other: 'news',
                                  news: 'blog',
                                  blog: 'other',
                                }
                                const domain = (() => {
                                  try { return new URL(feed.url).hostname.replace(/^www\./, '') } catch { return feed.url }
                                })()
                                return (
                                  <div key={feed.url} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    padding: '0.25rem 0.5rem', borderRadius: 6,
                                    background: 'var(--surface-inset)',
                                  }}>
                                    <button
                                      onClick={() => {
                                        setRssFeeds(prev => prev.map(f =>
                                          f.url === feed.url ? { ...f, type: nextType[f.type] } : f,
                                        ))
                                        trigger()
                                      }}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '2px 8px', borderRadius: 4,
                                        fontSize: '0.625rem', fontWeight: 700,
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                                        background: `color-mix(in srgb, ${typeColors[feed.type]} 15%, transparent)`,
                                        color: typeColors[feed.type],
                                        border: `1px solid color-mix(in srgb, ${typeColors[feed.type]} 30%, transparent)`,
                                        cursor: 'pointer',
                                        transition: 'background 150ms, border-color 150ms',
                                      }}
                                      title={`Click to cycle: other → news → blog → other`}
                                    >
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: typeColors[feed.type] }} />
                                      {feed.type}
                                    </button>
                                    <span style={{
                                      fontSize: '0.6875rem', color: 'var(--ink-secondary)',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      flex: 1, minWidth: 0,
                                    }}>
                                      {domain}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Discovery — shared Topics + Trends controls for social platforms */}
                {group.label === 'Social' && ((enabled.bluesky ?? true) || (enabled.mastodon ?? true)) && (
                  <div style={{
                    padding: '1.25rem 1.25rem 1.25rem 1.25rem',
                    background: 'var(--canvas)',
                    borderTop: '1px solid var(--border-soft)',
                  }}>
                    {/* Section header */}
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.09em',
                      textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '0.75rem' }}>
                      Discovery
                    </div>

                    {/* Topics row */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', minWidth: 40 }}>
                          Topics
                        </span>
                        {(enabled.bluesky ?? true) && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={blueskyTopicsEnabled}
                              onChange={(e) => { setBlueskyTopicsEnabled(e.target.checked); trigger() }}
                              style={{ accentColor: 'var(--brand-bluesky)' }} />
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-bluesky)' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Bluesky</span>
                          </label>
                        )}
                        {(enabled.mastodon ?? true) && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={mastodonTopicsEnabled}
                              onChange={(e) => { setMastodonTopicsEnabled(e.target.checked); trigger() }}
                              style={{ accentColor: 'var(--brand-mastodon)' }} />
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-mastodon)' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Mastodon</span>
                          </label>
                        )}
                      </div>
                      {/* Keywords input — shown when any platform has topics on */}
                      {((blueskyTopicsEnabled && (enabled.bluesky ?? true)) ||
                        (mastodonTopicsEnabled && (enabled.mastodon ?? true))) && (
                        <div style={{ paddingLeft: '0.25rem' }}>
                          <TagInput
                            tags={socialTopicsKeywords}
                            onChange={(tags) => { setSocialTopicsKeywords(tags); trigger() }}
                            placeholder="keyword or #hashtag — press Enter"
                          />
                        </div>
                      )}
                    </div>

                    {/* Trends row — only if mastodon sensor is on */}
                    {(enabled.mastodon ?? true) && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-muted)', minWidth: 40 }}>
                            Trends
                          </span>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={mastodonTrendsEnabled}
                              onChange={(e) => { setMastodonTrendsEnabled(e.target.checked); trigger() }}
                              style={{ accentColor: 'var(--brand-mastodon)' }} />
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-mastodon)' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Mastodon</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
