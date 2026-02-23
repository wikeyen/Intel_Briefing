// ABOUTME: Sources page — sensor configuration grouped into 4 foldable sections.
// ABOUTME: General, Social Accounts, Trend, and RSS with inline controls and i18n.
'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'
import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/lib/toast-context'
import { useAutoSave } from '@/lib/hooks/useAutoSave'
import { AutoSaveIndicator } from '@/components/form-styles'
import { SENSORS } from '@/lib/sensors/taxonomy'
import { SOURCE_SECTIONS, HIDDEN_SENSORS, SENSOR_LOOKBACK_SUPPORT } from '@/components/sources/sections'
import { FoldableSection } from '@/components/sources/FoldableSection'
import { RssFeedList } from '@/components/sources/RssFeedList'
import { normalizeRssFeeds, type RssFeedEntry } from '@/lib/models'
import { SkeletonCard } from '@/components/Skeleton'

type SensorStatus = 'ok' | 'failed' | 'disabled'

/** Sensor key → language lookup for CN badges. */
const SENSOR_LANGUAGE: Record<string, 'cn' | 'row'> = Object.fromEntries(
  SENSORS.map(s => [s.key, s.language])
) as Record<string, 'cn' | 'row'>

function CnBadge({ language }: { language: 'cn' | 'row' }) {
  if (language === 'row') return null
  return (
    <span style={{
      fontSize: '0.5625rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      background: '#ffe066',
      color: '#c8102e',
      padding: '0.0625rem 0.375rem',
      borderRadius: 999,
      marginLeft: '0.375rem',
    }}>
      CN
    </span>
  )
}

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
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    if (!isNaN(n) && n >= min) {
      onChange(Math.max(min, Math.min(max, n)))
    }
    setDraft(null)
  }

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
        ref={inputRef}
        type="number"
        min={min}
        max={max}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); inputRef.current?.blur() } }}
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

  const validateX = (v: string): string | null => {
    const clean = v.startsWith('@') ? v : `@${v}`
    if (!/^@[A-Za-z0-9_]{1,50}$/.test(clean)) return t('sources.invalid_x_handle')
    return null
  }
  const validateBsky = (v: string): string | null => {
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$/.test(v)) return t('sources.invalid_bluesky_handle')
    return null
  }
  const validateMasto = (v: string): string | null => {
    const clean = v.startsWith('@') ? v : `@${v}`
    if (!/^@[A-Za-z0-9_]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(clean)) return t('sources.invalid_mastodon_handle')
    return null
  }

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
    { onError: (e) => showToast(t('sources.save_failed', { error: e.message })) },
  )

  useEffect(() => {
    api.getConfig().then((cfg) => {
      const defaults: Record<string, boolean> = {}
      for (const s of SENSORS) defaults[s.key] = true
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

  /* ── Section data ──────────────────────────────────────────────────────── */
  const generalSensors = SOURCE_SECTIONS.find(s => s.key === 'general')!.sensors.filter(s => !HIDDEN_SENSORS.has(s.key))
  const socialSensors  = SOURCE_SECTIONS.find(s => s.key === 'social')!.sensors.filter(s => !HIDDEN_SENSORS.has(s.key))
  const trendSensors   = SOURCE_SECTIONS.find(s => s.key === 'trend')!.sensors.filter(s => !HIDDEN_SENSORS.has(s.key))
  const rssSensors     = SOURCE_SECTIONS.find(s => s.key === 'rss')!.sensors.filter(s => !HIDDEN_SENSORS.has(s.key))

  const topicsOn = (blueskyTopicsEnabled && (enabled.bluesky ?? true)) ||
    (mastodonTopicsEnabled && (enabled.mastodon ?? true))

  const generalEnabled = generalSensors.filter(s => enabled[s.key] ?? true).length
  const socialEnabled  = socialSensors.filter(s => enabled[s.key] ?? true).length
  const trendEnabled   = trendSensors.filter(s => enabled[s.key] ?? true).length + (mastodonTrendsEnabled ? 1 : 0) + (topicsOn ? 1 : 0)
  const trendTotal     = trendSensors.length + 2
  const rssEnabled     = rssSensors.filter(s => enabled[s.key] ?? true).length

  /* ── Render helpers ────────────────────────────────────────────────────── */

  /** Renders a standard sensor row with toggle, label, CN badge, pills, and status badge. */
  const renderSensorRow = (
    sensor: { key: string; label: string; desc: string },
    hasBorderBottom: boolean,
  ) => {
    const isOn = enabled[sensor.key] ?? true
    const hasLookback = sensor.key in SENSOR_LOOKBACK_SUPPORT
    const lang = SENSOR_LANGUAGE[sensor.key] ?? 'row'
    return (
      <div
        key={sensor.key}
        className="sensor-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem 0.875rem',
          borderBottom: hasBorderBottom ? '1px solid var(--border-soft)' : 'none',
          transition: 'background 120ms',
          gap: '0.5rem',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
      >
        <div className="sensor-row-left" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
          <Toggle on={isOn} onClick={() => toggle(sensor.key)} />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: isOn ? 'var(--ink)' : 'var(--ink-faint)',
              display: 'flex',
              alignItems: 'center',
            }}>
              {sensor.label}
              <CnBadge language={lang} />
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>
              {t('sensor.desc.' + sensor.key)}
            </div>
          </div>
        </div>
        <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
          {isOn && (
            <PillInput
              label={t('sources.items')}
              value={sensorLimits[sensor.key] ?? defaultLimit}
              min={1}
              max={200}
              onChange={(v) => updateSensorLimit(sensor.key, v)}
            />
          )}
          {isOn && hasLookback && (
            <PillInput
              label={t('sources.lookback')}
              value={sensorLookback[sensor.key] ?? SENSOR_LOOKBACK_SUPPORT[sensor.key]}
              min={1}
              max={336}
              suffix="h"
              onChange={(v) => updateSensorLookback(sensor.key, v)}
            />
          )}
          <Badge status={getBadge(sensor.key)} />
        </div>
      </div>
    )
  }

  /* ── Loading skeleton ──────────────────────────────────────────────────── */
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

  /* ── Main render ───────────────────────────────────────────────────────── */
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

          {/* ── General ──────────────────────────────────────────────────── */}
          <FoldableSection title={t('sources.section_general')} enabledCount={generalEnabled} totalCount={generalSensors.length}>
            {generalSensors.map((sensor, i) =>
              renderSensorRow(sensor, i < generalSensors.length - 1)
            )}
          </FoldableSection>

          {/* ── Social Accounts ───────────────────────────────────────────── */}
          <FoldableSection title={t('sources.section_social')} enabledCount={socialEnabled} totalCount={socialSensors.length}>
            {socialSensors.map((sensor, i) => {
              const isOn = enabled[sensor.key] ?? true
              const isLast = i === socialSensors.length - 1
              const isX = sensor.key === 'x'
              const isBluesky = sensor.key === 'bluesky'
              const isMastodon = sensor.key === 'mastodon'
              const hasSub = (isX || isBluesky || isMastodon) && isOn

              return (
                <div key={sensor.key}>
                  {renderSensorRow(sensor, !isLast || hasSub)}

                  {/* X accounts (no scraper section) */}
                  {isX && isOn && (
                    <div style={{
                      padding: '0.625rem 0.875rem',
                      background: 'var(--canvas)',
                      borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                    }}>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)' }} />
                        {t('sources.accounts')}
                      </div>
                      <TagInput
                        tags={socialAccountsX}
                        onChange={(tags) => { setSocialAccountsX(tags.map(normalizeXHandle)); trigger() }}
                        placeholder={t('sources.placeholder_twitter')}
                        validate={validateX}
                        disabledTags={disabledAccounts}
                        onToggleDisabled={toggleAccountDisabled}
                        onEnableAll={() => enableAllAccounts(socialAccountsX)}
                        onDisableAll={() => disableAllAccounts(socialAccountsX)}
                      />
                    </div>
                  )}

                  {/* Bluesky accounts */}
                  {isBluesky && isOn && (
                    <div style={{
                      padding: '0.625rem 0.875rem',
                      background: 'var(--canvas)',
                      borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                    }}>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-bluesky)' }} />
                        {t('sources.accounts')}
                      </div>
                      <TagInput
                        tags={socialAccountsBluesky}
                        onChange={(tags) => { setSocialAccountsBluesky(tags); trigger() }}
                        placeholder={t('sources.placeholder_bluesky')}
                        validate={validateBsky}
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
                  )}

                  {/* Mastodon accounts */}
                  {isMastodon && isOn && (
                    <div style={{
                      padding: '0.625rem 0.875rem',
                      background: 'var(--canvas)',
                      borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                    }}>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-mastodon)' }} />
                        {t('sources.accounts')}
                      </div>
                      <TagInput
                        tags={socialAccountsMastodon}
                        onChange={(tags) => { setSocialAccountsMastodon(tags.map(normalizeMastodonHandle)); trigger() }}
                        placeholder={t('sources.placeholder_mastodon')}
                        validate={validateMasto}
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
                  )}
                </div>
              )
            })}
          </FoldableSection>

          {/* ── Trend ─────────────────────────────────────────────────────── */}
          <FoldableSection title={t('sources.section_trend')} enabledCount={trendEnabled} totalCount={trendTotal}>
            {/* Sub-header: Trending Platforms */}
            <div style={{
              fontSize: '0.5625rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              padding: '0.5rem 0.875rem 0.125rem',
            }}>
              {t('sources.trending_platforms')}
            </div>

            {/* Mastodon Trends */}
            <div
              className="sensor-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.5rem 0.875rem',
                borderBottom: '1px solid var(--border-soft)',
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
                    {t('sources.mastodon_trends')}
                  </div>
                </div>
              </div>
            </div>

            {/* Platform sensors (Weibo, Xiaohongshu) */}
            {trendSensors.map((sensor, i) =>
              renderSensorRow(sensor, i < trendSensors.length - 1)
            )}

            {/* Sub-header: Search Topics */}
            <div style={{
              fontSize: '0.5625rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-faint)',
              padding: '0.5rem 0.875rem 0.125rem',
              borderTop: '1px solid var(--border-soft)',
            }}>
              {t('sources.topics')}
            </div>

            {/* Topics toggle + platform checkboxes */}
            <div
              className="sensor-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.5rem 0.875rem',
                borderBottom: topicsOn ? '1px solid var(--border-soft)' : 'none',
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
                </div>
              </div>
              <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                {topicsOn && (
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

            {/* Keywords input */}
            {topicsOn && (
              <div style={{ padding: '0.5rem 0.875rem', background: 'var(--canvas)' }}>
                <TagInput
                  tags={socialTopicsKeywords}
                  onChange={(tags) => { setSocialTopicsKeywords(tags); trigger() }}
                  placeholder={t('sources.placeholder_topics')}
                />
              </div>
            )}
          </FoldableSection>

          {/* ── RSS ───────────────────────────────────────────────────────── */}
          <FoldableSection title={t('sources.section_rss')} enabledCount={rssEnabled} totalCount={rssSensors.length}>
            {rssSensors.map((sensor, i) => {
              const isOn = enabled[sensor.key] ?? true
              const isLast = i === rssSensors.length - 1
              return (
                <div key={sensor.key}>
                  {renderSensorRow(sensor, !isLast || isOn)}

                  {/* Feed list with per-feed category toggle */}
                  {isOn && (
                    <div style={{
                      padding: '0.625rem 0.875rem',
                      background: 'var(--canvas)',
                      borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
                    }}>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: '0.375rem' }}>
                        {t('sources.rss_feeds')}
                      </div>
                      <RssFeedList
                        feeds={rssFeeds}
                        onChange={(feeds) => { setRssFeeds(feeds); trigger() }}
                        onAdd={(url) => {
                          setRssFeeds(prev => [{ url, type: 'other' }, ...prev])
                          api.discoverRssFeed(url).then((result) => {
                            if (result.type === 'discovered' && result.feedUrl) {
                              setRssFeeds((prev) => prev.map((f) => f.url === url ? { ...f, url: result.feedUrl! } : f))
                              showToast(t('sources.feed_discovered', { title: result.feedTitle ?? result.feedUrl ?? '' }))
                            } else if (result.type === 'not_found') {
                              setRssFeeds((prev) => prev.filter((f) => f.url !== url))
                              showToast(t('sources.feed_not_found'))
                            } else if (result.type === 'error') {
                              setRssFeeds((prev) => prev.filter((f) => f.url !== url))
                              showToast(t('sources.feed_discovery_failed', { error: result.message ?? '' }))
                            }
                            trigger()
                          }).catch(() => { trigger() })
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </FoldableSection>

        </div>
      </div>
    </div>
  )
}
