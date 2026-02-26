// ABOUTME: Shared constants for the Status dashboard — derived from taxonomy.
// ABOUTME: Centralizes sensor/section groupings, status metadata, and error truncation config.
import { SENSORS, SENSOR_LABELS } from '@/lib/sensors/taxonomy'
import { SENSOR_TO_SECTION, type SourceSection } from '../sources/sections'

export const ALL_SENSORS = SENSORS.map(s => ({ key: s.key, label: s.label }))

// Section order and labels matching the Sources page 4-section grouping
const STATUS_SECTIONS: Array<{ key: SourceSection; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'social', label: 'Social' },
  { key: 'trend', label: 'Trend' },
  { key: 'rss', label: 'RSS' },
]

export const SECTION_SENSORS = STATUS_SECTIONS.map(section => ({
  key: section.key,
  label: section.label,
  sensors: SENSORS.filter(s => SENSOR_TO_SECTION[s.key] === section.key).map(s => s.key),
}))

export const STATUS_META: Record<string, { color: string; bg: string; labelKey: string }> = {
  ok:      { color: 'var(--ok)',        bg: 'var(--ok-bg)',       labelKey: 'health.ok' },
  stale:   { color: 'var(--warn)',      bg: 'var(--warn-bg)',     labelKey: 'health.stale' },
  no_data: { color: 'var(--ink-faint)', bg: 'var(--surface-alt)', labelKey: 'health.no_data' },
  error:   { color: 'var(--err)',       bg: 'var(--err-bg)',      labelKey: 'health.error' },
}

export const SENSOR_LABEL_MAP: Record<string, string> = { ...SENSOR_LABELS }

export const ERROR_TRUNCATE_LENGTH = 120
