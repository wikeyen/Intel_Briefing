// ABOUTME: Intel data preview page — shows fetched items grouped by section with section tabs.
// ABOUTME: Loads from GET /intel/latest; each item links out to its source URL.
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { IntelReport, IntelItem } from '../api/client'

const SECTIONS: { key: string; label: string }[] = [
  { key: 'tech_trends',  label: 'Tech Trends' },
  { key: 'research',     label: 'Research' },
  { key: 'capital_flow', label: 'Capital Flow' },
  { key: 'products',     label: 'Products' },
  { key: 'community',    label: 'Community' },
  { key: 'insights',     label: 'Insights' },
  { key: 'politics',     label: 'Politics' },
  { key: 'topics',       label: 'Topics' },
]

const SOURCE_LABELS: Record<string, string> = {
  hacker_news:  'HN',
  github:       'GitHub',
  arxiv:        'ArXiv',
  product_hunt: 'PH',
  v2ex:         'V2EX',
  hn_blogs:     'HN Blogs',
  grok:         'Grok',
  sources_36kr: '36Kr',
  wallstreetcn: 'WSCN',
  politics:     'Politics',
  topics:       'Topics',
}

function relativeDate(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function SourceChip({ source }: { source: string }) {
  return (
    <span style={{
      fontSize: '0.625rem',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'var(--ink-faint)',
      background: 'var(--surface-alt)',
      padding: '0.2rem 0.5rem',
      borderRadius: 3,
    }}>
      {SOURCE_LABELS[source] ?? source}
    </span>
  )
}

function ItemCard({ item }: { item: IntelItem }) {
  const [expanded, setExpanded] = useState(false)
  const hasAbstract = !!item.abstract

  return (
    <div style={{
      padding: '1rem 1.25rem',
      borderBottom: '1px solid var(--border-soft)',
      transition: 'background 100ms',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--canvas)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
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
          lineHeight: 1.45,
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
        <SourceChip source={item.source} />
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
        {hasAbstract && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              marginLeft: 'auto',
              fontSize: '0.6875rem',
              color: 'var(--ink-faint)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-faint)' }}
          >
            {expanded ? 'Less ↑' : 'Abstract ↓'}
          </button>
        )}
      </div>

      {/* Abstract */}
      {expanded && item.abstract && (
        <p style={{
          marginTop: '0.75rem',
          fontSize: '0.8125rem',
          color: 'var(--ink-muted)',
          lineHeight: 1.7,
          borderLeft: '2px solid var(--border)',
          paddingLeft: '0.875rem',
        }}>
          {item.abstract}
        </p>
      )}
    </div>
  )
}

function EmptySection() {
  return (
    <div style={{
      padding: '3rem 1.25rem',
      textAlign: 'center',
      color: 'var(--ink-faint)',
      fontSize: '0.875rem',
    }}>
      No items in this section yet — run the pipeline to fetch data.
    </div>
  )
}

export function Data() {
  const [report, setReport] = useState<IntelReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState(SECTIONS[0].key)

  useEffect(() => {
    api.getLatest(50).then(r => {
      setReport(r)
      // Default to first section that has items
      const first = SECTIONS.find(s => (r.items[s.key]?.length ?? 0) > 0)
      if (first) setActiveSection(first.key)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const items = report?.items[activeSection] ?? []
  const totalItems = Object.values(report?.items ?? {}).reduce((s, a) => s + a.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* Sticky header — title row + tab bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'var(--canvas)',
        borderBottom: '1px solid var(--border)',
        paddingLeft: '2rem',
        paddingRight: '2rem',
      }}>
        {/* Title + meta */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.875rem',
          paddingTop: '1rem',
          paddingBottom: '0.625rem',
        }}>
          <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            Intel Data
          </h2>
          {report && (
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace' }}>
              {totalItems} items · {report.date}
            </span>
          )}
          {loading && (
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>Loading…</span>
          )}
        </div>

        {/* Section tabs — horizontal scroll only */}
        {report && (
          <div style={{
            display: 'flex',
            gap: '0.125rem',
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
          }}>
            {SECTIONS.map(({ key, label }) => {
              const count = report.items[key]?.length ?? 0
              const active = activeSection === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveSection(key)}
                  style={{
                    padding: '0.5rem 0.875rem',
                    fontSize: '0.8125rem',
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--ink)' : 'var(--ink-muted)',
                    background: 'none',
                    border: 'none',
                    borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'color 100ms',
                    marginBottom: -1,
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--ink)' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
                >
                  {label}
                  {count > 0 && (
                    <span style={{
                      marginLeft: '0.375rem',
                      fontSize: '0.625rem',
                      color: active ? 'var(--ink-muted)' : 'var(--ink-faint)',
                      fontFamily: 'ui-monospace, monospace',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, padding: '1.5rem 2rem 3rem' }}>
        {!loading && !report ? (
          <div style={{ color: 'var(--ink-faint)', fontSize: '0.875rem' }}>
            No data available. Trigger a pipeline run from the Status page.
          </div>
        ) : report ? (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            {items.length === 0
              ? <EmptySection />
              : items.map(item => <ItemCard key={item.id} item={item} />)
            }
          </div>
        ) : null}
      </div>
    </div>
  )
}
