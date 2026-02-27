// ABOUTME: Shared soft UI style constants for group-based Sources page components.
// ABOUTME: Defines reusable CSSProperties objects for cards, headers, and drop zones.
import type React from 'react'

/** Glassmorphism card container — frosted glass with soft shadow. */
export const GROUP_CARD: React.CSSProperties = {
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
  background: 'var(--glass-bg, rgba(255, 255, 255, 0.6))',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.3))',
  overflow: 'visible',
  position: 'relative',
}

/** Group header row — flex row with center alignment and breathing room. */
export const GROUP_HEADER: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '1rem 1.25rem 1rem 1.5rem',
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

/** Frosted glass pill button for "Add Group" action. */
export const ADD_GROUP_BTN: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.5rem 1rem',
  borderRadius: 999,
  border: '1px solid var(--glass-border, rgba(255,255,255,0.3))',
  background: 'var(--glass-bg, rgba(255,255,255,0.6))',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  color: 'var(--accent)',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
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

/** Frosted processing-type pill badge shown in group headers. */
export const PROCESSING_PILL: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  background: 'var(--glass-pill, rgba(255, 255, 255, 0.5))',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  color: 'var(--ink-muted)',
  padding: '0.125rem 0.5rem',
  borderRadius: 999,
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
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

/** Frosted kebab dropdown menu container. */
export const KEBAB_MENU: React.CSSProperties = {
  position: 'absolute',
  right: '1rem',
  top: '2.5rem',
  background: 'var(--glass-bg, rgba(255,255,255,0.85))',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.3))',
  borderRadius: 10,
  boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
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
