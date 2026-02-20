// ABOUTME: Shared constants for the Status dashboard — derived from taxonomy.
// ABOUTME: Centralizes sensor/section groupings, status metadata, and error truncation config.
import { SENSORS, SENSOR_LABELS, ALL_CATEGORIES, CATEGORY_META, sensorsForCategory } from '@/lib/sensors/taxonomy'

export const ALL_SENSORS = SENSORS.map(s => ({ key: s.key, label: s.label }))

export const SECTION_SENSORS = ALL_CATEGORIES.map(cat => ({
  key: cat,
  label: CATEGORY_META[cat].label,
  sensors: sensorsForCategory(cat),
}))

export const STATUS_META: Record<string, { color: string; bg: string; label: string; desc: string }> = {
  ok:      { color: 'var(--ok)',        bg: 'var(--ok-bg)',       label: 'Healthy',  desc: 'Data is fresh and up to date' },
  stale:   { color: 'var(--warn)',      bg: 'var(--warn-bg)',     label: 'Stale',    desc: 'Data is older than the cache TTL' },
  no_data: { color: 'var(--ink-faint)', bg: 'var(--surface-alt)', label: 'No Data',  desc: 'Pipeline has never run' },
  error:   { color: 'var(--err)',       bg: 'var(--err-bg)',      label: 'Error',    desc: 'Could not read pipeline status' },
}

export const SENSOR_LABEL_MAP: Record<string, string> = { ...SENSOR_LABELS }

export const ERROR_TRUNCATE_LENGTH = 120
