// ABOUTME: Soft UI group card — displays a tinted header, collapsible sensor list, and sub-groups.
// ABOUTME: Supports sub-groups, kebab menu actions, per-sensor inline controls, drag-over highlighting, and group-level drag-to-reorder.
'use client'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SourceGroupTree, UpdateGroupPayload } from '@/lib/groups/types'
import { useTranslation } from '@/lib/i18n'
import {
  GROUP_CARD, GROUP_HEADER, SENSOR_LIST,
  KEBAB_BTN, KEBAB_MENU, KEBAB_MENU_ITEM,
  colorDotStyle,
} from './group-styles'
import { WorkflowSection } from './WorkflowSection'

/** 6-dot drag grip icon rendered as CSS dots — matches the sensor row grip. */
function GroupDragGrip() {
  return (
    <span style={{
      display: 'inline-flex',
      flexDirection: 'column',
      gap: 2,
      cursor: 'grab',
      padding: '0.25rem 0.125rem',
      flexShrink: 0,
    }}>
      {[0, 1, 2].map(row => (
        <span key={row} style={{ display: 'flex', gap: 2 }}>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--ink-faint)' }} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--ink-faint)' }} />
        </span>
      ))}
    </span>
  )
}

interface GroupCardProps {
  group: SourceGroupTree
  enabled: Record<string, boolean>
  statuses: Record<string, 'ok' | 'failed' | 'disabled'>
  sensorLimits: Record<string, number>
  sensorLookback: Record<string, number>
  defaultLimit: number
  defaultLookback: number
  isOver?: boolean
  onToggle: (key: string) => void
  onUpdateLimit: (key: string, value: number) => void
  onUpdateLookback: (key: string, value: number) => void
  hasTopicSensors: boolean
  hasAccountSensors: boolean
  onUpdateGroup: (data: UpdateGroupPayload) => void
  onEditGroup: () => void
  onDeleteGroup: () => void
  onAddSubGroup?: () => void
  renderSensorRow: (sensorKey: string, isLast: boolean) => ReactNode
  renderSubGroup?: (child: SourceGroupTree) => ReactNode
  renderSensorControls?: (sensorKey: string) => ReactNode
}

export function GroupCard({
  group,
  enabled,
  isOver,
  hasTopicSensors,
  hasAccountSensors,
  onUpdateGroup,
  onEditGroup,
  onDeleteGroup,
  onAddSubGroup,
  renderSensorRow,
  renderSubGroup,
  renderSensorControls,
}: GroupCardProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `group:${group.id}`,
    data: { type: 'group', groupId: group.id },
  })

  const transformStyle = CSS.Transform.toString(transform)

  // Close kebab menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const enabledCount = group.sensors.filter(k => enabled[k] ?? true).length

  return (
    <div
      ref={setNodeRef}
      style={{
        ...GROUP_CARD,
        ...(isOver ? { boxShadow: 'var(--shadow-md), inset 0 0 0 2px var(--accent-muted)', background: 'var(--accent-subtle)' } : {}),
        ...(isDragging ? { opacity: 0.5, background: 'var(--accent-subtle)' } : {}),
        transition: transition ?? 'box-shadow 150ms, background 150ms, opacity 150ms',
        transform: transformStyle ?? undefined,
        zIndex: isDragging ? 10 : 'auto',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div style={{
        ...GROUP_HEADER,
        background: `${group.color}14`,
      }}>
        {/* Group drag handle */}
        <span
          className="drag-grip"
          {...attributes}
          {...listeners}
          style={{ display: 'inline-flex', flexShrink: 0 }}
        >
          <GroupDragGrip />
        </span>

        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            borderRadius: 4,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--ink-muted)',
            fontSize: '0.625rem',
            transition: 'transform 200ms ease',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            flexShrink: 0,
            padding: 0,
          }}
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
        >
          ▼
        </button>
        <span style={colorDotStyle(group.color)} />
        <span style={{
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: 'var(--ink)',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {group.name}
        </span>

        {/* Sensor count pill */}
        <span style={{
          fontSize: '0.625rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--ink-muted)',
          background: 'var(--surface-alt)',
          border: '1px solid var(--border-subtle)',
          padding: '0.0625rem 0.375rem',
          borderRadius: 999,
        }}>
          {enabledCount}/{group.sensors.length}
        </span>

        {/* Kebab menu */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            style={KEBAB_BTN}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
            aria-label="Group options"
          >
            &#x22EF;
          </button>
          {menuOpen && (
            <div style={KEBAB_MENU}>
              <button
                type="button"
                style={KEBAB_MENU_ITEM}
                onClick={() => { setMenuOpen(false); onEditGroup() }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              >
                {t('sources.edit_group')}
              </button>
              {onAddSubGroup && (
                <button
                  type="button"
                  style={KEBAB_MENU_ITEM}
                  onClick={() => { setMenuOpen(false); onAddSubGroup() }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-inset)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                >
                  {t('sources.add_subgroup')}
                </button>
              )}
              <button
                type="button"
                style={{ ...KEBAB_MENU_ITEM, color: 'var(--err)' }}
                onClick={() => { setMenuOpen(false); onDeleteGroup() }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--err-bg)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              >
                {t('sources.delete_group')}
              </button>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Workflow configuration */}
          <WorkflowSection
            group={group}
            hasTopicSensors={hasTopicSensors}
            hasAccountSensors={hasAccountSensors}
            onUpdate={onUpdateGroup}
          />

          {/* Sensor list */}
          <div style={SENSOR_LIST}>
            {group.sensors.map((sensorKey, i) => (
              <div key={sensorKey}>
                {renderSensorRow(sensorKey, i === group.sensors.length - 1 && group.children.length === 0)}
                {renderSensorControls && renderSensorControls(sensorKey)}
              </div>
            ))}
          </div>

          {/* Sub-groups */}
          {group.children.length > 0 && renderSubGroup && (
            <div style={{ paddingLeft: '1rem', background: 'var(--canvas)' }}>
              {group.children.map(child => (
                <div key={child.id} style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
                  {renderSubGroup(child)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
