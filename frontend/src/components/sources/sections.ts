// ABOUTME: Sources page section definitions — maps sensors to 5 UI categories.
// ABOUTME: General, Social Accounts, Trend, Topics, RSS — each with sensor keys and metadata.
import type { SensorDef } from '@/lib/sensors/taxonomy'
import { SENSORS } from '@/lib/sensors/taxonomy'

export type SourceSection = 'general' | 'social' | 'trend' | 'topics' | 'rss'

export interface SectionDef {
  key: SourceSection
  label: string
  sensors: SensorDef[]
}

export const SENSOR_TO_SECTION: Record<string, SourceSection> = {
  hacker_news: 'general',
  github: 'trend',
  arxiv: 'general',
  product_hunt: 'general',
  chrome_radar: 'general',
  hn_blogs: 'general',
  sources_36kr: 'general',
  wallstreetcn: 'general',
  v2ex: 'general',
  zhihu: 'general',
  x: 'social',
  bluesky: 'social',
  mastodon: 'social',
  weibo: 'trend',
  xiaohongshu: 'trend',
  baidu_tieba: 'trend',
  douyin: 'trend',
  toutiao: 'trend',
  netease: 'trend',
  '36kr_trending': 'trend',
  juejin: 'trend',
  baidu: 'trend',
  rss_feeds: 'rss',
  rss_news: 'rss',
}

/** Sensors that should be hidden from the sources page (controlled implicitly). */
export const HIDDEN_SENSORS = new Set(['rss_news'])

export const SOURCE_SECTIONS: SectionDef[] = [
  { key: 'general', label: 'General', sensors: [] },
  { key: 'social', label: 'Social Accounts', sensors: [] },
  { key: 'trend', label: 'Trend', sensors: [] },
  { key: 'topics', label: 'Topics', sensors: [] },
  { key: 'rss', label: 'RSS', sensors: [] },
]

// Populate from taxonomy
for (const sensor of SENSORS) {
  const section = SENSOR_TO_SECTION[sensor.key]
  if (!section) continue
  const def = SOURCE_SECTIONS.find(s => s.key === section)
  if (def) def.sensors.push(sensor)
}

/** Sensors that support lookback hours, with defaults. */
export const SENSOR_LOOKBACK_SUPPORT: Record<string, number> = {
  hacker_news: 24,
  github: 168,
  x: 48,
  bluesky: 48,
  mastodon: 48,
  hn_blogs: 72,
  arxiv: 72,
  wallstreetcn: 24,
  rss_feeds: 72,
}
