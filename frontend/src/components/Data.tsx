// ABOUTME: Intel data preview page — shows fetched items grouped by section with section tabs.
// ABOUTME: Card-per-item news reader layout with source filtering and 2-line abstract previews.
'use client'
import { useState, useEffect, useMemo } from 'react'
import { api } from '@/api/client'
import type { IntelReport, IntelItem, ConfigSettings } from '@/api/client'
import { SENSOR_TOKEN_FIELD } from '@/lib/sensors/constants'
import { Pagination } from './Pagination'

const PAGE_SIZE = 20

const SECTIONS: { key: string; label: string }[] = [
  { key: 'tech_trends',  label: 'Tech Trends' },
  { key: 'research',     label: 'Research' },
  { key: 'capital_flow', label: 'Capital Flow' },
  { key: 'products',     label: 'Products' },
  { key: 'community',    label: 'Community' },
  { key: 'social',       label: 'Social' },
  { key: 'insights',     label: 'Insights' },
  { key: 'feeds',        label: 'Feeds' },
]

const SOURCE_LABELS: Record<string, string> = {
  hacker_news:  'HN',
  github:       'GitHub',
  arxiv:        'ArXiv',
  product_hunt: 'PH',
  chrome_radar: 'Chrome',
  v2ex:         'V2EX',
  hn_blogs:     'HN Blogs',
  sources_36kr: '36Kr',
  wallstreetcn: 'WSCN',
  x:            'X',
  bluesky:      'Bluesky',
  mastodon:     'Mastodon',
  rss_feeds:    'RSS',
}

/** Maps each section to the sensors that feed it. */
const SECTION_SENSORS: Record<string, string[]> = {
  tech_trends:  ['hacker_news', 'github'],
  research:     ['arxiv'],
  insights:     ['hn_blogs'],
  products:     ['product_hunt', 'chrome_radar'],
  community:    ['v2ex'],
  capital_flow: ['sources_36kr', 'wallstreetcn'],
  social:       ['social_accounts', 'social_topics', 'social_trends'],
  feeds:        ['rss_feeds'],
}

/** Check if a section is empty because every sensor feeding it lacks a required token. */
function sectionNeedsKey(sectionKey: string, config: ConfigSettings | null): boolean {
  if (!config) return false
  const sensors = SECTION_SENSORS[sectionKey]
  if (!sensors || sensors.length === 0) return false
  return sensors.every(sensor => {
    const isDisabled = config.sensors_enabled[sensor] === false
    if (isDisabled) return true
    const tokenField = SENSOR_TOKEN_FIELD[sensor]
    return tokenField ? !config[tokenField] : false
  })
}

function relativeDate(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** CSS to clamp text to N lines with ellipsis */
const LINE_CLAMP_CSS = `
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
`

/** Platform-specific badge colors for social sources. */
const PLATFORM_COLORS: Record<string, { color: string; bg: string }> = {
  x:        { color: '#000000', bg: 'rgba(0,0,0,0.08)' },
  bluesky:  { color: '#0085FF', bg: 'rgba(0,133,255,0.08)' },
  mastodon: { color: '#6364FF', bg: 'rgba(99,100,255,0.08)' },
  rss_feeds: { color: '#E97B20', bg: 'rgba(233,123,32,0.08)' },
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

function FilterTag({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: '0.6875rem',
        fontWeight: active ? 600 : 400,
        letterSpacing: '0.04em',
        padding: '0.25rem 0.625rem',
        borderRadius: 3,
        border: active ? '1px solid var(--accent-dim)' : '1px solid var(--border)',
        background: active ? 'var(--accent-wash)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--ink-muted)',
        cursor: 'pointer',
        transition: 'all 100ms',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-faint)'
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
      }}
    >
      {label}
    </button>
  )
}

/** Derive the source discussion/post URL for an item, if applicable. */
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

function ItemCard({ item }: { item: IntelItem }) {
  const isArxiv = item.source === 'arxiv'
  const [abstractExpanded, setAbstractExpanded] = useState(false)
  const [contentExpanded, setContentExpanded] = useState(false)

  return (
    <article style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '1.25rem',
      transition: 'box-shadow 150ms, border-color 150ms',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-dim)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
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
        {item.title}
      </a>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <SourceChip source={item.source} label={item.source === 'rss_feeds' ? (item.account ?? undefined) : undefined} />
        {item.verified === false && (
          <span
            title="Link could not be verified"
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
            unverified
          </span>
        )}
        {item.heat && (
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{item.heat}</span>
        )}
        {item.published_at && (
          <>
            <span style={{ color: 'var(--border)', fontSize: '0.75rem' }}>·</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>
              {relativeDate(item.published_at)}
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
              discuss
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
            {item.abstract}
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
              {abstractExpanded ? 'collapse' : 'expand abstract'}
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
            {item.content}
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
            {contentExpanded ? 'collapse' : 'show comments'}
          </button>
        </div>
      )}
    </article>
  )
}

function EmptySection({ needsKey }: { needsKey?: boolean }) {
  return (
    <div style={{
      padding: '4rem 1.5rem',
      textAlign: 'center',
      color: needsKey ? 'var(--warn)' : 'var(--ink-faint)',
      fontSize: '0.875rem',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
    }}>
      {needsKey
        ? 'No items — the sensors for this section need an API key. Configure them on the Connections page.'
        : 'No items in this section yet — run the pipeline to fetch data.'}
    </div>
  )
}

export function Data() {
  const [report, setReport] = useState<IntelReport | null>(null)
  const [config, setConfig] = useState<ConfigSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState(SECTIONS[0].key)
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {})
    api.getLatest().then(r => {
      setReport(r)
      // Default to first section that has items
      const first = SECTIONS.find(s => (r.items[s.key]?.length ?? 0) > 0)
      if (first) setActiveSection(first.key)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Derive the unique sources present in the current section
  const sectionItems = report?.items[activeSection] ?? []
  const availableSources = useMemo(() => {
    const seen = new Set<string>()
    for (const item of sectionItems) seen.add(item.source)
    return [...seen].sort()
  }, [sectionItems])

  // Reset selected sources and page when section changes (select all by default)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSources(new Set(availableSources))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [activeSection, availableSources.join(',')])

  const toggleSource = (src: string) => {
    setSelectedSources(prev => {
      const next = new Set(prev)
      if (next.has(src)) {
        // Don't deselect the last one
        if (next.size === 1) return prev
        next.delete(src)
      } else {
        next.add(src)
      }
      return next
    })
    setPage(1)
  }

  const filteredItems = sectionItems.filter(item => selectedSources.has(item.source))
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE)
  const currentPage = Math.min(page, totalPages || 1)
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const totalItems = Object.values(report?.items ?? {}).reduce((s, a) => s + a.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <style dangerouslySetInnerHTML={{ __html: LINE_CLAMP_CSS }} />

      {/* Page header — not sticky (hidden on mobile — shown in top bar) */}
      <div className="page-padding page-header" style={{ maxWidth: 1024, margin: '0 auto', width: '100%', paddingLeft: '3rem', paddingRight: '3rem' }}>
        <div style={{ paddingTop: '2.5rem', paddingBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            marginBottom: '0.25rem',
          }}>
            Raw Feed
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            {loading ? 'Loading…' : report
              ? `${totalItems} items from ${report.sources_ok.length} sources · ${report.date}`
              : 'Fetched items from all configured sources.'}
          </p>
        </div>
      </div>

      {/* Sticky navigation — tabs + source filters */}
      {report && (
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--canvas)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div className="data-sticky-nav" style={{ maxWidth: 1024, margin: '0 auto', paddingLeft: '3rem', paddingRight: '3rem' }}>
            {/* Section tabs */}
            <div className="section-tabs" style={{
              display: 'flex',
              gap: '0.25rem',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'none',
            }}>
              {SECTIONS.map(({ key, label }, idx) => {
                const count = report.items[key]?.length ?? 0
                const active = activeSection === key
                return (
                  <button
                    key={key}
                    onClick={() => setActiveSection(key)}
                    style={{
                      padding: '0.625rem 1rem',
                      paddingLeft: idx === 0 ? 0 : '1rem',
                      fontSize: '0.8125rem',
                      fontWeight: active ? 600 : 400,
                      color: active ? 'var(--accent)' : 'var(--ink-muted)',
                      background: 'none',
                      border: 'none',
                      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'color 100ms',
                      marginBottom: -1,
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = active ? 'var(--accent)' : 'var(--ink-muted)' }}
                  >
                    {label}
                    {count > 0 && (
                      <span style={{
                        marginLeft: '0.375rem',
                        fontSize: '0.625rem',
                        color: active ? 'var(--accent-dim)' : 'var(--ink-faint)',
                        fontFamily: 'ui-monospace, monospace',
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Source filters */}
            <div className="source-filters" style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              padding: '0.625rem 0',
              borderTop: '1px solid var(--border-soft)',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '0.25rem' }}>
                Source
              </span>
              {availableSources.length === 0 ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>—</span>
              ) : (
                <>
                  {availableSources.map(src => (
                    <FilterTag
                      key={src}
                      label={SOURCE_LABELS[src] ?? src}
                      active={selectedSources.has(src)}
                      onClick={() => toggleSource(src)}
                    />
                  ))}
                  {selectedSources.size < availableSources.length && (
                    <button
                      onClick={() => { setSelectedSources(new Set(availableSources)); setPage(1) }}
                      style={{
                        fontSize: '0.6875rem',
                        color: 'var(--ink-faint)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.25rem 0.375rem',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-faint)' }}
                    >
                      All
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scrollable content — card-per-item feed */}
      <div style={{ flex: 1 }}>
        <div className="data-content" style={{ maxWidth: 1024, margin: '0 auto', padding: '1.5rem 3rem 4rem' }}>
          {!loading && !report ? (
            <div style={{
              padding: '4rem 1.5rem',
              textAlign: 'center',
              color: 'var(--ink-faint)',
              fontSize: '0.875rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              No data available. Trigger a pipeline run from the Status page.
            </div>
          ) : report ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredItems.length === 0
                ? <EmptySection needsKey={sectionNeedsKey(activeSection, config)} />
                : (
                  <>
                    {/* Item range indicator */}
                    {filteredItems.length > PAGE_SIZE && (
                      <div style={{
                        fontSize: '0.75rem',
                        fontFamily: 'ui-monospace, monospace',
                        color: 'var(--ink-faint)',
                        textAlign: 'right',
                      }}>
                        {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
                      </div>
                    )}
                    {pagedItems.map(item => <ItemCard key={item.id} item={item} />)}
                    <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
                  </>
                )
              }
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
