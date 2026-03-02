// ABOUTME: Compact executive overview card displayed above the dashboard tab bar.
// ABOUTME: Shows mood badge, executive summary with citations, per-group breakdowns, quick scan bullets, and collapsible risk flags.
'use client'

import { useState, useMemo } from 'react'
import type { BriefingSummary } from '@/api/client'
import type { SourceGroupTree } from '@/lib/groups/types'
import { CitationText } from './CitationText'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const HEADER_STYLE: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: '0.5625rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-tertiary)',
}

const MOOD_COLORS: Record<string, string> = {
  bullish: '#3D9E85',
  bearish: '#C4606E',
  mixed: '#D4A843',
  neutral: 'var(--ink-tertiary)',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExecutiveSummaryCardProps {
  summary: BriefingSummary | null
  groups?: SourceGroupTree[]
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MoodBadge({ mood }: { mood: string }) {
  const color = MOOD_COLORS[mood] ?? MOOD_COLORS.neutral
  return (
    <span style={{
      background: `color-mix(in srgb, ${color} 20%, transparent)`,
      color,
      borderRadius: 'var(--radius-badge)',
      padding: '1px 8px',
      fontFamily: MONO,
      fontSize: '0.5625rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      whiteSpace: 'nowrap',
    }}>
      {mood}
    </span>
  )
}

function QuickScanList({ entries }: { entries: Array<{ text: string; source: string }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={HEADER_STYLE}>
        Quick Scan
      </span>
      <ul style={{
        margin: 0,
        paddingLeft: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}>
        {entries.map((entry, i) => (
          <li key={i} style={{
            fontSize: '0.75rem',
            lineHeight: 1.5,
            color: 'var(--ink-secondary)',
          }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{entry.source}:</span>{' '}
            {entry.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

function RiskFlagsList({ flags }: { flags: Array<{ topic: string; analysis: string }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {flags.map((flag, i) => (
        <div
          key={i}
          style={{
            background: 'color-mix(in srgb, var(--warn) 12%, transparent)',
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
  )
}

// ---------------------------------------------------------------------------
// Per-group section breakdowns
// ---------------------------------------------------------------------------

/** A single sensor's summary matched to a group. */
interface MatchedSensor {
  sensor_name: string
  text: string
  items: { title: string; url: string }[]
}

/** Grouped sensor summaries for one source group. */
interface GroupBreakdown {
  group: SourceGroupTree
  sensors: MatchedSensor[]
}

/** Build per-group breakdowns by matching summary sections to group sensor lists. */
function buildGroupBreakdowns(
  groups: SourceGroupTree[],
  sections: BriefingSummary['sections'],
): GroupBreakdown[] {
  const sectionMap = new Map(sections.map(s => [s.sensor_name, s]))

  return groups
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .reduce<GroupBreakdown[]>((acc, group) => {
      const matched = group.sensors
        .map(sensorKey => {
          const section = sectionMap.get(sensorKey)
          if (!section) return null
          return {
            sensor_name: section.sensor_name,
            text: section.brief_summary ?? section.summary,
            items: section.items.map(item => ({ title: item.title, url: item.url })),
          }
        })
        .filter((s): s is MatchedSensor => s !== null)

      if (matched.length > 0) {
        acc.push({ group, sensors: matched })
      }
      return acc
    }, [])
}

function GroupSectionBreakdowns({ breakdowns }: { breakdowns: GroupBreakdown[] }) {
  if (breakdowns.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
      {breakdowns.map(({ group, sensors }) => (
        <div key={group.id}>
          {/* Group header with colored dot and horizontal rule */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem',
            }}
          >
            <span style={{
              ...HEADER_STYLE,
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              whiteSpace: 'nowrap',
            }}>
              <span
                data-testid={`group-dot-${group.id}`}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: group.color,
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {group.name}
            </span>
            <span style={{
              flex: 1,
              height: 1,
              background: 'var(--border)',
            }} />
          </div>

          {/* Sensor summaries under this group */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sensors.map(sensor => (
              <div key={sensor.sensor_name}>
                <p style={{
                  fontSize: '0.8125rem',
                  lineHeight: 1.6,
                  color: 'var(--ink-secondary)',
                  margin: 0,
                }}>
                  {sensor.text}
                </p>
                {sensor.items.length > 0 && (
                  <div style={{
                    marginTop: '0.25rem',
                    fontSize: '0.6875rem',
                    lineHeight: 1.5,
                  }}>
                    <span style={{
                      ...HEADER_STYLE,
                      fontSize: '0.5rem',
                    }}>
                      Sources:{' '}
                    </span>
                    {sensor.items.map((item, idx) => (
                      <span key={`${sensor.sensor_name}-${idx}`}>
                        {idx > 0 && (
                          <span style={{ color: 'var(--ink-tertiary)', margin: '0 0.25rem' }}>{'\u00B7'}</span>
                        )}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={item.title}
                          style={{
                            color: 'var(--accent)',
                            textDecoration: 'none',
                            fontSize: '0.6875rem',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                        >
                          {item.title}
                        </a>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExecutiveSummaryCard({ summary, groups }: ExecutiveSummaryCardProps) {
  const [riskExpanded, setRiskExpanded] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth > 768 : true
  )

  const groupBreakdowns = useMemo(
    () => (groups && summary) ? buildGroupBreakdowns(groups, summary.sections) : [],
    [groups, summary],
  )

  if (!summary) return null

  const execSummary = summary.overall?.executive_summary
  if (!execSummary || execSummary.trim().length === 0) return null

  const mood = summary.overall.sentiment?.overall_mood ?? 'neutral'
  const quickScan = summary.overall.quick_scan
  const riskFlags = summary.overall.sentiment?.risk_flags
  const sources = summary.overall.sources ?? []

  return (
    <div style={{
      boxShadow: 'var(--shadow-card)',
      borderRadius: 'var(--radius-card)',
      padding: '1.25rem',
      background: 'color-mix(in srgb, var(--accent) 6%, var(--surface))',
      marginBottom: '0.75rem',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.625rem',
      }}>
        <span style={HEADER_STYLE}>
          Executive Summary
        </span>
        <MoodBadge mood={mood} />
      </div>

      {/* Executive summary text with citation links */}
      <p style={{
        fontSize: '0.875rem',
        lineHeight: 1.75,
        color: 'var(--ink)',
        margin: 0,
      }}>
        <CitationText text={execSummary} sources={sources} />
      </p>

      {/* Per-group section breakdowns */}
      <GroupSectionBreakdowns breakdowns={groupBreakdowns} />

      {/* Quick scan bullets */}
      {quickScan && quickScan.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <QuickScanList entries={quickScan} />
        </div>
      )}

      {/* Collapsible risk flags */}
      {riskFlags && riskFlags.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div
            onClick={() => setRiskExpanded(prev => !prev)}
            role="button"
            aria-expanded={riskExpanded}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setRiskExpanded(prev => !prev) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
              marginBottom: riskExpanded ? '0.375rem' : 0,
              transition: 'margin-bottom 300ms ease',
            }}
          >
            <span style={HEADER_STYLE}>Risk Flags</span>
            <span style={{
              fontSize: '0.75rem',
              color: 'var(--ink-tertiary)',
              transition: 'transform 300ms ease',
              transform: riskExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              lineHeight: 1,
              display: 'inline-block',
            }}>
              {'\u25BE'}
            </span>
          </div>
          <div style={{
            overflow: 'hidden',
            maxHeight: riskExpanded ? 2000 : 0,
            opacity: riskExpanded ? 1 : 0,
            transition: 'max-height 500ms ease, opacity 400ms ease',
          }}>
            <RiskFlagsList flags={riskFlags} />
          </div>
        </div>
      )}
    </div>
  )
}
