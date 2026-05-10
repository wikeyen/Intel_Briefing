// ABOUTME: Pipeline activity log drawer — slide-out panel from the right showing pipeline events.
// ABOUTME: Triggered by a button in the sticky header; shows events newest-first with level icons and phase badges.
'use client'

import { useEffect, useRef } from 'react'
import type { PipelineEvent } from '@/api/client'
import { useTranslation } from '@/lib/i18n'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'

interface ActivityLogDrawerProps {
  events: PipelineEvent[]
  open: boolean
  onClose: () => void
}

const LEVEL_STYLES: Record<string, { icon: string; color: string }> = {
  info: { icon: '\u203A', color: 'var(--ink-muted)' },
  ok: { icon: '\u2713', color: 'var(--ok)' },
  warn: { icon: '!', color: 'var(--warn)' },
  error: { icon: '\u2715', color: 'var(--err)' },
}

const PHASE_COLORS: Record<string, string> = {
  fetch: 'var(--accent)',
  retry: 'var(--warn)',
  summary: 'color-mix(in srgb, var(--accent) 70%, var(--ok))',
  intelligence: 'color-mix(in srgb, var(--ink) 60%, var(--accent))',
  system: 'var(--ink-muted)',
}

const DRAWER_CSS = `
@keyframes logDrawerIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@keyframes logDrawerOut {
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
}
@keyframes logBackdropIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes logBackdropOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
`

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

export function ActivityLogDrawer({ events, open, onClose }: ActivityLogDrawerProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Animate out before unmounting
  const handleClose = () => {
    if (closingRef.current) return
    closingRef.current = true
    const panel = panelRef.current
    if (panel) {
      panel.style.animation = 'logDrawerOut 200ms ease forwards'
      const backdrop = panel.previousElementSibling as HTMLElement | null
      if (backdrop) backdrop.style.animation = 'logBackdropOut 200ms ease forwards'
      setTimeout(() => {
        closingRef.current = false
        onClose()
      }, 200)
    } else {
      closingRef.current = false
      onClose()
    }
  }

  // eslint-disable-next-line react-hooks/refs
  if (!open && !closingRef.current) return null

  // Newest events first
  const reversed = [...events].reverse()

  return (
    <>
      {/* Safe: DRAWER_CSS is a hardcoded CSS string constant — no user/external input. */}
      <style dangerouslySetInnerHTML={{ __html: DRAWER_CSS }} />

      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          animation: 'logBackdropIn 200ms ease forwards',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 41,
          width: 480,
          maxWidth: '92vw',
          background: 'var(--canvas)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'logDrawerIn 200ms ease forwards',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--ink-muted)',
            }}>
              {t('log.title')}
            </span>
            <span style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: '0.625rem',
              color: 'var(--ink-faint)',
            }}>
              {events.length}
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--canvas)',
              color: 'var(--ink-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.875rem',
              lineHeight: 1,
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Event list — scrollable */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          {reversed.map((ev, i) => {
            const level = LEVEL_STYLES[ev.level] ?? LEVEL_STYLES.info
            const phaseColor = PHASE_COLORS[ev.phase] ?? 'var(--ink-muted)'
            const sensorLabel = ev.sensor ? (SENSOR_LABELS[ev.sensor] ?? ev.sensor) : null

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  padding: '0.375rem 1rem',
                  borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
                  fontSize: '0.75rem',
                  lineHeight: 1.5,
                }}
              >
                {/* Level icon */}
                <span style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: `1.5px solid ${level.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.5rem',
                  fontWeight: 700,
                  color: level.color,
                  flexShrink: 0,
                  marginTop: 2,
                }}>
                  {level.icon}
                </span>

                {/* Time */}
                <span style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: '0.625rem',
                  color: 'var(--ink-faint)',
                  flexShrink: 0,
                  marginTop: 1,
                  width: 56,
                }}>
                  {formatTime(ev.ts)}
                </span>

                {/* Phase badge */}
                <span style={{
                  fontSize: '0.5625rem',
                  fontWeight: 600,
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                  color: phaseColor,
                  background: `color-mix(in srgb, ${phaseColor} 10%, transparent)`,
                  padding: '0.0625rem 0.3125rem',
                  borderRadius: 3,
                  flexShrink: 0,
                  marginTop: 1,
                  lineHeight: 1.5,
                }}>
                  {t(`log.phase_${ev.phase}`)}
                </span>

                {/* Sensor + message stacked to save horizontal space */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {sensorLabel && (
                    <span style={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      color: 'var(--ink)',
                      marginRight: '0.375rem',
                    }}>
                      {sensorLabel}
                    </span>
                  )}
                  <span style={{
                    color: ev.level === 'error' ? 'var(--err)' : ev.level === 'warn' ? 'var(--warn)' : 'var(--ink-muted)',
                  }}>
                    {ev.message}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
