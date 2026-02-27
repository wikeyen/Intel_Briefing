// ABOUTME: Draggable sensor row using @dnd-kit/sortable — preserves all sensor controls.
// ABOUTME: Renders drag handle, toggle, label, CN badge, pill inputs, status badge, and group actions.
'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Toggle } from './Toggle'
import { PillInput } from './PillInput'
import { Badge, CnBadge, type SensorStatus } from './SensorBadge'
import { useTranslation } from '@/lib/i18n'

interface SensorDragItemProps {
  sensorKey: string
  sensorLabel: string
  sensorDesc: string
  language: 'cn' | 'row'
  groupId: string
  enabled: boolean
  status: SensorStatus | undefined
  limit: number
  lookbackHours: number | null
  defaultLimit: number
  onToggle: () => void
  onUpdateLimit: (value: number) => void
  onUpdateLookback?: (value: number) => void
  onAddToGroup: () => void
  onRemoveFromGroup: () => void
  isLast: boolean
}

/** 6-dot drag grip icon rendered as CSS dots. */
function DragGrip() {
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

export function SensorDragItem({
  sensorKey,
  sensorLabel,
  sensorDesc,
  language,
  groupId,
  enabled,
  status,
  limit,
  lookbackHours,
  defaultLimit,
  onToggle,
  onUpdateLimit,
  onUpdateLookback,
  onAddToGroup,
  onRemoveFromGroup,
  isLast,
}: SensorDragItemProps) {
  const { t } = useTranslation()
  const sortableId = `${groupId}:${sensorKey}`

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    data: { type: 'sensor', sensorKey, groupId },
  })

  const transformStyle = CSS.Transform.toString(transform)

  return (
    <div
      ref={setNodeRef}
      className="sensor-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0.5rem 0.875rem',
        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
        transition: transition ?? 'background 120ms',
        gap: '0.5rem',
        transform: transformStyle ?? undefined,
        opacity: isDragging ? 0.5 : 1,
        background: isDragging ? 'var(--accent-subtle)' : 'var(--surface)',
        position: 'relative',
        zIndex: isDragging ? 10 : 'auto',
      }}
      onMouseEnter={e => {
        if (!isDragging) (e.currentTarget as HTMLElement).style.background = 'var(--canvas)'
        // Show action buttons on hover
        const actions = e.currentTarget.querySelector('[data-sensor-actions]') as HTMLElement | null
        if (actions) actions.style.opacity = '1'
      }}
      onMouseLeave={e => {
        if (!isDragging) (e.currentTarget as HTMLElement).style.background = 'var(--surface)'
        const actions = e.currentTarget.querySelector('[data-sensor-actions]') as HTMLElement | null
        if (actions) actions.style.opacity = '0'
      }}
    >
      {/* Drag handle */}
      <span className="drag-grip" {...attributes} {...listeners}>
        <DragGrip />
      </span>

      {/* Toggle + label */}
      <div className="sensor-row-left" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 0 }}>
        <Toggle on={enabled} onClick={onToggle} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: enabled ? 'var(--ink)' : 'var(--ink-faint)',
            display: 'flex',
            alignItems: 'center',
          }}>
            {sensorLabel}
            <CnBadge language={language} />
          </div>
          <div className="sensor-row-desc" style={{ fontSize: '0.6875rem', color: 'var(--ink-muted)' }}>
            {t('sensor.desc.' + sensorKey)}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="sensor-row-right" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
        {enabled && (
          <PillInput
            label={t('sources.items')}
            value={limit ?? defaultLimit}
            min={1}
            max={200}
            onChange={onUpdateLimit}
          />
        )}
        {enabled && lookbackHours !== null && onUpdateLookback && (
          <PillInput
            label={t('sources.lookback')}
            value={lookbackHours}
            min={1}
            max={336}
            suffix="h"
            onChange={onUpdateLookback}
          />
        )}
        <Badge status={!enabled ? 'disabled' : status} />
      </div>

      {/* Add/Remove action buttons — visible on hover */}
      <div
        className="sensor-row-actions"
        data-sensor-actions
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          opacity: 0,
          transition: 'opacity 150ms',
          flexShrink: 0,
        }}
      >
        {/* Add to group button */}
        <button
          type="button"
          onClick={onAddToGroup}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: '1px solid var(--accent)',
            background: 'none',
            color: 'var(--accent)',
            fontSize: '0.875rem',
            lineHeight: 1,
            cursor: 'pointer',
            fontWeight: 600,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-subtle)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
          aria-label="Add to group"
        >
          +
        </button>

        {/* Remove from group button */}
        <button
          type="button"
          onClick={onRemoveFromGroup}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'none',
            color: 'var(--ink-muted)',
            fontSize: '0.875rem',
            lineHeight: 1,
            cursor: 'pointer',
            fontWeight: 600,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--err-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--err)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-muted)' }}
          aria-label="Remove from group"
        >
          &times;
        </button>
      </div>
    </div>
  )
}
