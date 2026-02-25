// ABOUTME: Intelligence card components for the Dashboard — PublicFocusCard, TopicPulseCard, VoicesCard.
// ABOUTME: Each card renders a compact preview with static tag cloud; full detail shown in sidebar panel.
'use client'

import { useMemo } from 'react'
import { TagCloud } from './TagCloud'
import type { TagCloudTag } from './TagCloud'

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const PULSE_CSS = `
@keyframes intelCardPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`

const CARD_BASE: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '1rem',
  boxShadow: 'var(--shadow-card)',
}

const HEADER_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-secondary)',
  fontFamily: MONO,
  margin: 0,
}

const SUMMARY_STYLE: React.CSSProperties = {
  fontSize: '0.8125rem',
  lineHeight: 1.6,
  color: 'var(--ink-secondary)',
  margin: 0,
}

const SECTION_GAP: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.75rem',
}

// ---------------------------------------------------------------------------
// Sentiment helpers
// ---------------------------------------------------------------------------

const SENTIMENT_DOT_COLORS: Record<string, string> = {
  positive: '#27ae60',
  negative: '#e74c3c',
  mixed:    '#f39c12',
  neutral:  '#95a5a6',
}

function SentimentDot({ sentiment, size = 7 }: { sentiment?: string; size?: number }) {
  const color = SENTIMENT_DOT_COLORS[sentiment ?? 'neutral'] ?? SENTIMENT_DOT_COLORS.neutral
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  const color = SENTIMENT_DOT_COLORS[sentiment ?? 'neutral'] ?? SENTIMENT_DOT_COLORS.neutral
  const label = sentiment ?? 'neutral'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: '0.5625rem',
        fontWeight: 600,
        fontFamily: MONO,
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        borderRadius: 4,
        padding: '0.125rem 0.375rem',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function SentimentLegend() {
  const items = [
    { label: 'Positive', color: SENTIMENT_DOT_COLORS.positive },
    { label: 'Negative', color: SENTIMENT_DOT_COLORS.negative },
    { label: 'Mixed', color: SENTIMENT_DOT_COLORS.mixed },
    { label: 'Neutral', color: SENTIMENT_DOT_COLORS.neutral },
  ]
  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      flexWrap: 'wrap',
    }}>
      {items.map(item => (
        <span
          key={item.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.5625rem',
            color: 'var(--ink-tertiary)',
            fontFamily: MONO,
          }}
        >
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: item.color,
          }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading placeholder
// ---------------------------------------------------------------------------

function LoadingPlaceholder() {
  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{ animation: 'intelCardPulse 1.8s ease-in-out infinite' }}>
        <div style={{ ...SECTION_GAP }}>
          {[0.6, 0.9, 0.75, 0.5].map((w, i) => (
            <div
              key={i}
              style={{
                height: i === 0 ? 10 : 12,
                width: `${w * 100}%`,
                background: 'var(--border)',
                borderRadius: 4,
              }}
            />
          ))}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyHint({ message }: { message: string }) {
  return (
    <p style={{ fontSize: '0.75rem', color: 'var(--ink-tertiary)', margin: 0, fontStyle: 'italic' }}>
      {message}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Card header with colored left border accent
// ---------------------------------------------------------------------------

function CardHeader({ label, accentColor }: { label: string; accentColor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span
        style={{
          width: 3,
          height: 14,
          borderRadius: 2,
          background: accentColor,
          flexShrink: 0,
        }}
      />
      <h3 style={HEADER_STYLE}>{label}</h3>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function PlatformBadge({ platform }: { platform: string }) {
  const PLATFORM_BADGE_COLORS: Record<string, { color: string; bg: string }> = {
    x:        { color: 'var(--ink-secondary)', bg: 'var(--surface-inset)' },
    twitter:  { color: 'var(--ink-secondary)', bg: 'var(--surface-inset)' },
    bluesky:  { color: 'var(--brand-bluesky)',     bg: 'var(--brand-bluesky-bg)' },
    mastodon: { color: 'var(--brand-mastodon)',     bg: 'var(--brand-mastodon-bg)' },
  }

  const key = platform.toLowerCase()
  const colors = PLATFORM_BADGE_COLORS[key] ?? { color: 'var(--ink-secondary)', bg: 'var(--surface-inset)' }
  const label = key === 'twitter' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1)

  return (
    <span
      style={{
        fontSize: '0.5rem',
        fontWeight: 700,
        fontFamily: MONO,
        color: colors.color,
        background: colors.bg,
        borderRadius: 3,
        padding: '0.0625rem 0.25rem',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
}

function ThemeMiniTag({ text }: { text: string }) {
  return (
    <span
      style={{
        fontSize: '0.5625rem',
        color: 'var(--ink-tertiary)',
        background: 'var(--surface-inset)',
        borderRadius: 3,
        padding: '0.0625rem 0.25rem',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Types (local interfaces matching the intelligence data shapes)
// ---------------------------------------------------------------------------

interface IntelTag {
  text: string
  weight: number
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed'
}

interface TrendTopic {
  name: string
  summary: string
  sources: string[]
  itemCount: number
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  heat: number
}

export interface TrendIntelligence {
  topics: TrendTopic[]
  tags: IntelTag[]
  summary: string
  generated_at: string
}

interface TopicSentimentEntry {
  topic: string
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  summary: string
  samplePosts: string[]
  postCount: number
}

export interface TopicIntelligence {
  topics: TopicSentimentEntry[]
  tags: IntelTag[]
  summary: string
  generated_at: string
}

interface AccountFocus {
  account: string
  handle: string
  platform: string
  themes: string[]
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  postCount: number
}

export interface AccountsIntelligence {
  accounts: AccountFocus[]
  tags: IntelTag[]
  summary: string
  generated_at: string
}

// ---------------------------------------------------------------------------
// Clamped summary style — shared across compact cards
// ---------------------------------------------------------------------------

const CLAMPED_SUMMARY: React.CSSProperties = {
  ...SUMMARY_STYLE,
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
}

// ---------------------------------------------------------------------------
// Clickable card wrapper — shared across compact cards
// ---------------------------------------------------------------------------

function ClickableCard({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        ...CARD_BASE,
        height: '100%',
        display: 'flex',
        flexDirection: 'column' as const,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)'
          e.currentTarget.style.borderColor = 'var(--border-hover, var(--border))'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
        e.currentTarget.style.borderColor = ''
      }}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1. PublicFocusCard — Compact Trend Intelligence Preview
// ---------------------------------------------------------------------------

interface PublicFocusCardProps {
  data: TrendIntelligence | null
  loading?: boolean
  onClick?: () => void
}

export function PublicFocusCard({ data, loading, onClick }: PublicFocusCardProps) {
  const tagCloudTags: TagCloudTag[] = useMemo(() => {
    return (data?.tags ?? []).map((t) => ({
      text: t.text,
      weight: t.weight,
      sentiment: t.sentiment,
    }))
  }, [data])

  return (
    <ClickableCard onClick={onClick}>
      <div style={{ ...SECTION_GAP, flex: 1 }}>
        <CardHeader label="Public Focus" accentColor="#f39c12" />

        {loading ? (
          <LoadingPlaceholder />
        ) : !data ? (
          <EmptyHint message="No trend data yet" />
        ) : (
          <>
            {data.summary && (
              <p style={CLAMPED_SUMMARY}>{data.summary}</p>
            )}

            {tagCloudTags.length > 0 && (
              <TagCloud tags={tagCloudTags} maxTags={15} style={{ marginTop: '0.25rem', justifyContent: 'center' }} />
            )}
          </>
        )}
      </div>
    </ClickableCard>
  )
}

// ---------------------------------------------------------------------------
// 2. TopicPulseCard — Compact Social Topic Intelligence Preview
// ---------------------------------------------------------------------------

interface TopicPulseCardProps {
  data: TopicIntelligence | null
  loading?: boolean
  onClick?: () => void
}

export function TopicPulseCard({ data, loading, onClick }: TopicPulseCardProps) {
  return (
    <ClickableCard onClick={onClick}>
      <div style={{ ...SECTION_GAP, flex: 1 }}>
        <CardHeader label="Topic Pulse" accentColor="#9b59b6" />

        {loading ? (
          <LoadingPlaceholder />
        ) : !data ? (
          <EmptyHint message="Configure topics in Settings to monitor public sentiment" />
        ) : (
          <>
            {data.summary && (
              <p style={CLAMPED_SUMMARY}>{data.summary}</p>
            )}

            {/* Topic list — compact: name + sentiment badge per row */}
            {data.topics.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {data.topics.map((entry) => (
                  <div key={entry.topic} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <SentimentDot sentiment={entry.sentiment} size={6} />
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}>
                      {entry.topic}
                    </span>
                    <SentimentBadge sentiment={entry.sentiment} />
                    <span style={{
                      fontSize: '0.5625rem',
                      fontFamily: MONO,
                      color: 'var(--ink-tertiary)',
                      marginLeft: 'auto',
                    }}>
                      {entry.postCount} posts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ClickableCard>
  )
}

// ---------------------------------------------------------------------------
// 3. VoicesCard — Compact Social Accounts Intelligence Preview
// ---------------------------------------------------------------------------

interface VoicesCardProps {
  data: AccountsIntelligence | null
  loading?: boolean
  onClick?: () => void
}

export function VoicesCard({ data, loading, onClick }: VoicesCardProps) {
  const tagCloudTags: TagCloudTag[] = useMemo(() => {
    return (data?.tags ?? []).map((t) => ({
      text: t.text,
      weight: t.weight,
      sentiment: t.sentiment,
    }))
  }, [data])

  return (
    <ClickableCard onClick={onClick}>
      <div style={{ ...SECTION_GAP, flex: 1 }}>
        <CardHeader label="Voices" accentColor="#3498db" />

        {loading ? (
          <LoadingPlaceholder />
        ) : !data ? (
          <EmptyHint message="Follow accounts in Settings to see what they're focused on" />
        ) : (
          <>
            {data.summary && (
              <p style={CLAMPED_SUMMARY}>{data.summary}</p>
            )}

            {tagCloudTags.length > 0 && (
              <TagCloud tags={tagCloudTags} maxTags={15} style={{ marginTop: '0.25rem', justifyContent: 'center' }} />
            )}
          </>
        )}
      </div>
    </ClickableCard>
  )
}

// ---------------------------------------------------------------------------
// Detail Components — full content for sidebar panels
// ---------------------------------------------------------------------------

/** Full detail view for Public Focus / Trend Intelligence. */
export function PublicFocusDetail({ data }: { data: TrendIntelligence }) {
  const topTopics = useMemo(() => {
    if (!data?.topics) return []
    return [...data.topics].sort((a, b) => b.heat - a.heat).slice(0, 8)
  }, [data])

  const tagCloudTags: TagCloudTag[] = useMemo(() => {
    return (data?.tags ?? []).map((t) => ({
      text: t.text,
      weight: t.weight,
      sentiment: t.sentiment,
    }))
  }, [data])

  return (
    <div style={SECTION_GAP}>
      {/* Summary — full, not clamped */}
      {data.summary && (
        <p style={SUMMARY_STYLE}>{data.summary}</p>
      )}

      {/* Tag cloud — flat, sorted by weight, colored by sentiment */}
      {tagCloudTags.length > 0 && (
        <div style={{ margin: '0.25rem 0 0.5rem' }}>
          <SentimentLegend />
          <TagCloud tags={tagCloudTags} maxTags={25} style={{ marginTop: '0.375rem', justifyContent: 'center' }} />
        </div>
      )}

      {/* Top Topics — full rows with name, source count, summary, sentiment */}
      {topTopics.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <span style={{
            fontSize: '0.5625rem',
            fontWeight: 600,
            fontFamily: MONO,
            color: 'var(--ink-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '0.375rem',
          }}>
            Top Topics
          </span>
          {topTopics.map((topic) => (
            <div
              key={topic.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.3rem 0',
                borderBottom: '1px solid var(--border-soft)',
                minHeight: 28,
              }}
            >
              <SentimentDot sentiment={topic.sentiment} size={6} />
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--ink)',
                flexShrink: 0,
              }}>
                {topic.name}
              </span>
              <span style={{
                fontSize: '0.5625rem',
                fontFamily: MONO,
                fontWeight: 600,
                color: 'var(--ink-tertiary)',
                background: 'var(--surface-inset)',
                borderRadius: 3,
                padding: '0.0625rem 0.3rem',
                flexShrink: 0,
              }}>
                {topic.sources.length} src
              </span>
              <span style={{
                fontSize: '0.6875rem',
                color: 'var(--ink-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}>
                {topic.summary}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Full detail view for Topic Pulse / Social Topic Intelligence. */
export function TopicPulseDetail({ data }: { data: TopicIntelligence }) {
  return (
    <div style={SECTION_GAP}>
      {/* Summary — full */}
      {data.summary && (
        <p style={SUMMARY_STYLE}>{data.summary}</p>
      )}

      {/* All topics with full content */}
      {data.topics.map((entry) => (
        <div
          key={entry.topic}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            padding: '0.5rem 0',
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          {/* Topic header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: 'var(--ink)',
            }}>
              {entry.topic}
            </span>
            <SentimentBadge sentiment={entry.sentiment} />
            <span style={{
              fontSize: '0.5625rem',
              fontFamily: MONO,
              color: 'var(--ink-tertiary)',
              marginLeft: 'auto',
              flexShrink: 0,
            }}>
              {entry.postCount} posts
            </span>
          </div>

          {/* Summary */}
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--ink-secondary)',
            margin: 0,
            lineHeight: 1.5,
          }}>
            {entry.summary}
          </p>

          {/* Sample posts */}
          {entry.samplePosts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.125rem' }}>
              {entry.samplePosts.slice(0, 3).map((post, idx) => (
                <p
                  key={idx}
                  style={{
                    fontSize: '0.6875rem',
                    fontStyle: 'italic',
                    color: 'var(--ink-tertiary)',
                    margin: 0,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  &ldquo;{post}&rdquo;
                </p>
              ))}
            </div>
          )}
        </div>
      ))}

    </div>
  )
}

/** Full detail view for Voices / Social Accounts Intelligence. */
export function VoicesDetail({ data }: { data: AccountsIntelligence }) {
  const sortedAccounts = useMemo(() => {
    if (!data?.accounts) return []
    return [...data.accounts].sort((a, b) => b.postCount - a.postCount)
  }, [data])

  const tagCloudTags: TagCloudTag[] = useMemo(() => {
    return (data?.tags ?? []).map((t) => ({
      text: t.text,
      weight: t.weight,
      sentiment: t.sentiment,
    }))
  }, [data])

  return (
    <div style={SECTION_GAP}>
      {/* Summary — full */}
      {data.summary && (
        <p style={SUMMARY_STYLE}>{data.summary}</p>
      )}

      {/* Tag cloud — flat, sorted by weight, colored by sentiment */}
      {tagCloudTags.length > 0 && (
        <div style={{ margin: '0.25rem 0 0.5rem' }}>
          <SentimentLegend />
          <TagCloud tags={tagCloudTags} maxTags={20} style={{ marginTop: '0.375rem', justifyContent: 'center' }} />
        </div>
      )}

      {/* All accounts with full rows */}
      {sortedAccounts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <span style={{
            fontSize: '0.5625rem',
            fontWeight: 600,
            fontFamily: MONO,
            color: 'var(--ink-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '0.375rem',
          }}>
            Tracked Accounts
          </span>
          {sortedAccounts.map((acct) => (
            <div
              key={`${acct.platform}-${acct.handle}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.3rem 0',
                borderBottom: '1px solid var(--border-soft)',
                minHeight: 28,
              }}
            >
              <SentimentDot sentiment={acct.sentiment} size={6} />
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                fontFamily: MONO,
                color: 'var(--ink)',
                flexShrink: 0,
              }}>
                {acct.handle}
              </span>
              <PlatformBadge platform={acct.platform} />
              <div style={{
                display: 'flex',
                gap: '0.25rem',
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                flexWrap: 'wrap',
              }}>
                {acct.themes.slice(0, 3).map((theme) => (
                  <ThemeMiniTag key={theme} text={theme} />
                ))}
              </div>
              <span style={{
                fontSize: '0.5625rem',
                fontFamily: MONO,
                color: 'var(--ink-tertiary)',
                flexShrink: 0,
              }}>
                {acct.postCount}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
