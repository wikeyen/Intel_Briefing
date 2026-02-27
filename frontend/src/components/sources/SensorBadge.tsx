// ABOUTME: Status badge and language badge for sensor rows.
// ABOUTME: Extracted from Sensors.tsx for reuse across GroupCard and SensorDragItem.
'use client'
import { useTranslation } from '@/lib/i18n'

export type SensorStatus = 'ok' | 'failed' | 'disabled'

/** Status badge (ok / failed / disabled) shown on sensor rows. */
export function Badge({ status }: { status: SensorStatus | undefined }) {
  const { t } = useTranslation()
  if (!status) return null
  const map: Record<string, { bg: string; color: string; label: string }> = {
    ok:       { bg: 'var(--ok-bg)',       color: 'var(--ok)',        label: t('sources.badge_ok') },
    failed:   { bg: 'var(--err-bg)',      color: 'var(--err)',       label: t('sources.badge_failed') },
    disabled: { bg: 'var(--surface-alt)', color: 'var(--ink-faint)', label: t('sources.badge_off') },
  }
  const s = map[status]
  return (
    <span style={{
      fontSize: '0.625rem',
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      background: s.bg,
      color: s.color,
      padding: '0.125rem 0.5rem',
      borderRadius: 999,
    }}>
      {s.label}
    </span>
  )
}

/** CN language badge — yellow pill for Chinese-language sensors. */
export function CnBadge({ language }: { language: 'cn' | 'row' }) {
  if (language === 'row') return null
  return (
    <span style={{
      fontSize: '0.5625rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      background: '#ffe066',
      color: '#c8102e',
      padding: '0.0625rem 0.375rem',
      borderRadius: 999,
      marginLeft: '0.375rem',
    }}>
      CN
    </span>
  )
}
