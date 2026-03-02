// ABOUTME: Orchestrates the full Overview tab layout with aggregate analytics, executive summary, and group snapshots.
// ABOUTME: Composes VisualDataStrip, ExecutiveSummaryCard, and GroupSnapshotCard into a command center landing page.
'use client'

import { useMemo } from 'react'
import type { BriefingSummary, IntelligenceReport, IntelItem, IntelTag } from '@/api/client'
import type { SourceGroupTree } from '@/lib/groups/types'
import { VisualDataStrip } from './VisualDataStrip'
import { ExecutiveSummaryCard } from './ExecutiveSummaryCard'
import { GroupSnapshotCard, SNAPSHOT_GRID_CSS } from './GroupSnapshotCard'
import { extractRelevantTags } from './SectionIntelligencePanel'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OverviewTabProps {
  summary: BriefingSummary | null
  intelligence: IntelligenceReport | null
  groups: SourceGroupTree[]
  groupItemMap: Record<string, IntelItem[]>
  allSensorKeys: string[]
  onSelectGroup: (groupId: string) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the first matching section narrative for a group's sensor keys, truncated to 120 chars. */
function findGroupNarrative(summary: BriefingSummary | null, sensorKeys: string[]): string {
  if (!summary) return ''
  for (const section of summary.sections) {
    if (sensorKeys.includes(section.sensor_name)) {
      const text = section.brief_summary ?? section.summary
      if (text) {
        return text.length > 120 ? text.slice(0, 120).trimEnd() + '\u2026' : text
      }
    }
  }
  return ''
}

/** Extract up to 3 relevant tags for a group's items from intelligence data. */
function findGroupTags(intelligence: IntelligenceReport | null, items: IntelItem[]): IntelTag[] {
  if (!intelligence) return []
  return extractRelevantTags(intelligence, items).slice(0, 3)
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OverviewTab({
  summary,
  intelligence,
  groups,
  groupItemMap,
  allSensorKeys,
  onSelectGroup,
}: OverviewTabProps) {
  const allItems = useMemo(() => {
    return Object.values(groupItemMap).flat()
  }, [groupItemMap])

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => a.sort_order - b.sort_order)
  }, [groups])

  const nonEmptyGroups = useMemo(() => {
    return sortedGroups.filter(g => (groupItemMap[g.id] ?? []).length > 0)
  }, [sortedGroups, groupItemMap])

  const groupMeta = useMemo(() => {
    const meta: Record<string, { narrative: string; tags: IntelTag[] }> = {}
    for (const group of nonEmptyGroups) {
      const items = groupItemMap[group.id] ?? []
      meta[group.id] = {
        narrative: findGroupNarrative(summary, group.sensors),
        tags: findGroupTags(intelligence, items),
      }
    }
    return meta
  }, [nonEmptyGroups, groupItemMap, summary, intelligence])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <style>{SNAPSHOT_GRID_CSS}</style>

      {/* Aggregate analytics strip */}
      {allItems.length > 0 && (
        <VisualDataStrip
          items={allItems}
          groupColor="var(--accent)"
          sensorKeys={allSensorKeys}
        />
      )}

      {/* Executive summary */}
      <ExecutiveSummaryCard summary={summary} />

      {/* Group snapshots */}
      {nonEmptyGroups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{
            fontFamily: MONO,
            fontSize: '0.5625rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            color: 'var(--ink-tertiary)',
          }}>
            Sections
          </span>
          <div className="group-snapshot-grid">
            {nonEmptyGroups.map(group => {
              const meta = groupMeta[group.id]
              return (
                <GroupSnapshotCard
                  key={group.id}
                  group={group}
                  items={groupItemMap[group.id] ?? []}
                  narrative={meta?.narrative ?? ''}
                  tags={meta?.tags ?? []}
                  onClick={() => onSelectGroup(group.id)}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
