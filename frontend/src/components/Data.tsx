// ABOUTME: Intel feed page — shows fetched items grouped by section with section tabs.
// ABOUTME: Briefing tab shows AI-generated summary; other tabs show card-per-item news reader with source filtering and pagination.
'use client'
import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { api } from '@/api/client'
import type { IntelReport, IntelItem, ConfigSettings, BriefingSummary, SummaryProgress, PipelineStatus } from '@/api/client'
import { SENSOR_TOKEN_FIELD } from '@/lib/sensors/constants'
import { ALL_CATEGORIES, CATEGORY_META, SENSOR_LABELS, sensorsForCategory } from '@/lib/sensors/taxonomy'
import { useToast } from '@/lib/toast-context'
import { Pagination } from './Pagination'
import { StaleProcessBanner, detectStale } from './StaleProcessBanner'
import { ItemCard, LINE_CLAMP_CSS } from './data/ItemCard'
import { BriefingTabContent, PULSE_CSS } from './data/BriefingTab'

const PAGE_SIZE = 20

const SECTIONS: { key: string; label: string }[] = [
  { key: 'briefing', label: 'Briefing' },
  ...ALL_CATEGORIES.map(cat => ({
    key: cat,
    label: CATEGORY_META[cat].label,
  })),
]

const SOURCE_LABELS: Record<string, string> = { ...SENSOR_LABELS }

/** Maps each section to the sensors that feed it. */
const SECTION_SENSORS: Record<string, string[]> = Object.fromEntries(
  ALL_CATEGORIES.map(cat => [cat, sensorsForCategory(cat)])
)

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

/** Get the filter key for an item — uses feed name for feeds section, source elsewhere. */
function filterKey(item: IntelItem, section: string): string {
  if (section === 'feeds' && item.account) return item.account
  return item.source
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
        ? 'No items — the sensors for this section need an API key. Configure them on the Credentials page.'
        : 'No items in this section yet — run the pipeline to fetch data.'}
    </div>
  )
}

const contentVariants = {
  enter: (dir: number) => ({ x: dir * 20, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -20, opacity: 0 }),
}

export function Data() {
  const showToast = useToast()
  const [report, setReport] = useState<IntelReport | null>(null)
  const [config, setConfig] = useState<ConfigSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState(SECTIONS[0].key)
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [summary, setSummary] = useState<BriefingSummary | null>(null)
  const [summaryProgress, setSummaryProgress] = useState<SummaryProgress | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [streamTokens, setStreamTokens] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState('')

  const prevSectionIdx = useRef(0)
  const activeSectionIdx = SECTIONS.findIndex(s => s.key === activeSection)

  const handleSectionChange = useCallback((key: string) => {
    prevSectionIdx.current = activeSectionIdx
    setActiveSection(key)
  }, [activeSectionIdx])

  const slideDirection = activeSectionIdx >= prevSectionIdx.current ? 1 : -1

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {})
    api.getSummary().then(r => setSummary(r.summary)).catch(() => {})
    api.getLatest().then(setReport).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Track last-seen timestamps so we can detect new completions from any source
  const lastSummaryAt = useRef<string | null>(null)
  const lastPipelineCompletedAt = useRef<string | null>(null)

  // Poll summary and pipeline status for live progress
  useEffect(() => {
    const check = () => {
      api.getSummaryStatus().then(s => {
        setSummaryProgress(s)
        if (!s.running && s.completed_at) {
          api.getSummary().then(r => setSummary(r.summary)).catch(() => {})
        }
      }).catch(() => {})
      api.getPipelineStatus().then(ps => {
        setPipelineStatus(ps)
        // When the pipeline completes (from any page), refresh report + summary
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
    check()
    const iv = setInterval(check, 2_000)
    return () => clearInterval(iv)
  }, [])

  // Connect EventSource for streaming tokens during summarization
  const isSummarizing = !!(summaryProgress?.running)
  useEffect(() => {
    if (!isSummarizing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStreamTokens({})
      return
    }

    const es = new EventSource('/api/summary/stream')
    es.addEventListener('token', (e) => {
      try {
        const { sensor, token } = JSON.parse(e.data)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStreamTokens(prev => ({
          ...prev,
          [sensor]: (prev[sensor] ?? '') + token,
        }))
      } catch { /* ignore malformed events */ }
    })
    es.addEventListener('state', (e) => {
      try {
        const { sensor, state } = JSON.parse(e.data)
        // Clear tokens for this sensor when it completes or fails
        if (state === 'ok' || state === 'failed' || state === 'cached') {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setStreamTokens(prev => {
            const next = { ...prev }
            delete next[sensor]
            return next
          })
        }
      } catch { /* ignore malformed events */ }
    })
    es.addEventListener('done', () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStreamTokens({})
      es.close()
    })
    es.addEventListener('idle', () => {
      es.close()
    })
    es.onerror = () => {
      es.close()
    }
    return () => { es.close() }
  }, [isSummarizing])

  const handleTriggerSummary = async () => {
    try {
      await api.triggerSummary()
      // Immediately poll so summaryProgress.running is set without waiting for the 2s interval.
      // This also survives tab switches since the state comes from the server, not local React state.
      const s = await api.getSummaryStatus()
      setSummaryProgress(s)
    } catch (e) {
      showToast('Failed: ' + (e as Error).message)
    }
  }

  const handleStopSummary = async () => {
    try {
      await api.stopSummary()
      showToast('Summary generation stopped')
      const s = await api.getSummaryStatus()
      setSummaryProgress(s)
    } catch {
      // 404 = nothing running, just refresh status
      const s = await api.getSummaryStatus()
      setSummaryProgress(s)
    }
  }

  const handleStopPipeline = async () => {
    try {
      await api.stopPipeline()
      showToast('Pipeline stopped')
    } catch {
      // 404 = nothing running
    }
    refreshStatuses()
  }

  // Detect stale processes (running in DB but no in-memory controller)
  const staleInfo = detectStale(summaryProgress, pipelineStatus)

  const handleAbortStale = async () => {
    try {
      if (staleInfo?.type === 'summary') {
        await api.stopSummary()
      } else if (staleInfo?.type === 'pipeline') {
        await api.stopPipeline()
      }
    } catch {
      // 404 = already cleared, that's fine
    }
    // Refresh both statuses
    api.getSummaryStatus().then(setSummaryProgress).catch(() => {})
    api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
  }

  /** Poll both statuses so the UI picks up the new pipeline immediately. */
  const refreshStatuses = () => {
    api.getPipelineStatus().then(setPipelineStatus).catch(() => {})
    api.getSummaryStatus().then(setSummaryProgress).catch(() => {})
  }

  const handleResumeStale = async () => {
    await handleAbortStale()
    if (staleInfo?.type === 'summary') {
      handleTriggerSummary()
    } else if (staleInfo?.type === 'pipeline') {
      // If fetch was complete, only re-run summaries; otherwise full run
      const mode = staleInfo.fetchComplete ? 'summarize' as const : (pipelineStatus?.mode ?? 'fetch_summarize')
      try {
        await api.triggerFetch(mode)
        showToast(mode === 'summarize' ? 'Resuming summaries' : 'Pipeline resumed')
        refreshStatuses()
      } catch (e) {
        showToast('Failed: ' + (e as Error).message)
      }
    }
  }

  const handleRestartStale = async () => {
    await handleAbortStale()
    if (staleInfo?.type === 'summary') {
      handleTriggerSummary()
    } else if (staleInfo?.type === 'pipeline') {
      try {
        await api.triggerFetch(pipelineStatus?.mode ?? 'fetch_summarize')
        showToast('Pipeline restarted')
        refreshStatuses()
      } catch (e) {
        showToast('Failed: ' + (e as Error).message)
      }
    }
  }

  const hasContent = Object.values(report?.items ?? {}).some(arr => arr.length > 0)

  // Derive the unique filter keys present in the current section
  const sectionItems = report?.items[activeSection] ?? []
  const availableFilters = useMemo(() => {
    const seen = new Set<string>()
    for (const item of sectionItems) seen.add(filterKey(item, activeSection))
    return [...seen].sort()
  }, [sectionItems, activeSection])

  // Reset selected filters, search, and page when section changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedSources(new Set(availableFilters))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchQuery('')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [activeSection, availableFilters.join(',')])

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
      if (!selectedSources.has(filterKey(item, activeSection))) return false
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
  }, [sectionItems, selectedSources, searchQuery, activeSection])
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE)
  const currentPage = Math.min(page, totalPages || 1)
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const totalItems = Object.values(report?.items ?? {}).reduce((s, a) => s + a.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <style dangerouslySetInnerHTML={{ __html: LINE_CLAMP_CSS + PULSE_CSS }} />

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
            Feed
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
              {SECTIONS.map(({ key, label }, idx) => {
                const count = report.items[key]?.length ?? 0
                const active = activeSection === key
                return (
                  <Fragment key={key}>
                    <button
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
                            background: 'var(--accent)',
                            borderRadius: 1,
                          }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      )}
                    </button>
                    {idx === 0 && (
                      <div style={{
                        width: 1,
                        height: 16,
                        background: 'var(--border)',
                        alignSelf: 'center',
                        flexShrink: 0,
                        margin: '0 0.375rem',
                      }} />
                    )}
                  </Fragment>
                )
              })}
            </div>
            </LayoutGroup>

            {/* Source filters (non-briefing tabs) + search (all tabs) */}
            <div className="source-filters" style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              padding: '0.625rem 0',
              borderTop: '1px solid var(--border-soft)',
              flexWrap: 'wrap',
            }}>
              {activeSection !== 'briefing' && (
                <>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '0.25rem' }}>
                    {activeSection === 'feeds' ? 'Feed' : 'Source'}
                  </span>
                  {availableFilters.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>—</span>
                  ) : (
                    <>
                      {availableFilters.map(key => (
                        <FilterTag
                          key={key}
                          label={activeSection === 'feeds' ? key : (SOURCE_LABELS[key] ?? key)}
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
                          All
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
              {/* Search input */}
              <div style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0 }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
                  placeholder="Search…"
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
        <div className="data-content" style={{ maxWidth: 1024, margin: '0 auto', padding: '1.5rem 3rem 4rem' }}>
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
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.8 }}
            >
          {activeSection === 'briefing' ? (
            <BriefingTabContent
              summary={summary}
              summaryProgress={summaryProgress}
              pipelineStatus={pipelineStatus}
              config={config}
              hasContent={hasContent}
              onTrigger={handleTriggerSummary}
              onStop={handleStopSummary}
              onStopPipeline={handleStopPipeline}
              streamTokens={streamTokens}
              searchQuery={searchQuery}
            />
          ) : !loading && !report ? (
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
                    {pagedItems.map((item, i) => <ItemCard key={item.id} item={item} index={i} />)}
                    <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
                  </>
                )
              }
            </div>
          ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
