// ABOUTME: Shared soft UI style constants for group-based Sources page components.
// ABOUTME: Defines reusable CSSProperties objects for cards, accent bars, headers, and drop zones.
import type React from 'react'

/** Soft card container — 12px radius, medium shadow, surface background. */
export const GROUP_CARD: React.CSSProperties = {
  borderRadius: 12,
  boxShadow: 'var(--shadow-md)',
  background: 'var(--surface)',
  overflow: 'hidden',
  position: 'relative',
}

/** 4px colored accent bar on the left edge of a group card. */
export const ACCENT_BAR: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: 4,
  borderRadius: '4px 0 0 4px',
}

/** Group header row — flex row with center alignment and extra left padding for accent bar. */
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

/** Rounded pill button for "Add Group" action. */
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
}

/** Small color dot used in group headers and pickers. */
export function colorDotStyle(color: string, size = 8): React.CSSProperties {
  return {
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }
}

/** Small processing-type pill badge shown in group headers. */
export const PROCESSING_PILL: React.CSSProperties = {
  fontSize: '0.5625rem',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  background: 'var(--surface-inset)',
  color: 'var(--ink-muted)',
  padding: '0.0625rem 0.375rem',
  borderRadius: 999,
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

/** Kebab dropdown menu container. */
export const KEBAB_MENU: React.CSSProperties = {
  position: 'absolute',
  right: '1rem',
  top: '2.5rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-md)',
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
