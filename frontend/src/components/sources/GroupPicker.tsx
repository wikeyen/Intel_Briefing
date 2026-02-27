// ABOUTME: Dropdown picker for adding/removing a sensor from groups.
// ABOUTME: Shows all groups with color dots and checkboxes — click toggles membership.
'use client'
import { useEffect, useRef } from 'react'
import type { SourceGroupTree } from '@/lib/groups/types'
import { colorDotStyle } from './group-styles'

interface GroupPickerProps {
  groups: SourceGroupTree[]
  memberOf: Set<string>
  onToggle: (groupId: string) => void
  onClose: () => void
}

export function GroupPicker({ groups, memberOf, onToggle, onClose }: GroupPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        right: 0,
        top: '100%',
        marginTop: 4,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-md)',
        padding: '0.25rem 0',
        zIndex: 30,
        minWidth: 180,
        maxHeight: 240,
        overflowY: 'auto',
      }}
    >
      {groups.length === 0 && (
        <div style={{
          padding: '0.5rem 0.75rem',
          fontSize: '0.75rem',
          color: 'var(--ink-muted)',
          fontStyle: 'italic',
        }}>
          No groups available
        </div>
      )}

      {groups.map(group => {
        const isMember = memberOf.has(group.id)
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onToggle(group.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              color: 'var(--ink)',
              textAlign: 'left',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            {/* Checkbox */}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              borderRadius: 3,
              border: isMember ? 'none' : '1.5px solid var(--border-strong)',
              background: isMember ? 'var(--accent)' : 'transparent',
              flexShrink: 0,
              transition: 'background 120ms',
            }}>
              {isMember && (
                <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 5l2 2 4-4" />
                </svg>
              )}
            </span>

            {/* Color dot */}
            <span style={colorDotStyle(group.color, 8)} />

            {/* Group name */}
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {group.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
