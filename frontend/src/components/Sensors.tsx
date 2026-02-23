// ABOUTME: Sources section — 4 foldable sections: General, Social Accounts, Trend, RSS.
// ABOUTME: Per-sensor item limits, lookback hours, social accounts, topics, and RSS feeds configured inline.
'use client'
import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { TagInput } from '@/components/TagInput'
import { useToast } from '@/lib/toast-context'
import { useAutoSave } from '@/lib/hooks/useAutoSave'
import { AutoSaveIndicator } from '@/components/form-styles'
import { SENSORS } from '@/lib/sensors/taxonomy'
import { normalizeRssFeeds, type RssFeedEntry } from '@/lib/models'
import { SkeletonCard } from '@/components/Skeleton'
import { SOURCE_SECTIONS, HIDDEN_SENSORS, SENSOR_LOOKBACK_SUPPORT } from '@/components/sources/sections'
import { FoldableSection } from '@/components/sources/FoldableSection'
import { RssFeedList } from '@/components/sources/RssFeedList'

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

function CnBadge() {
  return (
    <span style={{
      fontSize: '0.5rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      background: '#c8102e',
      color: '#ffe066',
      padding: '0.0625rem 0.3125rem',
      borderRadius: 3,
      marginLeft: '0.25rem',
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

/* ─── Sub-label style for sub-config sections ────────────────────────── */
const subLabelStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 500,
  color: 'var(--ink-muted)',
  marginBottom: '0.25rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
}

const subConfigStyle: React.CSSProperties = {
  padding: '0.625rem 0.875rem',
  background: 'var(--canvas)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.625rem',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '0.5625rem',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-faint)',
  padding: '0.5rem 0.875rem 0.25rem',
}

/* ─── Sensor row component ───────────────────────────────────────────── */

interface SensorRowProps {
  sensorKey: string
  label: string
  desc: string
  language: 'cn' | 'row'
  isOn: boolean
  onToggle: () => void
  status: SensorStatus | undefined
  sensorLimits: Record<string, number>
  sensorLookback: Record<string, number>
  defaultLimit: number
  updateSensorLimit: (key: string, value: number) => void
  updateSensorLookback: (key: string, value: number) => void
  isLast: boolean
  hasSubConfig?: boolean
  children?: React.ReactNode
}

function SensorRow({
  sensorKey, label, language, isOn, onToggle, status,
  sensorLimits, sensorLookback, defaultLimit,
  updateSensorLimit, updateSensorLookback,
  isLast, hasSubConfig, children,
}: SensorRowProps) {
  const hasLookback = sensorKey in SENSOR_LOOKBACK_SUPPORT
  const showBorder = hasSubConfig || !isLast

  return (
    <div>
      <div
        className="sensor-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem 0.875rem',
          borderBottom: showBorder ? '1px solid var(--border-soft)' : 'none',
          transition: 'background 120ms',
          gap: '0.5rem',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
      >
        <div className="sensor-row-left" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
          <Toggle on={isOn} onClick={onToggle} />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: isOn ? 'var(--ink)' : 'var(--ink-faint)',
              display: 'flex',
              alignItems: 'center',
            }}>
              {label}
              {language === 'cn' && <CnBadge />}
            </div>
          </div>
        </div>
        <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
          {isOn && (
            <PillInput
              label="Items"
              value={sensorLimits[sensorKey] ?? defaultLimit}
              min={1}
              max={200}
              onChange={(v) => updateSensorLimit(sensorKey, v)}
            />
          )}
          {isOn && hasLookback && (
            <PillInput
              label="Lookback"
              value={sensorLookback[sensorKey] ?? SENSOR_LOOKBACK_SUPPORT[sensorKey]}
              min={1}
              max={336}
              suffix="h"
              onChange={(v) => updateSensorLookback(sensorKey, v)}
            />
          )}
          <Badge status={status} />
        </div>
      </div>
      {children}
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────────────── */

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

  /* ─── Section helpers ─────────────────────────────────────── */

  const generalSection = SOURCE_SECTIONS.find(s => s.key === 'general')!
  const socialSection = SOURCE_SECTIONS.find(s => s.key === 'social')!
  const trendSection = SOURCE_SECTIONS.find(s => s.key === 'trend')!
  const rssSection = SOURCE_SECTIONS.find(s => s.key === 'rss')!

  const countEnabled = (sensors: { key: string }[]) =>
    sensors.filter(s => !HIDDEN_SENSORS.has(s.key) && (enabled[s.key] ?? true)).length

  const countVisible = (sensors: { key: string }[]) =>
    sensors.filter(s => !HIDDEN_SENSORS.has(s.key)).length

  // Trend section: count trending platforms + topics as a combined total
  const trendPlatforms = trendSection.sensors.filter(s => !HIDDEN_SENSORS.has(s.key))
  const topicsOn = (blueskyTopicsEnabled && (enabled.bluesky ?? true)) ||
    (mastodonTopicsEnabled && (enabled.mastodon ?? true))
  const trendTotalCount = trendPlatforms.length + 2 + 1 // platforms + (X trends, Mastodon trends) + topics
  const trendEnabledCount = trendPlatforms.filter(s => enabled[s.key] ?? true).length +
    (mastodonTrendsEnabled ? 1 : 0) + // Mastodon trends
    (topicsOn ? 1 : 0)

  /* ─── RSS add handler with feed discovery ─────────────────── */

  const handleRssAdd = (url: string) => {
    setRssFeeds(prev => [{ url, type: 'other' }, ...prev])
    api.discoverRssFeed(url).then((result) => {
      if (result.type === 'discovered' && result.feedUrl) {
        setRssFeeds((prev) => prev.map((f) => f.url === url ? { ...f, url: result.feedUrl! } : f))
        showToast(`Feed discovered: ${result.feedTitle ?? result.feedUrl}`)
      } else if (result.type === 'not_found') {
        setRssFeeds((prev) => prev.filter((f) => f.url !== url))
        showToast('No RSS feed found at that URL')
      } else if (result.type === 'error') {
        setRssFeeds((prev) => prev.filter((f) => f.url !== url))
        showToast(`Feed discovery failed: ${result.message}`)
      }
      trigger()
    }).catch(() => {
      trigger()
    })
  }

  /* ─── Shared row props ────────────────────────────────────── */

  const rowProps = {
    sensorLimits, sensorLookback, defaultLimit,
    updateSensorLimit, updateSensorLookback,
  }

  if (!loaded) {
    return (
      <div>
        <div className="page-header" style={{ paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: '0.125rem' }}>
            Sources
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            Active data sources for your pipeline.
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
            Sources
          </h2>
          <AutoSaveIndicator status={saveStatus} />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
          Active data sources for your pipeline.
        </p>
      </div>

      <div style={{ paddingBottom: '4rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* ═══ General Section ═══════════════════════════════════════ */}
          <FoldableSection
            title={generalSection.label}
            enabledCount={countEnabled(generalSection.sensors)}
            totalCount={countVisible(generalSection.sensors)}
          >
            {generalSection.sensors.filter(s => !HIDDEN_SENSORS.has(s.key)).map((sensor, i, arr) => (
              <SensorRow
                key={sensor.key}
                sensorKey={sensor.key}
                label={sensor.label}
                desc={sensor.desc}
                language={sensor.language}
                isOn={enabled[sensor.key] ?? true}
                onToggle={() => toggle(sensor.key)}
                status={getBadge(sensor.key)}
                isLast={i === arr.length - 1}
                {...rowProps}
              />
            ))}
          </FoldableSection>

          {/* ═══ Social Accounts Section ═══════════════════════════════ */}
          <FoldableSection
            title={socialSection.label}
            enabledCount={countEnabled(socialSection.sensors)}
            totalCount={countVisible(socialSection.sensors)}
          >
            {socialSection.sensors.filter(s => !HIDDEN_SENSORS.has(s.key)).map((sensor, i, arr) => {
              const isOn = enabled[sensor.key] ?? true
              const isLast = i === arr.length - 1
              const isX = sensor.key === 'x'
              const isBluesky = sensor.key === 'bluesky'
              const isMastodon = sensor.key === 'mastodon'

              return (
                <SensorRow
                  key={sensor.key}
                  sensorKey={sensor.key}
                  label={sensor.label}
                  desc={sensor.desc}
                  language={sensor.language}
                  isOn={isOn}
                  onToggle={() => toggle(sensor.key)}
                  status={getBadge(sensor.key)}
                  isLast={isLast}
                  hasSubConfig={isOn}
                  {...rowProps}
                >
                  {/* X accounts sub-config */}
                  {isX && isOn && (
                    <div style={{ ...subConfigStyle, borderBottom: isLast ? 'none' : '1px solid var(--border-soft)' }}>
                      <div>
                        <div style={subLabelStyle}>
                          <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--ink)' }} />
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

                  {/* Bluesky accounts sub-config */}
                  {isBluesky && isOn && (
                    <div style={{ ...subConfigStyle, borderBottom: isLast ? 'none' : '1px solid var(--border-soft)' }}>
                      <div>
                        <div style={subLabelStyle}>
                          <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-bluesky)' }} />
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
                            Include accounts I follow
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Mastodon accounts sub-config */}
                  {isMastodon && isOn && (
                    <div style={{ ...subConfigStyle, borderBottom: isLast ? 'none' : '1px solid var(--border-soft)' }}>
                      <div>
                        <div style={subLabelStyle}>
                          <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--brand-mastodon)' }} />
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
                            Include accounts I follow
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </SensorRow>
              )
            })}
          </FoldableSection>

          {/* ═══ Trend Section ═════════════════════════════════════════ */}
          <FoldableSection
            title="Trend"
            enabledCount={trendEnabledCount}
            totalCount={trendTotalCount}
          >
            {/* ── Trending Platforms sub-section ── */}
            <div style={sectionLabelStyle}>Trending Platforms</div>

            {/* Mastodon Trends */}
            <div>
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
                  <div style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: mastodonTrendsEnabled ? 'var(--ink)' : 'var(--ink-faint)',
                  }}>
                    Mastodon Trends
                  </div>
                </div>
                <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                  {mastodonTrendsEnabled && (
                    <PillInput
                      label="Items"
                      value={sensorLimits['social_trends'] ?? defaultLimit}
                      min={1}
                      max={200}
                      onChange={(v) => updateSensorLimit('social_trends', v)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Weibo + Xiaohongshu (from trend sensors) */}
            {trendPlatforms.map((sensor, i) => (
              <SensorRow
                key={sensor.key}
                sensorKey={sensor.key}
                label={sensor.label}
                desc={sensor.desc}
                language={sensor.language}
                isOn={enabled[sensor.key] ?? true}
                onToggle={() => toggle(sensor.key)}
                status={getBadge(sensor.key)}
                isLast={i === trendPlatforms.length - 1}
                {...rowProps}
              />
            ))}

            {/* ── Topics sub-section ── */}
            <div style={{ ...sectionLabelStyle, borderTop: '1px solid var(--border-soft)' }}>Topics</div>

            <div>
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
                  <div style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: topicsOn ? 'var(--ink)' : 'var(--ink-faint)',
                  }}>
                    Search Topics
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
              {topicsOn && (
                <div style={{
                  padding: '0.5rem 0.875rem',
                  background: 'var(--canvas)',
                }}>
                  <TagInput
                    tags={socialTopicsKeywords}
                    onChange={(tags) => { setSocialTopicsKeywords(tags); trigger() }}
                    placeholder="keyword or #hashtag — press Enter"
                  />
                </div>
              )}
            </div>
          </FoldableSection>

          {/* ═══ RSS Section ═══════════════════════════════════════════ */}
          <FoldableSection
            title={rssSection.label}
            enabledCount={enabled.rss_feeds ?? true ? 1 : 0}
            totalCount={1}
          >
            {/* Single RSS toggle row */}
            <div
              className="sensor-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.5rem 0.875rem',
                borderBottom: (enabled.rss_feeds ?? true) ? '1px solid var(--border-soft)' : 'none',
                transition: 'background 120ms',
                gap: '0.5rem',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
            >
              <div className="sensor-row-left" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
                <Toggle on={enabled.rss_feeds ?? true} onClick={() => toggle('rss_feeds')} />
                <div style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: (enabled.rss_feeds ?? true) ? 'var(--ink)' : 'var(--ink-faint)',
                }}>
                  RSS Feeds
                </div>
              </div>
              <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                {(enabled.rss_feeds ?? true) && (
                  <>
                    <PillInput
                      label="Items"
                      value={sensorLimits['rss_feeds'] ?? defaultLimit}
                      min={1}
                      max={200}
                      onChange={(v) => updateSensorLimit('rss_feeds', v)}
                    />
                    <PillInput
                      label="Lookback"
                      value={sensorLookback['rss_feeds'] ?? SENSOR_LOOKBACK_SUPPORT['rss_feeds']}
                      min={1}
                      max={336}
                      suffix="h"
                      onChange={(v) => updateSensorLookback('rss_feeds', v)}
                    />
                  </>
                )}
                <Badge status={getBadge('rss_feeds')} />
              </div>
            </div>

            {/* RSS feed list */}
            {(enabled.rss_feeds ?? true) && (
              <div style={{
                padding: '0.625rem 0.875rem',
                background: 'var(--canvas)',
              }}>
                <RssFeedList
                  feeds={rssFeeds}
                  onChange={(feeds) => { setRssFeeds(feeds); trigger() }}
                  onAdd={handleRssAdd}
                />
              </div>
            )}
          </FoldableSection>

        </div>
      </div>
    </div>
  )
}
