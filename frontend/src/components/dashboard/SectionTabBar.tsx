// ABOUTME: Horizontal tab bar for switching between dashboard sections (source groups).
// ABOUTME: Shows group name, item count badge, and freshness indicator for each tab.
'use client'

import type { SourceGroupTree } from '@/lib/groups/types'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** Sentinel ID for the mobile-only overview tab. */
export const OVERVIEW_TAB_ID = '__overview__'

export interface SectionTabBarProps {
  groups: SourceGroupTree[]
  activeGroupId: string | null
  onSelect: (groupId: string) => void
  itemCounts: Record<string, number>
  fetchedAt: string | null
  /** When true, shows a mobile-only "Overview" tab at the start. */
  showOverviewTab?: boolean
}

/** Determine freshness color based on how long ago the data was fetched. */
function freshnessColor(fetchedAt: string | null): string {
  if (!fetchedAt) return 'var(--err)'
  const ageMs = Date.now() - new Date(fetchedAt).getTime()
  const ageHours = ageMs / 3600000
  if (ageHours < 1) return 'var(--ok)'
  if (ageHours < 4) return 'var(--warn)'
  return 'var(--err)'
}

export function SectionTabBar({ groups, activeGroupId, onSelect, itemCounts, fetchedAt, showOverviewTab }: SectionTabBarProps) {
  const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order)
  const dotColor = freshnessColor(fetchedAt)
  const overviewActive = activeGroupId === OVERVIEW_TAB_ID

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.25rem',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
      className="hide-scrollbar"
    >
      {/* Overview tab — shows executive summary content when selected */}
      {showOverviewTab && (
        <button
          onClick={() => onSelect(OVERVIEW_TAB_ID)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            minHeight: 40,
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-badge) var(--radius-badge) 0 0',
            border: 'none',
            borderBottom: overviewActive ? '3px solid var(--accent)' : '3px solid transparent',
            background: overviewActive
              ? 'color-mix(in srgb, var(--accent) 8%, transparent)'
              : 'transparent',
            color: overviewActive ? 'var(--ink)' : 'var(--ink-secondary)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'background 150ms, border-color 150ms, color 150ms',
          }}
          onMouseEnter={e => {
            if (!overviewActive) {
              (e.currentTarget as HTMLElement).style.background =
                'color-mix(in srgb, var(--accent) 8%, transparent)'
            }
          }}
          onMouseLeave={e => {
            if (!overviewActive) {
              (e.currentTarget as HTMLElement).style.background = 'transparent'
            }
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dotColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: MONO,
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
            }}
          >
            Overview
          </span>
        </button>
      )}

      {sorted.map(group => {
        const isActive = group.id === activeGroupId
        const count = itemCounts[group.id] ?? 0

        return (
          <button
            key={group.id}
            onClick={() => onSelect(group.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              minHeight: 40,
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-badge) var(--radius-badge) 0 0',
              border: 'none',
              borderBottom: isActive ? `3px solid ${group.color}` : '3px solid transparent',
              background: isActive
                ? `color-mix(in srgb, ${group.color} 8%, transparent)`
                : 'transparent',
              color: isActive ? 'var(--ink)' : 'var(--ink-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 150ms, border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background =
                  `color-mix(in srgb, ${group.color} 8%, transparent)`
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
              }
            }}
          >
            {/* Freshness dot */}
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: dotColor,
                flexShrink: 0,
              }}
            />

            {/* Group name */}
            <span
              style={{
                fontFamily: MONO,
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
              }}
            >
              {group.name}
            </span>

            {/* Item count badge */}
            <span
              style={{
                fontFamily: MONO,
                fontSize: '0.5625rem',
                fontWeight: 600,
                background: isActive
                  ? `color-mix(in srgb, ${group.color} 16%, transparent)`
                  : 'var(--surface-alt)',
                color: isActive ? group.color : 'var(--ink-faint)',
                borderRadius: 'var(--radius-badge)',
                padding: '1px 5px',
                lineHeight: 1.4,
              }}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
