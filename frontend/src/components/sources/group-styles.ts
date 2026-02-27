// ABOUTME: Shared style constants for group-based Sources page components.
// ABOUTME: Defines reusable CSSProperties objects for cards, headers, and drop zones — matches Dashboard flat style.
import type React from 'react'

/** Card container — flat solid style matching Dashboard DashCard. */
export const GROUP_CARD: React.CSSProperties = {
  borderRadius: 8,
  boxShadow: 'var(--shadow-card)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  overflow: 'visible',
  position: 'relative',
  transition: 'box-shadow 200ms, border-color 200ms',
}

/** Group header row — flex row with center alignment and breathing room. */
export const GROUP_HEADER: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.75rem 1rem 0.75rem 1.25rem',
}

/** Vertical sensor list inside a group card — no gap, borders handle separation. */
export const SENSOR_LIST: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

/** Active drop zone highlight during drag-over. */
export const DROP_ZONE_ACTIVE: React.CSSProperties = {
  background: 'var(--accent-subtle)',
  border: '2px dashed var(--accent-muted)',
  borderRadius: 8,
}

/** Pill button for "Add Group" action — matches Dashboard flat style. */
export const ADD_GROUP_BTN: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.5rem 1rem',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--accent)',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: 'var(--shadow-card)',
  transition: 'box-shadow 150ms ease, background 150ms ease',
}

/** Color dot with glow ring used in group headers and pickers. */
export function colorDotStyle(color: string, size = 10): React.CSSProperties {
  return {
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
    boxShadow: `0 0 0 3px ${color}33`,
  }
}

/** Kebab menu button (three dots). */
export const KEBAB_BTN: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: 'var(--ink-muted)',
  fontSize: '1rem',
  lineHeight: 1,
  flexShrink: 0,
}

/** Kebab dropdown menu container — solid surface with elevation shadow. */
export const KEBAB_MENU: React.CSSProperties = {
  position: 'absolute',
  right: '1rem',
  top: '2.5rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-lg)',
  padding: '0.25rem 0',
  zIndex: 20,
  minWidth: 140,
}

/** Individual kebab menu item. */
export const KEBAB_MENU_ITEM: React.CSSProperties = {
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
}
