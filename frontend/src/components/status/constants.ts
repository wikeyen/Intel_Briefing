// ABOUTME: Shared constants for the Status dashboard — derived from taxonomy.
// ABOUTME: Centralizes sensor/section groupings, status metadata, and error truncation config.
import { SENSORS, SENSOR_LABELS } from '@/lib/sensors/taxonomy'

export const ALL_SENSORS = SENSORS.map(s => ({ key: s.key, label: s.label }))

/** Legacy section key for status page sensor grouping. */
type StatusSection = 'general' | 'social' | 'trend' | 'topics' | 'rss'

/** Maps each sensor to its status page section. */
const SENSOR_TO_STATUS_SECTION: Record<string, StatusSection> = {
  hacker_news: 'general',
  github: 'trend',
  arxiv: 'general',
  product_hunt: 'general',
  chrome_radar: 'general',
  hn_blogs: 'general',
  sources_36kr: 'general',
  wallstreetcn: 'general',
  v2ex: 'trend',
  zhihu: 'trend',
  x_accounts: 'social',
  bluesky_accounts: 'social',
  bluesky_topics: 'social',
  mastodon_accounts: 'social',
  mastodon_topics: 'social',
  weibo: 'trend',
  xiaohongshu: 'trend',
  baidu_tieba: 'trend',
  douyin: 'trend',
  toutiao: 'trend',
  netease: 'trend',
  '36kr_trending': 'trend',
  juejin: 'trend',
  baidu: 'trend',
  rss_blogs: 'rss',
  rss_news: 'rss',
}

// Section order and labels for the status page sensor grouping
const STATUS_SECTIONS: Array<{ key: StatusSection; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'social', label: 'Social' },
  { key: 'trend', label: 'Trend' },
  { key: 'topics', label: 'Topics' },
  { key: 'rss', label: 'RSS' },
]

export const SECTION_SENSORS = STATUS_SECTIONS.map(section => ({
  key: section.key,
  label: section.label,
  sensors: SENSORS.filter(s => SENSOR_TO_STATUS_SECTION[s.key] === section.key).map(s => s.key),
}))

export const STATUS_META: Record<string, { color: string; bg: string; labelKey: string }> = {
  ok:      { color: 'var(--ok)',        bg: 'var(--ok-bg)',       labelKey: 'health.ok' },
  stale:   { color: 'var(--warn)',      bg: 'var(--warn-bg)',     labelKey: 'health.stale' },
  no_data: { color: 'var(--ink-faint)', bg: 'var(--surface-alt)', labelKey: 'health.no_data' },
  error:   { color: 'var(--err)',       bg: 'var(--err-bg)',      labelKey: 'health.error' },
}

export const SENSOR_LABEL_MAP: Record<string, string> = { ...SENSOR_LABELS }

export const ERROR_TRUNCATE_LENGTH = 120
