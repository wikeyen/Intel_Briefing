// ABOUTME: Toggle switch component — on/off boolean control for sensor rows.
// ABOUTME: Extracted from Sensors.tsx for reuse across GroupCard and SensorDragItem.
'use client'

interface ToggleProps {
  on: boolean
  onClick: () => void
}

export function Toggle({ on, onClick }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      style={{
        position: 'relative',
        width: 32,
        height: 18,
        borderRadius: 9,
        border: on ? 'none' : '1.5px solid var(--border)',
        background: on ? 'var(--accent)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 150ms, border-color 150ms',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: on ? 3 : 2,
        left: on ? 17 : 2,
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: on ? 'var(--surface)' : 'var(--ink-faint)',
        transition: 'left 150ms, background 150ms',
        boxShadow: on ? 'var(--shadow-sm)' : 'none',
      }} />
    </button>
  )
}
