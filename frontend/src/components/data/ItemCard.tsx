// ABOUTME: Item card component — renders a single IntelItem as a news card.
// ABOUTME: Includes source chip, heat stats, abstract/content expand, and discussion links.
'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import type { IntelItem } from '@/api/client'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'
import { useTranslation } from '@/lib/i18n'
import { Highlight } from './Highlight'

const SOURCE_LABELS: Record<string, string> = { ...SENSOR_LABELS }

/** CSS to clamp text to N lines with ellipsis */
export const LINE_CLAMP_CSS = `
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
`

const PLATFORM_COLORS: Record<string, { color: string; bg: string }> = {
  x:        { color: 'var(--ink)', bg: 'var(--surface-alt)' },
  bluesky:  { color: 'var(--brand-bluesky)', bg: 'var(--brand-bluesky-bg)' },
  mastodon: { color: 'var(--brand-mastodon)', bg: 'var(--brand-mastodon-bg)' },
  rss_feeds: { color: 'var(--brand-rss)', bg: 'var(--brand-rss-bg)' },
}

function SourceChip({ source, label }: { source: string; label?: string }) {
  const platform = PLATFORM_COLORS[source]
  return (
    <span style={{
      fontSize: '0.625rem',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: platform?.color ?? 'var(--ink-faint)',
      background: platform?.bg ?? 'var(--surface-alt)',
      padding: '0.2rem 0.5rem',
      borderRadius: 3,
    }}>
      {label ?? SOURCE_LABELS[source] ?? source}
    </span>
  )
}

function relativeDate(iso: string, t: (key: string, params?: Record<string, string>) => string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 3600) return t('time.minutes_ago', { n: String(Math.floor(diff / 60)) })
  if (diff < 86400) return t('time.hours_ago', { n: String(Math.floor(diff / 3600)) })
  return t('time.days_ago', { n: String(Math.floor(diff / 86400)) })
}

function sourcePostUrl(item: IntelItem): string | null {
  if (item.source === 'hacker_news') {
    const storyId = item.id.replace('hn-', '')
    return `https://news.ycombinator.com/item?id=${storyId}`
  }
  if (item.source === 'product_hunt' && item.url.includes('producthunt.com')) {
    return item.url
  }
  if (item.source === 'v2ex' && item.url.includes('v2ex.com')) {
    return item.url
  }
  return null
}

export function ItemCard({ item, index = 0, searchQuery }: { item: IntelItem; index?: number; searchQuery?: string }) {
  const { t } = useTranslation()
  const isArxiv = item.source === 'arxiv'
  const [abstractExpanded, setAbstractExpanded] = useState(false)
  const [contentExpanded, setContentExpanded] = useState(false)
  const q = searchQuery?.toLowerCase().trim() || ''

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 30,
        delay: index < 8 ? index * 0.04 : 0,
      }}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.25rem',
        transition: 'box-shadow 150ms, border-color 150ms',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-dim)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
      }}
    >
      {/* Title */}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          fontSize: '0.9375rem',
          fontWeight: 500,
          color: 'var(--ink)',
          lineHeight: 1.5,
          marginBottom: '0.5rem',
          textDecoration: 'none',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--ink)' }}
      >
        <Highlight text={item.title} query={q} />
      </a>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <SourceChip source={item.source} label={item.source === 'rss_feeds' ? (item.account ?? undefined) : undefined} />
        {item.sentiment && item.sentiment.label !== 'neutral' && (
          <span
            title={`${item.sentiment.label} (${Math.round(item.sentiment.score * 100)}%)`}
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: item.sentiment.label === 'positive' ? 'var(--sent-pos)' : 'var(--sent-neg)',
              flexShrink: 0,
            }}
          />
        )}
        {item.verified === false && (
          <span
            title={t('item.link_unverified')}
            style={{
              fontSize: '0.625rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--warn)',
              background: 'var(--warn-wash, rgba(234,179,8,0.1))',
              padding: '0.2rem 0.5rem',
              borderRadius: 3,
            }}
          >
            {t('item.unverified')}
          </span>
        )}
        {item.heat && (
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
            {item.heat}
            {item.velocity && item.velocity.changePercent != null && (
              <span style={{
                marginLeft: '0.25rem',
                fontSize: '0.625rem',
                fontWeight: 600,
                color: item.velocity.changePercent > 0 ? 'var(--ok)' : item.velocity.changePercent < 0 ? 'var(--err)' : 'var(--ink-faint)',
              }}>
                {item.velocity.changePercent > 0 ? '+' : ''}{item.velocity.changePercent}%
              </span>
            )}
            {item.velocity && item.velocity.changePercent == null && (
              <span style={{
                marginLeft: '0.25rem',
                fontSize: '0.625rem',
                fontWeight: 600,
                color: 'var(--warn)',
              }}>
                {t('item.new')}
              </span>
            )}
          </span>
        )}
        {!item.heat && item.velocity && (
          <span style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            color: item.velocity.changePercent == null ? 'var(--warn)'
              : item.velocity.changePercent > 0 ? 'var(--ok)'
              : item.velocity.changePercent < 0 ? 'var(--err)'
              : 'var(--ink-faint)',
          }}>
            {item.velocity.changePercent == null ? t('item.new') : `${item.velocity.changePercent > 0 ? '+' : ''}${item.velocity.changePercent}%`}
          </span>
        )}
        {item.velocity && item.velocity.hoursOnTrend != null && item.velocity.hoursOnTrend > 0 && (
          <>
            <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>
              {item.velocity.hoursOnTrend < 1
                ? t('item.on_trend_short')
                : t('item.on_trend', { hours: String(Math.round(item.velocity.hoursOnTrend)) })}
            </span>
          </>
        )}
        {item.published_at && (
          <>
            <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>
              {relativeDate(item.published_at, t)}
            </span>
          </>
        )}
        {item.account && (
          <>
            <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>@{item.handle ?? item.account}</span>
          </>
        )}
        {item.topic && (
          <>
            <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{item.topic}</span>
          </>
        )}
        {sourcePostUrl(item) && sourcePostUrl(item) !== item.url && (
          <>
            <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
            <a
              href={sourcePostUrl(item)!}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.6875rem',
                fontWeight: 500,
                color: 'var(--accent)',
                textDecoration: 'none',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none' }}
            >
              {t('item.discuss')}
            </a>
          </>
        )}
      </div>

      {/* Abstract preview — arxiv items get a collapse/expand toggle */}
      {item.abstract && (
        <div style={{ marginTop: '0.625rem' }}>
          <p
            className={isArxiv && !abstractExpanded ? 'line-clamp-2' : undefined}
            style={{
              fontSize: '0.8125rem',
              color: 'var(--ink-muted)',
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            <Highlight text={item.abstract} query={q} />
          </p>
          {isArxiv && (
            <button
              onClick={() => setAbstractExpanded(!abstractExpanded)}
              style={{
                marginTop: '0.375rem',
                fontSize: '0.6875rem',
                fontWeight: 500,
                color: 'var(--accent)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              {abstractExpanded ? t('item.collapse') : t('item.expand_abstract')}
            </button>
          )}
        </div>
      )}

      {/* Content preview (HN comments, blog content) */}
      {item.content && !item.abstract && (
        <div style={{ marginTop: '0.625rem' }}>
          <p
            className={contentExpanded ? undefined : 'line-clamp-2'}
            style={{
              fontSize: '0.8125rem',
              color: 'var(--ink-muted)',
              lineHeight: 1.65,
              margin: 0,
              whiteSpace: 'pre-line',
            }}
          >
            <Highlight text={item.content} query={q} />
          </p>
          <button
            onClick={() => setContentExpanded(!contentExpanded)}
            style={{
              marginTop: '0.375rem',
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: 'var(--accent)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            {contentExpanded ? t('item.collapse') : t('item.more')}
          </button>
        </div>
      )}
    </motion.article>
  )
}
