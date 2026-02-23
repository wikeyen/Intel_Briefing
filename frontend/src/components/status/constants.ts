// ABOUTME: Shared constants for the Status dashboard — derived from taxonomy.
// ABOUTME: Centralizes sensor/section groupings, status metadata, and error truncation config.
import { SENSORS, SENSOR_LABELS, ALL_CATEGORIES, CATEGORY_META, sensorsForCategory } from '@/lib/sensors/taxonomy'

export const ALL_SENSORS = SENSORS.map(s => ({ key: s.key, label: s.label }))

export const SECTION_SENSORS = ALL_CATEGORIES.map(cat => ({
  key: cat,
  label: CATEGORY_META[cat].label,
  sensors: sensorsForCategory(cat),
}))

export const STATUS_META: Record<string, { color: string; bg: string; labelKey: string }> = {
  ok:      { color: 'var(--ok)',        bg: 'var(--ok-bg)',       labelKey: 'health.ok' },
  stale:   { color: 'var(--warn)',      bg: 'var(--warn-bg)',     labelKey: 'health.stale' },
  no_data: { color: 'var(--ink-faint)', bg: 'var(--surface-alt)', labelKey: 'health.no_data' },
  error:   { color: 'var(--err)',       bg: 'var(--err-bg)',      labelKey: 'health.error' },
}

export const SENSOR_LABEL_MAP: Record<string, string> = { ...SENSOR_LABELS }

export const ERROR_TRUNCATE_LENGTH = 120
