// ABOUTME: Shared constants for the Status dashboard — sensor definitions, section groupings, and status metadata.
// ABOUTME: Centralizes ALL_SENSORS, SECTION_SENSORS, STATUS_META, SENSOR_LABEL_MAP, and ERROR_TRUNCATE_LENGTH.

export const ALL_SENSORS = [
  { key: 'hacker_news',     label: 'Hacker News' },
  { key: 'arxiv',           label: 'ArXiv AI' },
  { key: 'github',          label: 'GitHub Trending' },
  { key: 'product_hunt',    label: 'Product Hunt' },
  { key: 'v2ex',            label: 'V2EX' },
  { key: 'hn_blogs',        label: 'HN Blogs' },
  { key: 'sources_36kr',    label: '36Kr' },
  { key: 'wallstreetcn',    label: 'WallStreetCN' },
  { key: 'social_accounts', label: 'Social Accounts' },
  { key: 'social_topics',   label: 'Social Topics' },
  { key: 'social_trends',   label: 'Social Trends' },
  { key: 'chrome_radar',    label: 'Chrome Radar' },
  { key: 'rss_feeds',       label: 'RSS Feeds' },
]

export const SECTION_SENSORS = [
  { key: 'tech_trends',  label: 'Tech Trends',  sensors: ['hacker_news', 'github'] },
  { key: 'research',     label: 'Research',      sensors: ['arxiv'] },
  { key: 'capital_flow', label: 'Capital Flow',  sensors: ['sources_36kr', 'wallstreetcn'] },
  { key: 'products',     label: 'Products',      sensors: ['product_hunt', 'chrome_radar'] },
  { key: 'community',    label: 'Community',     sensors: ['v2ex'] },
  { key: 'social',       label: 'Social',        sensors: ['social_accounts', 'social_topics', 'social_trends'] },
  { key: 'insights',     label: 'Insights',      sensors: ['hn_blogs'] },
  { key: 'feeds',        label: 'Feeds',          sensors: ['rss_feeds'] },
]

export const STATUS_META: Record<string, { color: string; bg: string; label: string; desc: string }> = {
  ok:      { color: 'var(--ok)',        bg: 'var(--ok-bg)',      label: 'Healthy',  desc: 'Data is fresh and up to date' },
  stale:   { color: 'var(--warn)',      bg: 'var(--warn-bg)',    label: 'Stale',    desc: 'Data is older than the cache TTL' },
  no_data: { color: 'var(--ink-faint)', bg: 'var(--surface-alt)',label: 'No Data',  desc: 'Pipeline has never run' },
  error:   { color: 'var(--err)',       bg: 'var(--err-bg)',     label: 'Error',    desc: 'Could not read pipeline status' },
}

export const SENSOR_LABEL_MAP: Record<string, string> = Object.fromEntries(ALL_SENSORS.map(s => [s.key, s.label]))

/** Threshold (chars) above which error messages are truncated with a "more" toggle. */
export const ERROR_TRUNCATE_LENGTH = 120
