// ABOUTME: Slide-in detail panel for sensors with complex settings (accounts, topics, feeds).
// ABOUTME: Opens from the right side, following Dashboard DetailPanel pattern with framer-motion.
'use client'
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'
import { TagInput } from '@/components/TagInput'
import { RssFeedList } from '@/components/sources/RssFeedList'
import { PillInput } from '@/components/sources/PillInput'
import { CategoryBadge } from '@/components/sources/SensorBadge'
import { SENSORS, type CategoryKey } from '@/lib/sensors/taxonomy'
import type { RssFeedEntry } from '@/lib/models'

/** Sensor key to SensorDef lookup. */
const SENSOR_MAP = Object.fromEntries(SENSORS.map(s => [s.key, s])) as Record<
  string,
  { key: string; label: string; desc: string; category: CategoryKey }
>

export interface SensorDetailPanelProps {
  sensorKey: string
  onClose: () => void

  // X accounts
  socialAccountsX: string[]
  setSocialAccountsX: (tags: string[]) => void
  xScraperProvider: 'twitter-scraper' | 'apify' | 'mixed'
  setXScraperProvider: (v: 'twitter-scraper' | 'apify' | 'mixed') => void

  // Bluesky accounts
  socialAccountsBluesky: string[]
  setSocialAccountsBluesky: (tags: string[]) => void
  followingBluesky: boolean
  setFollowingBluesky: (v: boolean) => void
  hasBlueskyCredentials: boolean

  // Mastodon accounts
  socialAccountsMastodon: string[]
  setSocialAccountsMastodon: (tags: string[]) => void
  followingMastodon: boolean
  setFollowingMastodon: (v: boolean) => void
  hasMastodonCredentials: boolean

  // Shared account controls
  disabledAccounts: Set<string>
  onToggleAccountDisabled: (account: string) => void
  onEnableAllAccounts: (accounts: string[]) => void
  onDisableAllAccounts: (accounts: string[]) => void

  // Topics (shared keywords)
  socialTopicsKeywords: string[]
  setSocialTopicsKeywords: (keywords: string[]) => void
  topicLimits: Record<string, number>
  defaultTopicLimit: number
  topicLookback: Record<string, number>
  onUpdateTopicLimit: (keyword: string, value: number) => void
  onUpdateTopicLookback: (keyword: string, value: number) => void
  onRemoveTopicKeyword: (keyword: string) => void

  // RSS feeds
  rssFeeds: RssFeedEntry[]
  setRssFeeds: (feeds: RssFeedEntry[]) => void
  onAddRssFeed: (url: string) => void

  // Validators
  validateX: (v: string) => string | null
  validateBsky: (v: string) => string | null
  validateMasto: (v: string) => string | null

  // Auto-save trigger
  trigger: () => void
}

/** Normalize X handle to always include @ prefix. */
function normalizeXHandle(value: string): string {
  return value.startsWith('@') ? value : `@${value}`
}

/** Normalize Mastodon handle to always include @ prefix. */
function normalizeMastodonHandle(value: string): string {
  return value.startsWith('@') ? value : `@${value}`
}

export function SensorDetailPanel({
  sensorKey,
  onClose,
  socialAccountsX,
  setSocialAccountsX,
  xScraperProvider,
  setXScraperProvider,
  socialAccountsBluesky,
  setSocialAccountsBluesky,
  followingBluesky,
  setFollowingBluesky,
  hasBlueskyCredentials,
  socialAccountsMastodon,
  setSocialAccountsMastodon,
  followingMastodon,
  setFollowingMastodon,
  hasMastodonCredentials,
  disabledAccounts,
  onToggleAccountDisabled,
  onEnableAllAccounts,
  onDisableAllAccounts,
  socialTopicsKeywords,
  setSocialTopicsKeywords,
  topicLimits,
  defaultTopicLimit,
  topicLookback,
  onUpdateTopicLimit,
  onUpdateTopicLookback,
  onRemoveTopicKeyword,
  rssFeeds,
  setRssFeeds,
  onAddRssFeed,
  validateX,
  validateBsky,
  validateMasto,
  trigger,
}: SensorDetailPanelProps) {
  const { t } = useTranslation()
  const sensor = SENSOR_MAP[sensorKey]

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll while panel is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const renderContent = () => {
    // X Accounts
    if (sensorKey === 'x_accounts') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('sources.accounts')}
            </div>
            <TagInput
              tags={socialAccountsX}
              onChange={(tags) => { setSocialAccountsX(tags.map(normalizeXHandle)); trigger() }}
              placeholder={t('sources.placeholder_twitter')}
              validate={validateX}
              disabledTags={disabledAccounts}
              onToggleDisabled={onToggleAccountDisabled}
              onEnableAll={() => onEnableAllAccounts(socialAccountsX)}
              onDisableAll={() => onDisableAllAccounts(socialAccountsX)}
            />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('sources.x_scraper_provider')}
            </div>
            <select
              value={xScraperProvider}
              onChange={(e) => { setXScraperProvider(e.target.value as typeof xScraperProvider); trigger() }}
              style={{
                fontSize: '0.8125rem',
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--surface)',
                color: 'var(--ink)',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <option value="twitter-scraper">twitter-scraper</option>
              <option value="apify">apify</option>
              <option value="mixed">mixed</option>
            </select>
          </div>
        </div>
      )
    }

    // Bluesky Accounts
    if (sensorKey === 'bluesky_accounts') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('sources.accounts')}
            </div>
            <TagInput
              tags={socialAccountsBluesky}
              onChange={(tags) => { setSocialAccountsBluesky(tags); trigger() }}
              placeholder={t('sources.placeholder_bluesky')}
              validate={validateBsky}
              disabledTags={disabledAccounts}
              onToggleDisabled={onToggleAccountDisabled}
              onEnableAll={() => onEnableAllAccounts(socialAccountsBluesky)}
              onDisableAll={() => onDisableAllAccounts(socialAccountsBluesky)}
            />
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            cursor: hasBlueskyCredentials ? 'pointer' : 'not-allowed',
            opacity: hasBlueskyCredentials ? 1 : 0.4,
            padding: '0.5rem 0',
          }}>
            <input type="checkbox" checked={followingBluesky}
              disabled={!hasBlueskyCredentials}
              onChange={(e) => { setFollowingBluesky(e.target.checked); trigger() }}
              style={{ accentColor: 'var(--brand-bluesky)', cursor: 'inherit' }} />
            <span style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>{t('sources.include_following')}</span>
          </label>
        </div>
      )
    }

    // Mastodon Accounts
    if (sensorKey === 'mastodon_accounts') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('sources.accounts')}
            </div>
            <TagInput
              tags={socialAccountsMastodon}
              onChange={(tags) => { setSocialAccountsMastodon(tags.map(normalizeMastodonHandle)); trigger() }}
              placeholder={t('sources.placeholder_mastodon')}
              validate={validateMasto}
              disabledTags={disabledAccounts}
              onToggleDisabled={onToggleAccountDisabled}
              onEnableAll={() => onEnableAllAccounts(socialAccountsMastodon)}
              onDisableAll={() => onDisableAllAccounts(socialAccountsMastodon)}
            />
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            cursor: hasMastodonCredentials ? 'pointer' : 'not-allowed',
            opacity: hasMastodonCredentials ? 1 : 0.4,
            padding: '0.5rem 0',
          }}>
            <input type="checkbox" checked={followingMastodon}
              disabled={!hasMastodonCredentials}
              onChange={(e) => { setFollowingMastodon(e.target.checked); trigger() }}
              style={{ accentColor: 'var(--brand-mastodon)', cursor: 'inherit' }} />
            <span style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>{t('sources.include_following')}</span>
          </label>
        </div>
      )
    }

    // Bluesky Topics / Mastodon Topics — shared keyword list
    if (sensorKey === 'bluesky_topics' || sensorKey === 'mastodon_topics') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('sources.topics_keywords')}
          </div>
          {socialTopicsKeywords.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {socialTopicsKeywords.map((keyword) => (
                <div
                  key={keyword}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.625rem',
                    padding: '0.375rem 0.5rem',
                    borderRadius: 6,
                    background: 'var(--canvas)',
                  }}
                >
                  <span style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: 'var(--accent)',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {keyword}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                    <PillInput
                      label={t('sources.items')}
                      value={topicLimits[keyword] ?? defaultTopicLimit}
                      min={1}
                      max={100}
                      onChange={(v) => onUpdateTopicLimit(keyword, v)}
                    />
                    <PillInput
                      label={t('sources.lookback')}
                      value={topicLookback[keyword] ?? 48}
                      min={1}
                      max={336}
                      suffix="h"
                      onChange={(v) => onUpdateTopicLookback(keyword, v)}
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveTopicKeyword(keyword)}
                      style={{
                        color: 'var(--ink-faint)',
                        fontSize: '1.125rem',
                        lineHeight: 1,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        background: 'none',
                        border: 'none',
                        padding: '0.125rem',
                        transition: 'color 120ms',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--err)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-faint)' }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <input
            type="text"
            placeholder={t('sources.placeholder_topics')}
            style={{
              width: '100%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '0.75rem 1rem',
              fontSize: '0.875rem',
              color: 'var(--ink)',
              outline: 'none',
              transition: 'border-color 120ms, box-shadow 120ms',
              fontFamily: 'inherit',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = 'var(--focus-ring)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'none'
              const val = e.currentTarget.value.trim()
              if (val && !socialTopicsKeywords.includes(val)) {
                setSocialTopicsKeywords([...socialTopicsKeywords, val])
                trigger()
              }
              e.currentTarget.value = ''
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const val = (e.currentTarget as HTMLInputElement).value.trim()
                if (val && !socialTopicsKeywords.includes(val)) {
                  setSocialTopicsKeywords([...socialTopicsKeywords, val])
                  trigger()
                }
                (e.currentTarget as HTMLInputElement).value = ''
              }
              if (e.key === 'Backspace' && !(e.currentTarget as HTMLInputElement).value && socialTopicsKeywords.length) {
                setSocialTopicsKeywords(socialTopicsKeywords.slice(0, -1))
                trigger()
              }
            }}
          />
        </div>
      )
    }

    // RSS News / RSS Blogs
    if (sensorKey === 'rss_news' || sensorKey === 'rss_blogs') {
      const feedType = sensorKey === 'rss_news' ? 'news' : 'blog'
      return (
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('sources.rss_feeds')}
          </div>
          <RssFeedList
            feeds={rssFeeds}
            filterType={feedType === 'news' ? ['news'] : ['blog', 'other']}
            onChange={(feeds) => { setRssFeeds(feeds); trigger() }}
            onAdd={onAddRssFeed}
          />
        </div>
      )
    }

    return null
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
      />
      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 480, maxWidth: '90vw',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          zIndex: 101,
          padding: '1.5rem',
          display: 'flex', flexDirection: 'column', gap: '1rem',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ink)' }}>
              {sensor?.label ?? sensorKey}
            </span>
            {sensor && <CategoryBadge category={sensor.category} />}
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            style={{
              width: 28, height: 28, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface-inset)', color: 'var(--ink-tertiary)',
              fontSize: '1rem', lineHeight: 1, border: 'none', cursor: 'pointer',
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--ink)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-inset)'; e.currentTarget.style.color = 'var(--ink-tertiary)' }}
          >
            &times;
          </button>
        </div>

        {/* Description */}
        {sensor && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5, margin: 0 }}>
            {t('sensor.desc.' + sensorKey)}
          </p>
        )}

        {/* Divider */}
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-soft)', margin: 0 }} />

        {/* Sensor-specific controls */}
        {renderContent()}
      </motion.div>
    </>
  )
}
