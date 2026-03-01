// ABOUTME: Slide-out detail panel for a single intel item — shows full content, NLP analysis, velocity, and related items.
// ABOUTME: Opens from the right side when a RichItemCard is clicked; mirrors GroupDetailPanel animation and chrome patterns.
'use client'

import { useEffect, useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { IntelItem, IntelligenceReport } from '@/api/client'
import type { SourceGroupTree } from '@/lib/groups/types'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'
import { formatTimeAgo } from './RichItemCard'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ItemDetailPanelProps {
  item: IntelItem
  group: SourceGroupTree
  intelligence: IntelligenceReport | null
  allItems: IntelItem[]
  allGroups: SourceGroupTree[]
  groupItemMap: Record<string, IntelItem[]>
  onClose: () => void
  onSelectItem: (item: IntelItem) => void
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Section label — monospace uppercase header for panel sections. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: MONO,
      fontSize: '0.6875rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: 'var(--ink-tertiary)',
    }}>
      {children}
    </div>
  )
}

/** Horizontal divider. */
function Divider() {
  return <div style={{ borderBottom: '1px solid var(--border-subtle)', margin: '1rem 0' }} />
}

/** Find related items by shared NLP keywords or entities. */
function findRelatedItems(current: IntelItem, allItems: IntelItem[], max: number): IntelItem[] {
  const currentKeywords = new Set(current.nlp_keywords?.map(k => k.text.toLowerCase()) ?? [])
  const currentEntities = new Set([
    ...(current.nlp_entities?.people ?? []).map(e => e.toLowerCase()),
    ...(current.nlp_entities?.orgs ?? []).map(e => e.toLowerCase()),
    ...(current.nlp_entities?.places ?? []).map(e => e.toLowerCase()),
  ])

  if (currentKeywords.size === 0 && currentEntities.size === 0) return []

  const scored: Array<{ item: IntelItem; overlap: number }> = []

  for (const candidate of allItems) {
    if (candidate.id === current.id) continue

    let overlap = 0

    // Keyword overlap
    if (candidate.nlp_keywords) {
      for (const kw of candidate.nlp_keywords) {
        if (currentKeywords.has(kw.text.toLowerCase())) overlap++
      }
    }

    // Entity overlap
    if (candidate.nlp_entities) {
      for (const person of candidate.nlp_entities.people) {
        if (currentEntities.has(person.toLowerCase())) overlap++
      }
      for (const org of candidate.nlp_entities.orgs) {
        if (currentEntities.has(org.toLowerCase())) overlap++
      }
      for (const place of candidate.nlp_entities.places) {
        if (currentEntities.has(place.toLowerCase())) overlap++
      }
    }

    if (overlap > 0) scored.push({ item: candidate, overlap })
  }

  scored.sort((a, b) => b.overlap - a.overlap)
  return scored.slice(0, max).map(s => s.item)
}

/** Find which other groups contain an item with the same url or id. */
function findCrossSections(
  current: IntelItem,
  allGroups: SourceGroupTree[],
  groupItemMap: Record<string, IntelItem[]>,
  currentGroupId: string,
): SourceGroupTree[] {
  const matches: SourceGroupTree[] = []

  function checkGroup(g: SourceGroupTree) {
    if (g.id === currentGroupId) return
    const items = groupItemMap[g.id] ?? []
    const hasMatch = items.some(i => i.id === current.id || i.url === current.url)
    if (hasMatch) matches.push(g)
    for (const child of g.children) checkGroup(child)
  }

  for (const g of allGroups) checkGroup(g)
  return matches
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** NLP keyword tags. */
function KeywordTags({ keywords, groupColor }: {
  keywords: NonNullable<IntelItem['nlp_keywords']>
  groupColor: string
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.5rem' }}>
      {keywords.map(kw => (
        <span key={kw.text} style={{
          fontFamily: MONO,
          fontSize: '0.5625rem',
          padding: '2px 6px',
          borderRadius: 4,
          background: `color-mix(in srgb, ${groupColor} 8%, var(--surface))`,
          color: 'var(--ink-secondary)',
          fontWeight: 500,
        }}>
          {kw.text}
        </span>
      ))}
    </div>
  )
}

/** NLP entity list for a given category (people, orgs, places). */
function EntityList({ label, entities }: { label: string; entities: string[] }) {
  if (entities.length === 0) return null
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <span style={{
        fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 700,
        color: 'var(--ink-tertiary)', letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
      }}>
        {label}
      </span>
      <div style={{
        fontSize: '0.75rem', color: 'var(--ink-secondary)',
        lineHeight: 1.6, marginTop: '0.25rem',
      }}>
        {entities.join(', ')}
      </div>
    </div>
  )
}

/** Sentiment bar — mini inline visualization of sentiment score. */
function SentimentBar({ sentiment }: { sentiment: NonNullable<IntelItem['sentiment']> }) {
  const isPositive = sentiment.label === 'positive'
  const isNegative = sentiment.label === 'negative'
  const barColor = isPositive ? '#3D9E85' : isNegative ? '#C4606E' : 'var(--ink-tertiary)'
  const widthPct = Math.min(Math.abs(sentiment.score) * 100, 100)

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          fontSize: '0.75rem', color: 'var(--ink-secondary)', fontWeight: 500,
          textTransform: 'capitalize' as const,
        }}>
          {sentiment.label}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: '0.625rem', color: 'var(--ink-tertiary)',
        }}>
          {sentiment.score.toFixed(2)}
        </span>
      </div>
      <div style={{
        height: 4, borderRadius: 2,
        background: 'var(--border-subtle)',
        marginTop: '0.25rem',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${widthPct}%`,
          background: barColor,
          transition: 'width 300ms ease',
        }} />
      </div>
    </div>
  )
}

/** Velocity stat grid — 2x2 layout showing velocity data points. */
function VelocityStats({ velocity }: { velocity: NonNullable<IntelItem['velocity']> }) {
  const stats = [
    { label: 'Previous', value: velocity.previousCount != null ? String(velocity.previousCount) : '\u2014' },
    { label: 'Current', value: String(velocity.currentCount) },
    {
      label: 'Change',
      value: velocity.changePercent != null
        ? `${velocity.changePercent > 0 ? '+' : ''}${Math.round(velocity.changePercent)}%`
        : 'NEW',
    },
    { label: 'On Trend', value: velocity.hoursOnTrend != null ? `${velocity.hoursOnTrend}h` : '\u2014' },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '0.5rem',
      marginTop: '0.5rem',
    }}>
      {stats.map(s => (
        <div key={s.label} style={{
          padding: '0.5rem 0.625rem',
          borderRadius: 6,
          background: 'var(--surface-alt)',
        }}>
          <div style={{
            fontFamily: MONO, fontSize: '0.5625rem', fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase' as const,
            color: 'var(--ink-tertiary)', marginBottom: '0.25rem',
          }}>
            {s.label}
          </div>
          <div style={{
            fontFamily: MONO, fontSize: '0.875rem', fontWeight: 700,
            color: 'var(--ink)',
          }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Clickable related item row. */
function RelatedItemRow({ item, onSelect }: { item: IntelItem; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: '0.375rem 0.5rem',
        margin: '0 -0.5rem',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'background 150ms ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
    >
      <div style={{
        fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink)',
        lineHeight: 1.4,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {item.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span style={{
          fontFamily: MONO, fontSize: '0.5rem', fontWeight: 600,
          padding: '1px 4px', borderRadius: 3,
          background: 'var(--surface-inset)', color: 'var(--ink-disabled)',
          letterSpacing: '0.04em',
        }}>
          {SENSOR_LABELS[item.source] ?? item.source}
        </span>
        {item.published_at && (
          <span style={{ fontFamily: MONO, fontSize: '0.5rem', color: 'var(--ink-disabled)' }}>
            {formatTimeAgo(item.published_at)}
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Raw Data collapsible section
// ---------------------------------------------------------------------------

function RawDataSection({ item }: { item: IntelItem }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.375rem',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontFamily: MONO, fontSize: '0.6875rem', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          color: 'var(--ink-tertiary)',
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 200ms ease',
          fontSize: '0.625rem',
        }}>
          &#9654;
        </span>
        RAW DATA
      </button>
      {expanded && (
        <pre style={{
          fontFamily: MONO,
          fontSize: '0.625rem',
          lineHeight: 1.5,
          background: 'var(--surface-alt)',
          borderRadius: 6,
          padding: '0.75rem',
          overflowX: 'auto',
          marginTop: '0.5rem',
          color: 'var(--ink-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {JSON.stringify(item, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

function ItemDetailPanel({
  item, group, intelligence, allItems, allGroups, groupItemMap, onClose, onSelectItem,
}: ItemDetailPanelProps) {
  const sourceLabel = SENSOR_LABELS[item.source] ?? item.source
  const timeAgo = formatTimeAgo(item.published_at)

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

  const relatedItems = useMemo(
    () => findRelatedItems(item, allItems, 5),
    [item, allItems],
  )

  const crossSections = useMemo(
    () => findCrossSections(item, allGroups, groupItemMap, group.id),
    [item, allGroups, groupItemMap, group.id],
  )

  const hasNlpData = (item.nlp_keywords && item.nlp_keywords.length > 0)
    || (item.nlp_entities && (
      item.nlp_entities.people.length > 0
      || item.nlp_entities.orgs.length > 0
      || item.nlp_entities.places.length > 0
    ))
    || (item.sentiment != null)

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
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0, 0, 0, 0.15)',
        }}
      />

      {/* Panel */}
      <motion.div
        className="slide-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 440, maxWidth: '100vw',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          zIndex: 1000,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Scrollable content */}
        <div style={{
          flex: 1, minHeight: 0,
          overflowY: 'auto', overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch' as never,
          overscrollBehavior: 'contain',
          padding: '1.5rem',
        }}>

          {/* ---- Header ---- */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
            {/* Open link */}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: MONO,
                fontSize: '0.6875rem',
                color: 'var(--accent)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
            >
              Open &rarr;
            </a>

            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', color: 'var(--ink-tertiary)',
                fontSize: '1.125rem', lineHeight: 1, border: 'none', cursor: 'pointer',
                transition: 'background 150ms, color 150ms',
                flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-alt)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              &times;
            </button>
          </div>

          {/* Title */}
          <h2 style={{
            fontSize: '1rem', fontWeight: 600, color: 'var(--ink)',
            lineHeight: 1.4, marginTop: '0.75rem', margin: '0.75rem 0 0 0',
          }}>
            {item.title}
          </h2>

          {/* Metadata row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            marginTop: '0.5rem', flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: MONO, fontSize: '0.6875rem', fontWeight: 600,
              textTransform: 'uppercase' as const, color: 'var(--ink-tertiary)',
              letterSpacing: '0.04em',
            }}>
              {sourceLabel}
            </span>
            {timeAgo && (
              <span style={{ fontSize: '0.6875rem', color: 'var(--ink-tertiary)' }}>
                {timeAgo}
              </span>
            )}
            {item.sentiment && item.sentiment.label !== 'neutral' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: item.sentiment.label === 'positive' ? '#3D9E85' : '#C4606E',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: '0.6875rem', color: 'var(--ink-tertiary)' }}>
                  {item.sentiment.label}
                </span>
              </span>
            )}
          </div>

          {/* Engagement */}
          {(item.heat || (item.authors && item.authors.length > 0)) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              marginTop: '0.375rem',
            }}>
              {item.heat && (
                <span style={{ fontFamily: MONO, fontSize: '0.625rem', color: 'var(--ink-tertiary)' }}>
                  {item.heat} points
                </span>
              )}
              {item.authors && item.authors.length > 0 && (
                <span style={{ fontFamily: MONO, fontSize: '0.625rem', color: 'var(--ink-tertiary)' }}>
                  {item.authors.length} {item.authors.length === 1 ? 'author' : 'authors'}
                </span>
              )}
            </div>
          )}

          {/* ---- Content ---- */}
          <Divider />
          <SectionLabel>CONTENT</SectionLabel>
          <div style={{
            fontSize: '0.8125rem', lineHeight: 1.6, color: 'var(--ink-secondary)',
            marginTop: '0.5rem', whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word', wordBreak: 'break-word',
          }}>
            {item.content || item.title}
          </div>

          {/* ---- AI Analysis ---- */}
          <Divider />
          <SectionLabel>ANALYSIS</SectionLabel>
          {hasNlpData ? (
            <div style={{ marginTop: '0.25rem' }}>
              {item.nlp_keywords && item.nlp_keywords.length > 0 && (
                <KeywordTags keywords={item.nlp_keywords} groupColor={group.color} />
              )}
              {item.nlp_entities && (
                <>
                  <EntityList label="People" entities={item.nlp_entities.people} />
                  <EntityList label="Organizations" entities={item.nlp_entities.orgs} />
                  <EntityList label="Places" entities={item.nlp_entities.places} />
                </>
              )}
              {item.sentiment && <SentimentBar sentiment={item.sentiment} />}
            </div>
          ) : (
            <div style={{
              fontSize: '0.75rem', color: 'var(--ink-disabled)',
              marginTop: '0.5rem', fontStyle: 'italic',
            }}>
              Analysis available after next intelligence run
            </div>
          )}

          {/* ---- Velocity ---- */}
          {item.velocity && (
            <>
              <Divider />
              <SectionLabel>VELOCITY</SectionLabel>
              <VelocityStats velocity={item.velocity} />
            </>
          )}

          {/* ---- Related Items ---- */}
          {relatedItems.length > 0 && (
            <>
              <Divider />
              <SectionLabel>RELATED</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: '0.375rem' }}>
                {relatedItems.map(related => (
                  <RelatedItemRow
                    key={related.id}
                    item={related}
                    onSelect={() => onSelectItem(related)}
                  />
                ))}
              </div>
            </>
          )}

          {/* ---- Cross-Section ---- */}
          {crossSections.length > 0 && (
            <>
              <Divider />
              <SectionLabel>ALSO IN</SectionLabel>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '0.375rem',
                marginTop: '0.5rem',
              }}>
                {crossSections.map(g => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: g.color, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)', fontWeight: 500 }}>
                      {g.name}
                    </span>
                  </div>
                ))}
                <span style={{
                  fontSize: '0.6875rem', color: 'var(--ink-tertiary)', marginTop: '0.25rem',
                }}>
                  This item appears in {crossSections.length} other {crossSections.length === 1 ? 'section' : 'sections'}
                </span>
              </div>
            </>
          )}

          {/* ---- Raw Data (collapsible) ---- */}
          <Divider />
          <RawDataSection item={item} />

        </div>{/* end scrollable content */}
      </motion.div>
    </>
  )
}

/** Wrapper exported with AnimatePresence for controlled mount/unmount. */
export function ItemDetailPanelAnimated(props: ItemDetailPanelProps & { open: boolean }) {
  const { open, ...panelProps } = props
  return (
    <AnimatePresence>
      {open && <ItemDetailPanel {...panelProps} />}
    </AnimatePresence>
  )
}

export default ItemDetailPanel
