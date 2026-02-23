// ABOUTME: Sources section — sensor toggles grouped by category with inline pill controls.
// ABOUTME: Per-sensor item limits, lookback hours, social accounts, and social topics configured inline.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'

import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/lib/toast-context'
import { useAutoSave } from '@/lib/hooks/useAutoSave'
import { AutoSaveIndicator } from '@/components/form-styles'
import { sensorsByLanguageAndCategory } from '@/lib/sensors/taxonomy'
import { normalizeRssFeeds, type RssFeedEntry } from '@/lib/models'
import { SkeletonCard } from '@/components/Skeleton'

interface SensorDef {
  key: string
  label: string
  desc: string
}

type Language = 'row' | 'cn'

interface GroupDef {
  label: string
  language: Language
  sensors: SensorDef[]
}

const ALL_GROUPS: GroupDef[] = []

for (const lang of sensorsByLanguageAndCategory()) {
  for (const cat of lang.categories) {
    ALL_GROUPS.push({
      label: cat.label,
      language: lang.language,
      sensors: cat.sensors.map(s => ({ key: s.key, label: s.label, desc: s.desc })),
    })
  }
}

/** Virtual sensors that are display-only (controlled by a parent sensor). */
const HIDDEN_SENSORS = new Set(['rss_news'])

const ALL_SENSORS = ALL_GROUPS.flatMap(g => g.sensors)

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
  const { t } = useTranslation()
  if (!status) return null
  const map: Record<string, { bg: string; color: string; label: string }> = {
    ok:       { bg: 'var(--ok-bg)',       color: 'var(--ok)',        label: t('sources.badge_ok') },
    failed:   { bg: 'var(--err-bg)',      color: 'var(--err)',       label: t('sources.badge_failed') },
    disabled: { bg: 'var(--surface-alt)', color: 'var(--ink-faint)', label: t('sources.badge_off') },
  }
  const s = map[status]
  return (
    <span style={{
      fontSize: '0.625rem',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      background: s.bg,
      color: s.color,
      padding: '0.125rem 0.5rem',
      borderRadius: 999,
    }}>
      {s.label}
    </span>
  )
}

function LanguageBadge({ language }: { language: Language }) {
  if (language === 'row') return null
  return (
    <span style={{
      fontSize: '0.5625rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      background: 'var(--accent-bg)',
      color: 'var(--accent)',
      padding: '0.0625rem 0.375rem',
      borderRadius: 999,
      marginLeft: '0.375rem',
    }}>
      CN
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
        width: 32,
        height: 18,
        borderRadius: 9,
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
        left: on ? 17 : 2,
        width: 12,
        height: 12,
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
      gap: '0.1875rem',
      borderRadius: 999,
      border: '1px solid var(--border)',
      background: 'var(--canvas)',
      padding: '0.125rem 0.375rem',
      fontSize: '0.6875rem',
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
          width: suffix ? 26 : 30,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--ink)',
          fontSize: '0.6875rem',
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
  const { t } = useTranslation()
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
        <div className="page-header" style={{ paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: '0.125rem' }}>
            {t('sources.title')}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            {t('sources.desc')}
          </p>
        </div>
        <div style={{ paddingBottom: '4rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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

      <div className="page-header" style={{ paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: '0.125rem' }}>
            {t('sources.title')}
          </h2>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
          {t('sources.desc')}
        </p>
      </div>

      <div style={{ paddingBottom: '4rem' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {ALL_GROUPS.map((group) => (
            <div key={`${group.language}-${group.label}`}>
              {/* Group label with optional CN badge */}
              <div style={{
                fontSize: '0.625rem',
                fontWeight: 600,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
                marginBottom: '0.375rem',
                display: 'flex',
                alignItems: 'center',
              }}>
                {group.label}
                <LanguageBadge language={group.language} />
              </div>

              {/* Sensor cards in this group */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
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
                {group.sensors.filter(s => !HIDDEN_SENSORS.has(s.key)).map(({ key, label, desc }, i, arr) => {
                  const isLast = i === arr.length - 1
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
                          padding: '0.5rem 0.875rem',
                          borderBottom: hasPlatformSubConfig || !isLast ? '1px solid var(--border-soft)' : 'none',
                          transition: 'background 120ms',
                          gap: '0.5rem',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                      >
                        {/* Left: toggle + label */}
                        <div className="sensor-row-left" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
                          <Toggle on={isOn} onClick={() => toggle(key)} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: '0.8125rem',
                              fontWeight: 500,
                              color: isOn ? 'var(--ink)' : 'var(--ink-faint)',
                            }}>
                              {label}
                            </div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>
                              {desc}
                            </div>
                          </div>
                        </div>

                        {/* Right: inline pill controls + badge */}
                        <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                          {isOn && (
                            <PillInput
                              label={t('sources.items')}
                              value={sensorLimits[key] ?? defaultLimit}
                              min={1}
                              max={200}
                              onChange={(v) => updateSensorLimit(key, v)}
                            />
                          )}
                          {isOn && hasLookback && (
                            <PillInput
                              label={t('sources.lookback')}
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
                          padding: '0.625rem 0.875rem',
                          background: 'var(--canvas)',
                          borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.625rem',
                        }}>
                          <div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)' }} />
                              {t('sources.scraper')}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--ink)' }}>{t('sources.twitter_scraper')}</span>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)' }} />
                              {t('sources.accounts')}
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
                          padding: '0.625rem 0.875rem',
                          background: 'var(--canvas)',
                          borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.625rem',
                        }}>
                          <div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-bluesky)' }} />
                              {t('sources.accounts')}
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
                              gap: '0.375rem',
                              marginTop: '0.375rem',
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
                              <span style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>
                                {t('sources.include_following')}
                              </span>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Mastodon sub-config */}
                      {isMastodon && isOn && (
                        <div style={{
                          padding: '0.625rem 0.875rem',
                          background: 'var(--canvas)',
                          borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.625rem',
                        }}>
                          <div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-mastodon)' }} />
                              {t('sources.accounts')}
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
                              gap: '0.375rem',
                              marginTop: '0.375rem',
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
                              <span style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>
                                {t('sources.include_following')}
                              </span>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Inline sub-config: RSS Feeds */}
                      {isRssFeeds && isOn && (
                        <div style={{
                          padding: '0.625rem 0.875rem',
                          background: 'var(--canvas)',
                          borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                        }}>
                          <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                            {t('sources.feed_urls')}
                          </div>
                          <TagInput
                            tags={rssFeeds.map(f => f.url)}
                            onChange={(tags) => {
                              const currentUrls = rssFeeds.map(f => f.url)
                              const added = tags.find((t) => !currentUrls.includes(t))
                              if (!added) {
                                setRssFeeds(prev => prev.filter(f => tags.includes(f.url)))
                                trigger()
                                return
                              }
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
                        </div>
                      )}
                    </div>
                  )
                })}

              </div>
            </div>
          ))}

          {/* Trend — dedicated section for Topics + Trends */}
          {((enabled.bluesky ?? true) || (enabled.mastodon ?? true)) && (() => {
            const topicsOn = (blueskyTopicsEnabled && (enabled.bluesky ?? true)) ||
              (mastodonTopicsEnabled && (enabled.mastodon ?? true))
            return (
              <div>
                <div style={{
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-faint)',
                  marginBottom: '0.375rem',
                }}>
                  {t('sources.trend')}
                </div>
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
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
                  {/* Topics row */}
                  <div>
                    <div
                      className="sensor-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem 0.875rem',
                        borderBottom: topicsOn ? '1px solid var(--border-soft)' : (enabled.mastodon ?? true) ? '1px solid var(--border-soft)' : 'none',
                        transition: 'background 120ms',
                        gap: '0.5rem',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                    >
                      <div className="sensor-row-left" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
                        <Toggle on={topicsOn} onClick={() => {
                          if (topicsOn) {
                            setBlueskyTopicsEnabled(false)
                            setMastodonTopicsEnabled(false)
                          } else {
                            if (enabled.bluesky ?? true) setBlueskyTopicsEnabled(true)
                            if (enabled.mastodon ?? true) setMastodonTopicsEnabled(true)
                          }
                          trigger()
                        }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            color: topicsOn ? 'var(--ink)' : 'var(--ink-faint)',
                          }}>
                            {t('sources.topics')}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>
                            {t('sources.topics_desc')}
                          </div>
                        </div>
                      </div>
                      <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                        {topicsOn && (enabled.bluesky ?? true) && (enabled.mastodon ?? true) && (
                          <>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.1875rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={blueskyTopicsEnabled}
                                onChange={(e) => { setBlueskyTopicsEnabled(e.target.checked); trigger() }}
                                style={{ accentColor: 'var(--brand-bluesky)' }} />
                              <span style={{ fontSize: '0.625rem', color: 'var(--ink-muted)' }}>Bluesky</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.1875rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={mastodonTopicsEnabled}
                                onChange={(e) => { setMastodonTopicsEnabled(e.target.checked); trigger() }}
                                style={{ accentColor: 'var(--brand-mastodon)' }} />
                              <span style={{ fontSize: '0.625rem', color: 'var(--ink-muted)' }}>Mastodon</span>
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Keywords sub-config */}
                    {topicsOn && (
                      <div style={{
                        padding: '0.5rem 0.875rem',
                        background: 'var(--canvas)',
                        borderBottom: (enabled.mastodon ?? true) ? '1px solid var(--border-soft)' : 'none',
                      }}>
                        <TagInput
                          tags={socialTopicsKeywords}
                          onChange={(tags) => { setSocialTopicsKeywords(tags); trigger() }}
                          placeholder="keyword or #hashtag — press Enter"
                        />
                      </div>
                    )}
                  </div>

                  {/* Trending row */}
                  <div
                    className="sensor-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.5rem 0.875rem',
                      transition: 'background 120ms',
                      gap: '0.5rem',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                  >
                    <div className="sensor-row-left" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
                      <Toggle on={mastodonTrendsEnabled} onClick={() => { setMastodonTrendsEnabled(!mastodonTrendsEnabled); trigger() }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          color: mastodonTrendsEnabled ? 'var(--ink)' : 'var(--ink-faint)',
                        }}>
                          {t('sources.trending')}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>
                          {t('sources.trending_desc')}
                        </div>
                      </div>
                    </div>
                    <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                      {mastodonTrendsEnabled && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.1875rem', cursor: (enabled.mastodon ?? true) ? 'pointer' : 'not-allowed', opacity: (enabled.mastodon ?? true) ? 1 : 0.4 }}>
                          <input type="checkbox" checked={mastodonTrendsEnabled && (enabled.mastodon ?? true)}
                            disabled={!(enabled.mastodon ?? true)}
                            onChange={(e) => { setMastodonTrendsEnabled(e.target.checked); trigger() }}
                            style={{ accentColor: 'var(--brand-mastodon)' }} />
                          <span style={{ fontSize: '0.625rem', color: 'var(--ink-muted)' }}>Mastodon</span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

      </div>
    </div>
  )
}
