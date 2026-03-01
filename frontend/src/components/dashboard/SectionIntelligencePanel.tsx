// ABOUTME: AI insights panel showing intelligence for the active dashboard section.
// ABOUTME: Renders narrative summary, key themes, notable shifts, risk flags, and cross-references.
'use client'

import { useState, useMemo, useCallback } from 'react'
import type { SourceGroupTree } from '@/lib/groups/types'
import type { IntelItem, BriefingSummary, IntelligenceReport, IntelTag } from '@/api/client'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// ---------------------------------------------------------------------------
// Collapse transition CSS
// ---------------------------------------------------------------------------

const COLLAPSE_CSS = `
.section-intel-panel-body {
  overflow: hidden;
  transition: max-height 500ms ease, opacity 400ms ease;
}
.section-intel-panel-body.collapsed {
  max-height: 0 !important;
  opacity: 0;
}
.section-intel-panel-body.expanded {
  opacity: 1;
}
`

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SectionIntelligencePanelProps {
  group: SourceGroupTree
  summary: BriefingSummary | null
  intelligence: IntelligenceReport | null
  items: IntelItem[]
  allGroupItems: Record<string, IntelItem[]>
  allGroups: SourceGroupTree[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build narrative from matching sensor sections in the briefing summary. */
function buildNarrative(summary: BriefingSummary, sensorKeys: string[]): string {
  const matching = summary.sections.filter(s => sensorKeys.includes(s.sensor_name))
  const briefs = matching.map(s => s.brief_summary ?? s.summary).filter(Boolean)
  return briefs.join(' ')
}

/** Extract relevant tags from intelligence data, filtered by group sensors. */
function extractRelevantTags(
  intelligence: IntelligenceReport,
  sensorKeys: string[],
): IntelTag[] {
  const seen = new Set<string>()
  const result: IntelTag[] = []

  const collectTags = (tags: IntelTag[] | undefined) => {
    if (!tags) return
    for (const tag of tags) {
      const key = tag.text.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        result.push(tag)
      }
    }
  }

  // Collect from trend intelligence — filter topics by source overlap with group sensors
  if (intelligence.trend) {
    const relevantTopicTags = intelligence.trend.topics
      .filter(t => t.sources.some(s => sensorKeys.includes(s)))
    if (relevantTopicTags.length > 0 || intelligence.trend.tags.length > 0) {
      collectTags(intelligence.trend.tags)
    }
  }

  // Collect from topic intelligence
  if (intelligence.topics) {
    collectTags(intelligence.topics.tags)
  }

  result.sort((a, b) => b.weight - a.weight)
  return result.slice(0, 12)
}

/** Find items with the largest absolute velocity change. */
function findNotableShifts(items: IntelItem[]): Array<{
  title: string
  changePercent: number | null
  direction: 'up' | 'down' | 'new'
}> {
  const shifts: Array<{
    title: string
    changePercent: number | null
    direction: 'up' | 'down' | 'new'
    absChange: number
  }> = []

  for (const item of items) {
    if (!item.velocity) continue
    const cp = item.velocity.changePercent
    if (cp === null || cp === undefined) {
      shifts.push({ title: item.title, changePercent: null, direction: 'new', absChange: 0 })
    } else if (cp > 0) {
      shifts.push({ title: item.title, changePercent: cp, direction: 'up', absChange: cp })
    } else if (cp < 0) {
      shifts.push({ title: item.title, changePercent: cp, direction: 'down', absChange: Math.abs(cp) })
    }
  }

  // Prioritize up/down by absolute change, then new items
  shifts.sort((a, b) => {
    if (a.direction === 'new' && b.direction !== 'new') return 1
    if (a.direction !== 'new' && b.direction === 'new') return -1
    return b.absChange - a.absChange
  })

  return shifts.slice(0, 3).map(({ title, changePercent, direction }) => ({
    title,
    changePercent,
    direction,
  }))
}

/** Find cross-referenced items appearing in other groups. */
function findCrossReferences(
  groupItems: IntelItem[],
  groupId: string,
  allGroupItems: Record<string, IntelItem[]>,
  allGroups: SourceGroupTree[],
): { count: number; groupNames: string[] } {
  const myUrls = new Set(groupItems.map(i => i.url).filter(Boolean))
  const myIds = new Set(groupItems.map(i => i.id))
  const matchingGroupIds = new Set<string>()

  for (const [gid, gItems] of Object.entries(allGroupItems)) {
    if (gid === groupId) continue
    for (const item of gItems) {
      if (myIds.has(item.id) || (item.url && myUrls.has(item.url))) {
        matchingGroupIds.add(gid)
        break
      }
    }
  }

  const groupNames = allGroups
    .filter(g => matchingGroupIds.has(g.id))
    .map(g => g.name)

  // Count individual cross-referenced items
  let count = 0
  const countedIds = new Set<string>()
  for (const [gid, gItems] of Object.entries(allGroupItems)) {
    if (gid === groupId) continue
    for (const item of gItems) {
      if ((myIds.has(item.id) || (item.url && myUrls.has(item.url))) && !countedIds.has(item.id)) {
        countedIds.add(item.id)
        count++
      }
    }
  }

  return { count, groupNames }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '\u2026'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NarrativeSummary({ text, groupColor }: { text: string; groupColor: string }) {
  return (
    <div style={{
      borderLeft: `2px solid ${groupColor}`,
      paddingLeft: '0.75rem',
    }}>
      <p style={{
        fontSize: '0.8125rem',
        lineHeight: 1.6,
        color: 'var(--ink-secondary)',
        margin: 0,
        fontStyle: 'italic',
      }}>
        {text}
      </p>
    </div>
  )
}

function KeyThemes({ tags, groupColor }: { tags: IntelTag[]; groupColor: string }) {
  if (tags.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <span style={{
        fontFamily: MONO,
        fontSize: '0.5625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: 'var(--ink-tertiary)',
      }}>
        Key Themes
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {tags.map(tag => (
          <span
            key={tag.text}
            style={{
              background: `color-mix(in srgb, ${groupColor} 8%, transparent)`,
              color: 'var(--ink)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: '0.625rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {tag.text}
          </span>
        ))}
      </div>
    </div>
  )
}

function NotableShifts({ shifts }: {
  shifts: Array<{ title: string; changePercent: number | null; direction: 'up' | 'down' | 'new' }>
}) {
  if (shifts.length === 0) return null

  const iconMap = { up: '\u25B2', down: '\u25BC', new: '\u25CF' }
  const colorMap = { up: '#3D9E85', down: '#C4606E', new: 'var(--ink-tertiary)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <span style={{
        fontFamily: MONO,
        fontSize: '0.5625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: 'var(--ink-tertiary)',
      }}>
        Notable Shifts
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {shifts.map((shift, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{ fontSize: '0.5625rem', color: colorMap[shift.direction], flexShrink: 0, lineHeight: 1 }}>
              {iconMap[shift.direction]}
            </span>
            <span style={{
              fontSize: '0.6875rem',
              color: 'var(--ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}>
              {truncate(shift.title, 40)}
            </span>
            {shift.changePercent !== null && (
              <span style={{
                fontFamily: MONO,
                fontSize: '0.5rem',
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 3,
                background: `color-mix(in srgb, ${colorMap[shift.direction]} 12%, transparent)`,
                color: colorMap[shift.direction],
                flexShrink: 0,
              }}>
                {shift.changePercent > 0 ? '+' : ''}{Math.round(shift.changePercent)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function RiskFlags({ riskFlags }: { riskFlags: Array<{ topic: string; analysis: string }> }) {
  if (riskFlags.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <span style={{
        fontFamily: MONO,
        fontSize: '0.5625rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: 'var(--ink-tertiary)',
      }}>
        Risk Flags
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {riskFlags.map((flag, i) => (
          <div
            key={i}
            style={{
              background: 'color-mix(in srgb, var(--warn) 6%, transparent)',
              borderLeft: '2px solid var(--warn)',
              borderRadius: '0 4px 4px 0',
              padding: '0.375rem 0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: 2 }}>
              <span style={{ fontSize: '0.6875rem', lineHeight: 1 }}>{'\u26A0'}</span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink)' }}>
                {flag.topic}
              </span>
            </div>
            <p style={{ fontSize: '0.625rem', color: 'var(--ink-secondary)', margin: 0, lineHeight: 1.5 }}>
              {flag.analysis}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function CrossReferences({ count, groupNames }: { count: number; groupNames: string[] }) {
  if (count === 0 || groupNames.length === 0) return null
  return (
    <p style={{
      fontSize: '0.75rem',
      color: 'var(--ink-tertiary)',
      margin: 0,
      lineHeight: 1.5,
    }}>
      {count} item{count !== 1 ? 's' : ''} also appear{count === 1 ? 's' : ''} in: {groupNames.join(', ')}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SectionIntelligencePanel({
  group,
  summary,
  intelligence,
  items,
  allGroupItems,
  allGroups,
}: SectionIntelligencePanelProps) {
  const [expanded, setExpanded] = useState(true)
  const toggle = useCallback(() => setExpanded(prev => !prev), [])

  const sensorKeys = group.sensors
  const groupColor = group.color

  const narrative = useMemo(() => {
    if (!summary) return ''
    return buildNarrative(summary, sensorKeys)
  }, [summary, sensorKeys])

  const tags = useMemo(() => {
    if (!intelligence) return []
    return extractRelevantTags(intelligence, sensorKeys)
  }, [intelligence, sensorKeys])

  const shifts = useMemo(() => findNotableShifts(items), [items])

  const riskFlags = useMemo(() => {
    if (!summary?.overall?.sentiment?.risk_flags) return []
    return summary.overall.sentiment.risk_flags.map(rf => ({
      topic: rf.topic,
      analysis: rf.analysis,
    }))
  }, [summary])

  const crossRefs = useMemo(
    () => findCrossReferences(items, group.id, allGroupItems, allGroups),
    [items, group.id, allGroupItems, allGroups],
  )

  const hasContent = narrative || tags.length > 0 || shifts.length > 0 || riskFlags.length > 0 || crossRefs.count > 0
  const isEmpty = !intelligence && !summary

  // Estimate max-height for collapse animation — generous upper bound
  const maxHeight = expanded ? 2000 : 0

  return (
    <>
      <style>{COLLAPSE_CSS}</style>
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        borderLeft: `3px solid ${groupColor}`,
        padding: '1.25rem',
        background: 'var(--surface)',
      }}>
        {/* Header row */}
        <div
          onClick={toggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span style={{
            fontFamily: MONO,
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            color: 'var(--ink-tertiary)',
          }}>
            INTELLIGENCE
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--ink-secondary)' }}>
              {group.name}
            </span>
            <span style={{
              fontFamily: MONO,
              fontSize: '0.5625rem',
              fontWeight: 600,
              background: `color-mix(in srgb, ${groupColor} 12%, transparent)`,
              color: groupColor,
              borderRadius: 4,
              padding: '1px 6px',
            }}>
              {items.length}
            </span>
            <span style={{
              fontSize: '0.75rem',
              color: 'var(--ink-tertiary)',
              transition: 'transform 300ms ease',
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              lineHeight: 1,
              display: 'inline-block',
            }}>
              {'\u25BE'}
            </span>
          </div>
        </div>

        {/* Collapsible body */}
        <div
          className={`section-intel-panel-body ${expanded ? 'expanded' : 'collapsed'}`}
          style={{ maxHeight }}
        >
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            paddingTop: '0.75rem',
          }}>
            {isEmpty ? (
              <p style={{
                fontSize: '0.75rem',
                color: 'var(--ink-disabled)',
                margin: 0,
                fontStyle: 'italic',
              }}>
                Intelligence data will appear after the next pipeline run
              </p>
            ) : (
              <>
                {narrative && <NarrativeSummary text={narrative} groupColor={groupColor} />}
                {tags.length > 0 && <KeyThemes tags={tags} groupColor={groupColor} />}
                {shifts.length > 0 && <NotableShifts shifts={shifts} />}
                {riskFlags.length > 0 && <RiskFlags riskFlags={riskFlags} />}
                {crossRefs.count > 0 && (
                  <CrossReferences count={crossRefs.count} groupNames={crossRefs.groupNames} />
                )}
                {hasContent ? null : (
                  <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--ink-disabled)',
                    margin: 0,
                    fontStyle: 'italic',
                  }}>
                    Intelligence data will appear after the next pipeline run
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
