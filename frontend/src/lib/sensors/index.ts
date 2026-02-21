// ABOUTME: Sensor registry mapping sensor names to their fetch functions.
// ABOUTME: Used by the pipeline collector to dynamically invoke enabled sensors.
import type { ConfigSettings, IntelItem } from '../models'
import { fetchV2ex } from './v2ex'
import { fetchHackerNews } from './hacker_news'
import { fetchWallStreetCN } from './wallstreetcn'
import { fetchProductHunt } from './product_hunt'
import { fetchGitHub } from './github'
import { fetchArxiv } from './arxiv'
import { fetch36kr } from './sources_36kr'
import { fetchHnBlogs } from './hn_blogs'
import { fetchSocialAccounts } from './social_accounts'
import { fetchSocialTopics } from './social_topics'
import { fetchSocialTrends } from './social_trends'
import { fetchChromeRadar } from './chrome_radar'
import { fetchRssFeeds } from './rss_feeds'
import { fetchXPosts } from './x_posts'
import { fetchWeibo } from './weibo'
import { fetchZhihu } from './zhihu'
import { fetchXiaohongshu } from './xiaohongshu'

import { SensorConfigError } from './errors'

export type FetchProgressFn = (detail: string) => void
export type SensorFetchFn = (config: ConfigSettings, limit: number, onProgress?: FetchProgressFn) => Promise<IntelItem[]>

export { SENSOR_TOKEN_FIELD } from './constants'

// Platform wrappers for the sensor registry
function fetchX(config: ConfigSettings, limit: number, onProgress?: FetchProgressFn): Promise<IntelItem[]> {
  return fetchXPosts(config, limit, onProgress)
}

async function fetchBluesky(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const items: IntelItem[] = []
  try {
    items.push(...await fetchSocialAccounts(config, limit, 'bluesky'))
  } catch (err) {
    // No accounts configured is fine — topics/trends can still work
    if (!(err instanceof SensorConfigError)) throw err
  }
  if (config.bluesky_topics_enabled) {
    items.push(...await fetchSocialTopics(config, limit, 'bluesky'))
  }
  if (config.bluesky_trends_enabled) {
    items.push(...await fetchSocialTrends(config, limit, 'bluesky'))
  }
  return items
}

async function fetchMastodon(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const items: IntelItem[] = []
  try {
    items.push(...await fetchSocialAccounts(config, limit, 'mastodon'))
  } catch (err) {
    // No accounts configured is fine — topics/trends can still work
    if (!(err instanceof SensorConfigError)) throw err
  }
  if (config.mastodon_topics_enabled) {
    items.push(...await fetchSocialTopics(config, limit, 'mastodon'))
  }
  if (config.mastodon_trends_enabled) {
    items.push(...await fetchSocialTrends(config, limit, 'mastodon'))
  }
  return items
}

export const SENSOR_REGISTRY: Record<string, SensorFetchFn> = {
  hacker_news: fetchHackerNews,
  arxiv: fetchArxiv,
  github: fetchGitHub,
  product_hunt: fetchProductHunt,
  v2ex: fetchV2ex,
  hn_blogs: fetchHnBlogs,
  x: fetchX,
  bluesky: fetchBluesky,
  mastodon: fetchMastodon,
  sources_36kr: fetch36kr,
  wallstreetcn: fetchWallStreetCN,
  chrome_radar: fetchChromeRadar,
  rss_feeds: fetchRssFeeds,
  weibo: fetchWeibo,
  zhihu: fetchZhihu,
  xiaohongshu: fetchXiaohongshu,
}
