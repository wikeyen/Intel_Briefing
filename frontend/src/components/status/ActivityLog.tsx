// ABOUTME: Pipeline activity log — scrollable timeline of pipeline events with level icons and phase badges.
// ABOUTME: Auto-scrolls to newest events; collapsible to save vertical space.
'use client'

import { useRef, useEffect, useState } from 'react'
import type { PipelineEvent } from '@/api/client'
import { useTranslation } from '@/lib/i18n'
import { SENSOR_LABELS } from '@/lib/sensors/taxonomy'

interface ActivityLogProps {
  events: PipelineEvent[]
  maxHeight?: number
}

const LEVEL_STYLES: Record<string, { icon: string; color: string }> = {
  info: { icon: '›', color: 'var(--ink-muted)' },
  ok: { icon: '✓', color: 'var(--ok)' },
  warn: { icon: '!', color: 'var(--warn)' },
  error: { icon: '✕', color: 'var(--err)' },
}

const PHASE_COLORS: Record<string, string> = {
  fetch: 'var(--accent)',
  retry: 'var(--warn)',
  summary: 'color-mix(in srgb, var(--accent) 70%, var(--ok))',
  intelligence: 'color-mix(in srgb, var(--ink) 60%, var(--accent))',
  system: 'var(--ink-muted)',
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

export function ActivityLog({ events, maxHeight = 240 }: ActivityLogProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [userScrolled, setUserScrolled] = useState(false)

  // Auto-scroll to bottom when new events arrive (unless user scrolled up)
  useEffect(() => {
    if (userScrolled || collapsed) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events.length, collapsed, userScrolled])

  // Detect when user scrolls away from bottom
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    setUserScrolled(!atBottom)
  }

  if (events.length === 0) return null

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'var(--canvas)',
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.75rem',
          background: 'color-mix(in srgb, var(--ink) 3%, var(--canvas))',
          border: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          cursor: 'pointer',
          color: 'var(--ink)',
        }}
      >
        <span style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--ink-muted)',
        }}>
          {t('log.title')}
          <span style={{
            marginLeft: '0.5rem',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: '0.625rem',
            color: 'var(--ink-faint)',
            fontWeight: 400,
          }}>
            {events.length}
          </span>
        </span>
        <span style={{
          fontSize: '0.75rem',
          color: 'var(--ink-faint)',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
          transition: 'transform 200ms ease',
        }}>
          ▾
        </span>
      </button>

      {/* Event list */}
      {!collapsed && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            maxHeight,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {events.map((ev, i) => {
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
                  padding: '0.3125rem 0.75rem',
                  borderBottom: i < events.length - 1 ? '1px solid color-mix(in srgb, var(--border) 50%, transparent)' : 'none',
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

                {/* Sensor name (if present) */}
                {sensorLabel && (
                  <span style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'var(--ink)',
                    flexShrink: 0,
                  }}>
                    {sensorLabel}
                  </span>
                )}

                {/* Message */}
                <span style={{
                  color: ev.level === 'error' ? 'var(--err)' : ev.level === 'warn' ? 'var(--warn)' : 'var(--ink-muted)',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {ev.message}
                </span>
              </div>
            )
          })}

          {/* Scroll-to-bottom indicator */}
          {userScrolled && (
            <button
              type="button"
              onClick={() => {
                setUserScrolled(false)
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
              }}
              style={{
                position: 'sticky',
                bottom: 0,
                width: '100%',
                padding: '0.25rem',
                background: 'color-mix(in srgb, var(--canvas) 90%, var(--accent))',
                border: 'none',
                borderTop: '1px solid var(--border)',
                fontSize: '0.625rem',
                color: 'var(--accent)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              ↓ {t('log.scroll_bottom')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
