// ABOUTME: Orchestrates the Overview tab with a two-column layout: executive summary (main) and sidebar analytics.
// ABOUTME: Composes ExecutiveSummaryCard and OverviewSidebar into a responsive grid that collapses to single-column on mobile.
'use client'

import { useMemo } from 'react'
import type { BriefingSummary, IntelItem } from '@/api/client'
import type { SourceGroupTree } from '@/lib/groups/types'
import { ExecutiveSummaryCard } from './ExecutiveSummaryCard'
import { OverviewSidebar } from './OverviewSidebar'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OverviewTabProps {
  summary: BriefingSummary | null
  groups: SourceGroupTree[]
  groupItemMap: Record<string, IntelItem[]>
}

// ---------------------------------------------------------------------------
// Layout CSS
// ---------------------------------------------------------------------------

const OVERVIEW_LAYOUT_CSS = `
.overview-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 0.75rem;
  align-items: start;
}
@media (max-width: 768px) {
  .overview-layout {
    grid-template-columns: 1fr;
  }
}
`

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OverviewTab({
  summary,
  groups,
  groupItemMap,
}: OverviewTabProps) {
  const allItems = useMemo(() => {
    return Object.values(groupItemMap).flat()
  }, [groupItemMap])

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => a.sort_order - b.sort_order)
  }, [groups])

  return (
    <>
      <style>{OVERVIEW_LAYOUT_CSS}</style>
      <div className="overview-layout">
        <div className="overview-main">
          <ExecutiveSummaryCard summary={summary} />
        </div>
        <aside className="overview-sidebar">
          <OverviewSidebar items={allItems} groups={sortedGroups} groupItemMap={groupItemMap} />
        </aside>
      </div>
    </>
  )
}
