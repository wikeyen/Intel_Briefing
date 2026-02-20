// ABOUTME: Canonical sensor-to-section routing and human-readable sensor labels.
// ABOUTME: Single source of truth consumed by the orchestrator, report builder, and UI components.
import type { SectionKey } from '../models'

/** Maps each sensor name to the report section it populates. */
export const SENSOR_SECTION_MAP: Record<string, SectionKey> = {
  hacker_news: 'tech_trends',
  github: 'tech_trends',
  arxiv: 'research',
  hn_blogs: 'insights',
  product_hunt: 'products',
  v2ex: 'community',
  sources_36kr: 'capital_flow',
  wallstreetcn: 'capital_flow',
  social_accounts: 'social',
  social_topics: 'social',
  social_trends: 'social',
  chrome_radar: 'products',
  rss_feeds: 'feeds',
}

/** Human-readable sensor labels for prompts and output. */
export const SENSOR_LABELS: Record<string, string> = {
  hacker_news: 'Hacker News',
  arxiv: 'ArXiv AI',
  github: 'GitHub Trending',
  product_hunt: 'Product Hunt',
  v2ex: 'V2EX',
  hn_blogs: 'HN Blogs',
  sources_36kr: '36Kr',
  wallstreetcn: 'WallStreetCN',
  social_accounts: 'Social Accounts',
  social_topics: 'Social Topics',
  social_trends: 'Social Trends',
  chrome_radar: 'Chrome Radar',
  rss_feeds: 'RSS Feeds',
}
