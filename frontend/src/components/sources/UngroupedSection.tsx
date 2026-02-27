// ABOUTME: Catch-all section for sensors not assigned to any group.
// ABOUTME: Renders with a muted dashed border and helper text encouraging group assignment.
'use client'
import type { ReactNode } from 'react'

interface UngroupedSectionProps {
  sensorKeys: string[]
  renderSensorRow: (sensorKey: string, isLast: boolean) => ReactNode
}

export function UngroupedSection({ sensorKeys, renderSensorRow }: UngroupedSectionProps) {
  if (sensorKeys.length === 0) return null

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.375rem',
      }}>
        <span style={{
          fontSize: '0.625rem',
          fontWeight: 600,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
        }}>
          Ungrouped
        </span>
        <span style={{
          fontSize: '0.5625rem',
          fontFamily: 'ui-monospace, monospace',
          color: 'var(--ink-faint)',
        }}>
          {sensorKeys.length}
        </span>
      </div>

      {/* Card */}
      <div style={{
        borderRadius: 12,
        border: '2px dashed var(--border)',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}>
        {sensorKeys.map((key, i) =>
          renderSensorRow(key, i === sensorKeys.length - 1)
        )}

        {/* Helper text */}
        <div style={{
          padding: '0.625rem 1rem',
          fontSize: '0.6875rem',
          color: 'var(--ink-faint)',
          fontStyle: 'italic',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          Drag sensors to a group to include them in analysis
        </div>
      </div>
    </div>
  )
}
