// ABOUTME: Tab-driven sectioned dashboard — displays intel items organized by source groups with per-tab filtering.
// ABOUTME: Preserves adaptive polling, auto-refresh, and "briefing updated" detection from the original monolithic dashboard.
'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '@/api/client'
import type {
  IntelReport,
  IntelItem,
  BriefingSummary,
  PipelineStatus,
  SummaryProgress,
  IntelligenceReport,
} from '@/api/client'
import type { SourceGroupTree } from '@/lib/groups/types'
import { useTranslation } from '@/lib/i18n'
import { SectionTabBar } from './dashboard/SectionTabBar'
import { SectionFilterBar, DEFAULT_FILTERS, applyFilters } from './dashboard/SectionFilterBar'
import type { FilterState } from './dashboard/SectionFilterBar'
import { VisualDataStrip } from './dashboard/VisualDataStrip'
import { SectionIntelligencePanel } from './dashboard/SectionIntelligencePanel'
import { ExecutiveSummaryCard } from './dashboard/ExecutiveSummaryCard'
import RichItemCard, { itemSignalScore } from './dashboard/RichItemCard'
import { ItemDetailPanelAnimated } from './dashboard/ItemDetailPanel'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const DASH_CSS = `
@keyframes pulseDot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.dashboard-items-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
@media (max-width: 768px) {
  .dashboard-items-grid {
    grid-template-columns: 1fr;
  }
}
`

// ---------------------------------------------------------------------------
// Sort mode
// ---------------------------------------------------------------------------

type SortMode = 'signal' | 'newest' | 'discussed' | 'velocity'

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'signal', label: 'Signal Score' },
  { key: 'newest', label: 'Newest' },
  { key: 'discussed', label: 'Most Discussed' },
  { key: 'velocity', label: 'Highest Velocity' },
]

function sortItems(items: IntelItem[], mode: SortMode): IntelItem[] {
  const sorted = [...items]
  switch (mode) {
    case 'signal':
      sorted.sort((a, b) => itemSignalScore(b) - itemSignalScore(a))
      break
    case 'newest':
      sorted.sort((a, b) => {
        const ta = a.published_at ? new Date(a.published_at).getTime() : 0
        const tb = b.published_at ? new Date(b.published_at).getTime() : 0
        return tb - ta
      })
      break
    case 'discussed':
      sorted.sort((a, b) => (parseInt(b.heat as string) || 0) - (parseInt(a.heat as string) || 0))
      break
    case 'velocity':
      sorted.sort((a, b) => {
        const va = Math.abs(a.velocity?.changePercent ?? 0)
        const vb = Math.abs(b.velocity?.changePercent ?? 0)
        return vb - va
      })
      break
  }
  return sorted
}

// ---------------------------------------------------------------------------
// Inline sub-components
// ---------------------------------------------------------------------------

/** Skeleton shimmer block. */
function ShimmerBlock({ width, height, style }: {
  width: number | string
  height: number
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: 'linear-gradient(90deg, var(--surface-alt) 25%, var(--border-subtle) 50%, var(--surface-alt) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

/** Loading skeleton shown while initial data is being fetched. */
function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Tab bar skeleton */}
      <div style={{
        display: 'flex',
        gap: '0.25rem',
        padding: '0.5rem 0',
      }}>
        {[120, 100, 90, 110].map((w, i) => (
          <ShimmerBlock key={i} width={w} height={36} style={{ borderRadius: '6px 6px 0 0' }} />
        ))}
      </div>

      {/* Intelligence panel skeleton */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '1.25rem',
        background: 'var(--surface)',
      }}>
        <ShimmerBlock width={100} height={10} />
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ShimmerBlock width="100%" height={10} />
          <ShimmerBlock width="85%" height={10} />
          <ShimmerBlock width="60%" height={10} />
        </div>
      </div>

      {/* Visual data strip skeleton */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '0.75rem',
      }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '0.75rem',
            background: 'var(--surface)',
            height: 120,
          }}>
            <ShimmerBlock width={60} height={9} />
            <ShimmerBlock width="100%" height={50} style={{ marginTop: 12 }} />
          </div>
        ))}
      </div>

      {/* Filter bar skeleton */}
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0' }}>
        <ShimmerBlock width={100} height={28} style={{ borderRadius: 6 }} />
        <ShimmerBlock width={100} height={28} style={{ borderRadius: 6 }} />
        <ShimmerBlock width={80} height={28} style={{ borderRadius: 6 }} />
        <ShimmerBlock width={140} height={28} style={{ borderRadius: 6 }} />
      </div>

      {/* Items grid skeleton */}
      <div className="dashboard-items-grid">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '1rem',
            background: 'var(--surface)',
          }}>
            <ShimmerBlock width="90%" height={14} />
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ShimmerBlock width="100%" height={10} />
              <ShimmerBlock width="75%" height={10} />
              <ShimmerBlock width="60%" height={10} />
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: '0.5rem' }}>
              <ShimmerBlock width={60} height={8} />
              <ShimmerBlock width={40} height={8} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Brief "Briefing updated" flash notification banner. */
function UpdatedBanner() {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.375rem 0.875rem',
        borderRadius: 6,
        background: 'var(--accent-subtle)',
        border: '1px solid var(--accent-muted)',
        marginBottom: 8,
        fontFamily: MONO,
        fontSize: '0.6875rem',
        fontWeight: 500,
        color: 'var(--accent)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
      {t('dash.briefing_updated')}
    </motion.div>
  )
}

/** Row of sort mode buttons. */
function SortControls({ sortMode, onSortChange }: {
  sortMode: SortMode
  onSortChange: (mode: SortMode) => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.25rem',
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontFamily: MONO,
        fontSize: '0.5625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: 'var(--ink-tertiary)',
        marginRight: '0.25rem',
      }}>
        Sort
      </span>
      {SORT_OPTIONS.map(opt => {
        const isActive = opt.key === sortMode
        return (
          <button
            key={opt.key}
            onClick={() => onSortChange(opt.key)}
            style={{
              fontFamily: MONO,
              fontSize: '0.625rem',
              fontWeight: isActive ? 700 : 500,
              padding: '0.25rem 0.5rem',
              borderRadius: 4,
              border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: isActive
                ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                : 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--ink-tertiary)',
              cursor: 'pointer',
              transition: 'background 150ms, color 150ms, border-color 150ms',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = 'var(--surface-alt)'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--ink-secondary)'
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--ink-tertiary)'
              }
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/** Shown when all items are filtered out. */
function FilteredEmptyState() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '3rem 1rem',
      gap: '0.5rem',
    }}>
      <span style={{
        fontSize: '1.5rem',
        lineHeight: 1,
        opacity: 0.4,
      }}>
        {'\u2205'}
      </span>
      <span style={{
        fontFamily: MONO,
        fontSize: '0.75rem',
        fontWeight: 500,
        color: 'var(--ink-tertiary)',
      }}>
        No items match your filters
      </span>
      <span style={{
        fontSize: '0.6875rem',
        color: 'var(--ink-disabled)',
      }}>
        Try broadening the time range or clearing active filters
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a map of group ID -> IntelItem[] from the report and group definitions.
 * Report items are keyed by group ID, so we look up directly.
 * Traverses children so child groups also get their items collected.
 */
function buildGroupItemMap(
  groups: SourceGroupTree[],
  report: IntelReport | null,
): Record<string, IntelItem[]> {
  const map: Record<string, IntelItem[]> = {}

  function collect(group: SourceGroupTree) {
    map[group.id] = report?.items[group.id] ?? []
    for (const child of group.children) {
      collect(child)
    }
  }

  for (const g of groups) {
    collect(g)
  }

  return map
}

/** Flatten all items from a report into a single array (for cross-referencing). */
function flattenAllItems(report: IntelReport | null): IntelItem[] {
  if (!report) return []
  return Object.values(report.items).flat()
}

// ---------------------------------------------------------------------------
// Main Dashboard component
// ---------------------------------------------------------------------------

export function Dashboard() {
  const { t } = useTranslation()

  // ---- Data state (preserved from original) ----
  const [report, setReport] = useState<IntelReport | null>(null)
  const [summary, setSummary] = useState<BriefingSummary | null>(null)
  const [intelligence, setIntelligence] = useState<IntelligenceReport | null>(null)
  const [groups, setGroups] = useState<SourceGroupTree[]>([])
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [summaryProgress, setSummaryProgress] = useState<SummaryProgress | null>(null)
  const [loading, setLoading] = useState(true)

  // ---- Banner state (preserved from original) ----
  const [showUpdatedBanner, setShowUpdatedBanner] = useState(false)
  const lastPipelineCompletedAt = useRef<string | null>(null)
  const lastSummaryAt = useRef<string | null>(null)
  const prevFetchedAtRef = useRef<string | null>(null)

  // ---- New tab-driven state ----
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [filtersByGroup, setFiltersByGroup] = useState<Record<string, FilterState>>({})
  const [selectedItem, setSelectedItem] = useState<IntelItem | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('signal')

  // ---- localStorage tracking (preserved from original) ----
  const markViewed = useCallback((fetchedAt: string) => {
    try { localStorage.setItem('ib:dashboard:lastViewedFetch', fetchedAt) } catch {}
  }, [])

  // ---- "Briefing updated" banner detection (preserved from original) ----
  useEffect(() => {
    if (!report?.fetched_at) return
    const prev = prevFetchedAtRef.current
    prevFetchedAtRef.current = report.fetched_at
    markViewed(report.fetched_at)
    if (prev && prev !== report.fetched_at) setShowUpdatedBanner(true)
  }, [report?.fetched_at, markViewed])

  useEffect(() => {
    if (!showUpdatedBanner) return
    const timer = setTimeout(() => setShowUpdatedBanner(false), 4000)
    return () => clearTimeout(timer)
  }, [showUpdatedBanner])

  // ---- Initial data fetch — 4 parallel calls (preserved from original) ----
  useEffect(() => {
    Promise.all([
      api.getLatest().then(setReport).catch(() => {}),
      api.getSummary().then(r => setSummary(r.summary)).catch(() => {}),
      api.getIntelligence().then(res => setIntelligence(res.intelligence)).catch(() => {}),
      api.getGroups().then(setGroups).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  // ---- Adaptive polling — 2s when active, 15s when idle (preserved from original) ----
  const isActive = !!(summaryProgress?.running) || !!(pipelineStatus?.running && pipelineStatus.alive !== false)

  useEffect(() => {
    const check = () => {
      api.getSummaryStatus().then(s => {
        setSummaryProgress(s)
        if (!s.running && s.completed_at && s.completed_at !== lastSummaryAt.current) {
          lastSummaryAt.current = s.completed_at
          api.getSummary().then(r => setSummary(r.summary)).catch(() => {})
        }
      }).catch(() => {})
      api.getPipelineStatus().then(ps => {
        setPipelineStatus(ps)
        if (!ps.running && ps.completed_at && ps.completed_at !== lastPipelineCompletedAt.current) {
          lastPipelineCompletedAt.current = ps.completed_at
          api.getLatest().then(setReport).catch(() => {})
          api.getSummary().then(r => {
            if (r.summary?.generated_at !== lastSummaryAt.current) {
              lastSummaryAt.current = r.summary?.generated_at ?? null
              setSummary(r.summary)
            }
          }).catch(() => {})
        }
      }).catch(() => {})
    }
    const interval = isActive ? 2_000 : 15_000
    const delay = isActive ? 0 : 3_000
    const timeout = setTimeout(check, delay)
    const iv = setInterval(check, interval)
    return () => { clearTimeout(timeout); clearInterval(iv) }
  }, [isActive])

  // ---- Auto-select first group tab when groups load ----
  useEffect(() => {
    if (groups.length > 0 && activeGroupId === null) {
      const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order)
      setActiveGroupId(sorted[0].id)
    }
  }, [groups, activeGroupId])

  // ---- Computed values ----

  const groupItemMap = useMemo(
    () => buildGroupItemMap(groups, report),
    [groups, report],
  )

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const [gid, items] of Object.entries(groupItemMap)) {
      counts[gid] = items.length
    }
    return counts
  }, [groupItemMap])

  const activeGroup = useMemo(
    () => {
      if (!activeGroupId) return null
      function find(gs: SourceGroupTree[]): SourceGroupTree | null {
        for (const g of gs) {
          if (g.id === activeGroupId) return g
          const child = find(g.children)
          if (child) return child
        }
        return null
      }
      return find(groups)
    },
    [groups, activeGroupId],
  )

  const activeItems = useMemo(
    () => activeGroupId ? (groupItemMap[activeGroupId] ?? []) : [],
    [groupItemMap, activeGroupId],
  )

  const currentFilters = activeGroupId
    ? (filtersByGroup[activeGroupId] ?? DEFAULT_FILTERS)
    : DEFAULT_FILTERS

  const filteredItems = useMemo(
    () => applyFilters(activeItems, currentFilters),
    [activeItems, currentFilters],
  )

  const sortedItems = useMemo(
    () => sortItems(filteredItems, sortMode),
    [filteredItems, sortMode],
  )

  const allItemsFlat = useMemo(
    () => flattenAllItems(report),
    [report],
  )

  const availableSources = useMemo(() => {
    const sources = new Set<string>()
    for (const item of activeItems) {
      sources.add(item.source)
    }
    return [...sources].sort()
  }, [activeItems])

  // ---- Per-tab filter handler ----
  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    if (!activeGroupId) return
    setFiltersByGroup(prev => ({
      ...prev,
      [activeGroupId]: newFilters,
    }))
  }, [activeGroupId])

  // ---- Render ----

  return (
    <div
      className="dashboard-root page-padding"
      style={{ maxWidth: 1360, margin: '0 auto', paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
    >
      <style>{DASH_CSS}</style>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Updated banner */}
          <AnimatePresence>
            {showUpdatedBanner && <UpdatedBanner />}
          </AnimatePresence>

          {/* Executive summary card — global overview above tabs */}
          <ExecutiveSummaryCard summary={summary} />

          {/* Tab bar */}
          <SectionTabBar
            groups={groups}
            activeGroupId={activeGroupId}
            onSelect={setActiveGroupId}
            itemCounts={itemCounts}
            fetchedAt={report?.fetched_at ?? null}
          />

          {/* Active section content */}
          {activeGroup && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
              {/* Intelligence panel */}
              <SectionIntelligencePanel
                group={activeGroup}
                summary={summary}
                intelligence={intelligence}
                items={activeItems}
                allGroupItems={groupItemMap}
                allGroups={groups}
              />

              {/* Visual data strip */}
              <VisualDataStrip
                items={activeItems}
                groupColor={activeGroup.color}
                sensorKeys={activeGroup.sensors}
              />

              {/* Filter bar */}
              <SectionFilterBar
                availableSources={availableSources}
                filters={currentFilters}
                onFiltersChange={handleFiltersChange}
                totalCount={activeItems.length}
                filteredCount={filteredItems.length}
              />

              {/* Sort controls */}
              <SortControls sortMode={sortMode} onSortChange={setSortMode} />

              {/* Item cards grid */}
              <div className="dashboard-items-grid">
                {sortedItems.map(item => (
                  <RichItemCard
                    key={item.id}
                    item={item}
                    groupColor={activeGroup.color}
                    onClick={() => setSelectedItem(item)}
                  />
                ))}
              </div>

              {/* Empty state when filters exclude all items */}
              {sortedItems.length === 0 && <FilteredEmptyState />}
            </div>
          )}

          {/* No groups at all — edge case */}
          {!activeGroup && groups.length === 0 && !loading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4rem 1rem',
              gap: '0.75rem',
            }}>
              <span style={{
                fontFamily: MONO,
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--ink-tertiary)',
              }}>
                No source groups configured
              </span>
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--ink-disabled)',
              }}>
                Create source groups in the Sources page to organize your intel feed
              </span>
            </div>
          )}

          {/* Item detail panel */}
          <ItemDetailPanelAnimated
            open={selectedItem !== null}
            item={selectedItem!}
            group={activeGroup ?? {
              id: '', parent_id: null, name: '', color: '', icon: null,
              sort_order: 0, trend_enabled: false, topic_enabled: false,
              social_enabled: false, sentiment_enabled: false,
              summary_prompt: null, trend_prompt: null, topic_prompt: null,
              social_prompt: null, suppress_keywords: [], boost_keywords: [],
              created_at: '', updated_at: '', sensors: [], children: [],
            }}
            intelligence={intelligence}
            allItems={allItemsFlat}
            allGroups={groups}
            groupItemMap={groupItemMap}
            onClose={() => setSelectedItem(null)}
            onSelectItem={setSelectedItem}
          />
        </>
      )}
    </div>
  )
}
