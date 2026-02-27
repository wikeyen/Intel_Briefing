// ABOUTME: Status badge, language badge, and category badge for sensor rows.
// ABOUTME: Extracted from Sensors.tsx for reuse across GroupCard and SensorDragItem.
'use client'
import { useTranslation } from '@/lib/i18n'
import type { CategoryKey } from '@/lib/sensors/taxonomy'

export type SensorStatus = 'ok' | 'failed' | 'disabled'

/** Color palette for category badges — muted tones to avoid visual noise. */
const CATEGORY_COLORS: Record<CategoryKey, { bg: string; color: string }> = {
  tech:      { bg: '#dbeafe', color: '#1e40af' },
  research:  { bg: '#ede9fe', color: '#5b21b6' },
  finance:   { bg: '#fef3c7', color: '#92400e' },
  products:  { bg: '#d1fae5', color: '#065f46' },
  community: { bg: '#ffedd5', color: '#9a3412' },
  social:    { bg: '#fce7f3', color: '#9d174d' },
  trend:     { bg: '#ccfbf1', color: '#115e59' },
  insights:  { bg: '#e0e7ff', color: '#3730a3' },
  feeds:     { bg: '#f3f4f6', color: '#4b5563' },
}

/** Category pill badge — shows sensor category on all sensor rows. */
export function CategoryBadge({ category }: { category: CategoryKey }) {
  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.tech
  return (
    <span style={{
      fontSize: '0.5625rem',
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      background: colors.bg,
      color: colors.color,
      padding: '0.0625rem 0.375rem',
      borderRadius: 999,
      marginLeft: '0.375rem',
      whiteSpace: 'nowrap',
    }}>
      {category}
    </span>
  )
}

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
