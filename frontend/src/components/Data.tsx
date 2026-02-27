// ABOUTME: Intel feed page — shows fetched items grouped by source-group tabs.
// ABOUTME: Card-per-item news reader with source filtering, search, and pagination.
'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { api } from '@/api/client'
import type { IntelReport, IntelItem, ConfigSettings, PipelineStatus } from '@/api/client'
import { SENSOR_TOKEN_FIELD } from '@/lib/sensors/constants'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'
import type { SourceGroupTree } from '@/lib/groups/types'
import { useToast } from '@/lib/toast-context'
import { useTranslation } from '@/lib/i18n'
import { Pagination } from './Pagination'
import { StaleProcessBanner, detectStale } from './StaleProcessBanner'
import { EmptyState } from './EmptyState'
import { ItemCard, LINE_CLAMP_CSS } from './data/ItemCard'
import { FeedSkeleton } from './Skeleton'

const PAGE_SIZE = 20

const SOURCE_LABELS: Record<string, string> = { ...SENSOR_LABELS }

/** Collect all sensor keys for a group, including children. */
function groupSensors(group: SourceGroupTree): Set<string> {
  const sensors = new Set(group.sensors)
  for (const child of group.children) {
    for (const s of child.sensors) sensors.add(s)
  }
  return sensors
}

/** Check if a section is empty because every sensor feeding it lacks a required token. */
function sectionNeedsKey(sectionKey: string, config: ConfigSettings | null, groups: SourceGroupTree[]): boolean {
  if (!config) return false
  const group = groups.find(g => g.id === sectionKey)
  if (!group) return false
  const sensors = [...groupSensors(group)]
  if (sensors.length === 0) return false
  return sensors.every(sensor => {
    const isDisabled = config.sensors_enabled[sensor] === false
    if (isDisabled) return true
    const tokenField = SENSOR_TOKEN_FIELD[sensor]
    return tokenField ? !config[tokenField] : false
  })
}

/** Get the filter key for an item — uses account name for RSS groups, source elsewhere. */
function filterKey(item: IntelItem, section: string, groups: SourceGroupTree[]): string {
  const group = groups.find(g => g.id === section)
  if (group && (group.sensors.includes('rss_feeds') || group.sensors.includes('rss_news')) && item.account) {
    return item.account
  }
  return item.source
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

function EmptySection({ needsKey, t }: { needsKey?: boolean; t: (key: string, params?: Record<string, string>) => string }) {
  return needsKey ? (
    <EmptyState
      illustration="key"
      title={t('feed.no_items_key')}
      action={{ label: t('nav.credentials'), href: '/api-keys' }}
      warn
    />
  ) : (
    <EmptyState
      illustration="stream"
      title={t('feed.no_items')}
      action={{ label: t('nav.status'), href: '/status' }}
    />
  )
}

const contentVariants = {
  enter: (dir: number) => ({ x: dir * 20, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -20, opacity: 0 }),
}

export function Data() {
  const { t } = useTranslation()
  const showToast = useToast()
  const [report, setReport] = useState<IntelReport | null>(null)
  const [config, setConfig] = useState<ConfigSettings | null>(null)
  const [groups, setGroups] = useState<SourceGroupTree[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('')
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Build sections dynamically from groups
  const sections = useMemo(() => {
    if (groups.length === 0) return []
    return groups.map(g => ({ key: g.id, label: g.name, color: g.color }))
  }, [groups])

  // Set initial active section when groups load
  useEffect(() => {
    if (sections.length > 0 && !sections.find(s => s.key === activeSection)) {
      setActiveSection(sections[0].key)
    }
  }, [sections, activeSection])

  const prevSectionIdx = useRef(0)
  const activeSectionIdx = sections.findIndex(s => s.key === activeSection)

  const handleSectionChange = useCallback((key: string) => {
    hasChangedSection.current = true
    prevSectionIdx.current = activeSectionIdx
    setActiveSection(key)
    setSearchQuery('')
    setPage(1)
    // selectedSources resets via availableFilters sync below
  }, [activeSectionIdx])

  const slideDirection = activeSectionIdx >= prevSectionIdx.current ? 1 : -1
  const hasChangedSection = useRef(false)

  useEffect(() => {
    Promise.all([
      api.getConfig().then(setConfig).catch(() => {}),
      api.getLatest().then(setReport).catch(() => {}),
      api.getGroups().then(setGroups).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  // Track last-seen pipeline completion so we can refresh when it finishes
  const lastPipelineCompletedAt = useRef<string | null>(null)

  // Derive whether the pipeline is active — drives polling frequency.
  // Paused pipelines are still active (awaiting user input) and need fast polling.
  const isActive = !!(pipelineStatus?.running && pipelineStatus.alive !== false)

  // Poll pipeline status — fast (2s) when active, slow (15s) when idle.
  // Idle polling detects jobs triggered from other tabs or scheduled runs.
  useEffect(() => {
    const check = () => {
      api.getPipelineStatus().then(ps => {
        setPipelineStatus(ps)
        // When the pipeline completes (from any page), refresh the report
        if (!ps.running && ps.completed_at && ps.completed_at !== lastPipelineCompletedAt.current) {
          lastPipelineCompletedAt.current = ps.completed_at
          api.getLatest().then(setReport).catch(() => {})
        }
      }).catch(() => {})
    }
    // When transitioning from idle→active, fire immediately to get progress.
    // When idle, delay the first check so it doesn't stampede with initial data fetches.
    const interval = isActive ? 2_000 : 15_000
    const delay = isActive ? 0 : 3_000
    const timeout = setTimeout(() => { check() }, delay)
    const iv = setInterval(check, interval)
    return () => { clearTimeout(timeout); clearInterval(iv) }
  }, [isActive])

  // Detect stale processes (running in DB but no in-memory controller)
  const staleInfo = detectStale(null, pipelineStatus)

  const handleAbortStale = async () => {
    try {
      if (staleInfo?.type === 'pipeline') {
        await api.stopPipeline()
      }
    } catch {
      // 404 = already cleared, that's fine
    }
    api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
  }

  const handleResumeStale = async () => {
    await handleAbortStale()
    if (staleInfo?.type === 'pipeline') {
      const mode = staleInfo.fetchComplete ? 'summarize' as const : (pipelineStatus?.mode ?? 'fetch_summarize')
      try {
        await api.triggerFetch(mode)
        showToast(mode === 'summarize' ? 'Resuming summaries' : 'Pipeline resumed')
        api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
      } catch (e) {
        showToast('Failed: ' + (e as Error).message)
      }
    }
  }

  const handleRestartStale = async () => {
    await handleAbortStale()
    if (staleInfo?.type === 'pipeline') {
      try {
        await api.triggerFetch(pipelineStatus?.mode ?? 'fetch_summarize')
        showToast('Pipeline restarted')
        api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
      } catch (e) {
        showToast('Failed: ' + (e as Error).message)
      }
    }
  }

  // Group report items by source group membership
  const groupedItems = useMemo(() => {
    if (!report || groups.length === 0) return null
    const allItems: IntelItem[] = []
    for (const arr of Object.values(report.items)) allItems.push(...arr)

    const result: Record<string, IntelItem[]> = {}
    for (const group of groups) {
      const sensors = groupSensors(group)
      result[group.id] = allItems.filter(i => sensors.has(i.source))
    }
    return result
  }, [report, groups])

  // Active group metadata (for RSS detection in filter labels)
  const activeGroup = groups.find(g => g.id === activeSection)
  const activeHasFeeds = activeGroup?.sensors.includes('rss_feeds') || activeGroup?.sensors.includes('rss_news')

  // Derive the unique filter keys present in the current section
  const sectionItems = groupedItems?.[activeSection] ?? []
  const availableFilters = useMemo(() => {
    const seen = new Set<string>()
    for (const item of sectionItems) seen.add(filterKey(item, activeSection, groups))
    return [...seen].sort()
  }, [sectionItems, activeSection, groups])

  // Select all sources when available filters change (new data or section switch).
  // Uses a ref to detect changes during render — no useEffect needed.
  const prevFiltersKey = useRef('')
  const filtersKey = availableFilters.join(',')
  if (prevFiltersKey.current !== filtersKey) {
    prevFiltersKey.current = filtersKey
    setSelectedSources(new Set(availableFilters))
  }

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

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return sectionItems.filter(item => {
      if (!selectedSources.has(filterKey(item, activeSection, groups))) return false
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        (item.abstract?.toLowerCase().includes(q) ?? false) ||
        (item.content?.toLowerCase().includes(q) ?? false) ||
        (item.account?.toLowerCase().includes(q) ?? false) ||
        (item.topic?.toLowerCase().includes(q) ?? false) ||
        (item.authors?.some(a => a.toLowerCase().includes(q)) ?? false)
      )
    })
  }, [sectionItems, selectedSources, searchQuery, activeSection, groups])
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE)
  const currentPage = Math.min(page, totalPages || 1)
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const totalItems = Object.values(report?.items ?? {}).reduce((s, a) => s + a.length, 0)

  return (
    <div className="data-page-root" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Safe: LINE_CLAMP_CSS is a hardcoded CSS string constant — no user/external input. */}
      <style dangerouslySetInnerHTML={{ __html: LINE_CLAMP_CSS }} />

      {/* Page header — not sticky (hidden on mobile — shown in top bar) */}
      <div className="page-padding page-header" style={{ maxWidth: 1024, margin: '0 auto', width: '100%', paddingLeft: '3rem', paddingRight: '3rem' }}>
        <div style={{ paddingBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            marginBottom: '0.25rem',
          }}>
            {t('feed.title')}
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            {report
              ? t('feed.desc', { count: String(totalItems), sources: String(report.sources_ok.length), date: report.date })
              : loading ? '\u00A0' : t('feed.desc_empty')}
          </p>
        </div>
      </div>

      {/* Sticky navigation — tabs + source filters */}
      {report && (
        <div className="data-sticky-header" style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--canvas)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div className="data-sticky-nav" style={{ maxWidth: 1024, margin: '0 auto', paddingLeft: '3rem', paddingRight: '3rem' }}>
            {/* Section tabs */}
            <LayoutGroup>
            <div className="section-tabs" style={{
              display: 'flex',
              gap: '0.25rem',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollbarWidth: 'none',
            }}>
              {sections.map(({ key, label, color }, idx) => {
                const count = groupedItems?.[key]?.length ?? 0
                const active = activeSection === key
                return (
                  <button
                    key={key}
                    onClick={() => handleSectionChange(key)}
                    style={{
                      position: 'relative',
                      padding: '0.625rem 1rem',
                      paddingLeft: idx === 0 ? 0 : '1rem',
                      fontSize: '0.8125rem',
                      fontWeight: active ? 600 : 400,
                      color: active ? 'var(--accent)' : 'var(--ink-muted)',
                      background: 'none',
                      border: 'none',
                      borderBottom: '2px solid transparent',
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
                        color: active ? 'var(--accent-dim)' : 'var(--ink-faint)',
                        fontFamily: 'ui-monospace, monospace',
                      }}>
                        {count}
                      </span>
                    )}
                    {active && (
                      <motion.div
                        layoutId="tab-indicator"
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: idx === 0 ? 0 : '1rem',
                          right: '1rem',
                          height: 2,
                          background: color,
                          borderRadius: 1,
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
            </LayoutGroup>

            {/* Source filters + search */}
            <div className="source-filters" style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              padding: '0.625rem 0',
              borderTop: '1px solid var(--border-soft)',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '0.25rem' }}>
                {activeHasFeeds ? t('feed.feed') : t('feed.source')}
              </span>
              {availableFilters.length === 0 ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>—</span>
              ) : (
                <>
                  {availableFilters.map(key => (
                    <FilterTag
                      key={key}
                      label={activeHasFeeds ? key : (SOURCE_LABELS[key] ?? key)}
                      active={selectedSources.has(key)}
                      onClick={() => toggleSource(key)}
                    />
                  ))}
                  {selectedSources.size < availableFilters.length && (
                    <button
                      onClick={() => { setSelectedSources(new Set(availableFilters)); setPage(1) }}
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
                      {t('feed.all')}
                    </button>
                  )}
                </>
              )}
              {/* Search input */}
              <div style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0 }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
                  placeholder={t('feed.search')}
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.3rem 0.625rem',
                    paddingRight: searchQuery ? '1.5rem' : '0.625rem',
                    width: searchQuery ? 180 : 100,
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: 'var(--canvas)',
                    color: 'var(--ink)',
                    outline: 'none',
                    transition: 'width 200ms ease, border-color 100ms',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-dim)'; e.currentTarget.style.width = '180px' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; if (!searchQuery) e.currentTarget.style.width = '100px' }}
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setPage(1) }}
                    style={{
                      position: 'absolute',
                      right: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '0.75rem',
                      color: 'var(--ink-faint)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0 0.25rem',
                      lineHeight: 1,
                    }}
                  >
                    &#x2715;
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ flex: 1 }}>
        <div className="data-content" style={{ maxWidth: 1024, margin: '0 auto', padding: '0.75rem 3rem 4rem' }}>
          {staleInfo && (
            <StaleProcessBanner
              stale={staleInfo}
              onAbort={handleAbortStale}
              onResume={handleResumeStale}
              onRestart={handleRestartStale}
            />
          )}
          <AnimatePresence mode="wait" custom={slideDirection}>
            <motion.div
              key={activeSection}
              custom={slideDirection}
              variants={contentVariants}
              initial={hasChangedSection.current ? 'enter' : false}
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.8 }}
            >
          {loading ? (
            <FeedSkeleton />
          ) : !report ? (
            <EmptyState
              illustration="stream"
              title={t('feed.no_data')}
              action={{ label: t('nav.status'), href: '/status' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredItems.length === 0
                ? <EmptySection needsKey={sectionNeedsKey(activeSection, config, groups)} t={t} />
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
                    {pagedItems.map((item, i) => <ItemCard key={item.id} item={item} index={i} searchQuery={searchQuery} />)}
                    <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
                  </>
                )
              }
            </div>
          )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
