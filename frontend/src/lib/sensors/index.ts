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
import { fetchRssFeeds, fetchRssNews } from './rss_feeds'
import { fetchXPosts } from './x_posts'
import { fetchWeibo } from './weibo'
import { fetchZhihu } from './zhihu'
import { fetchXiaohongshu } from './xiaohongshu'
import { fetchBaiduTieba } from './baidu_tieba'
import { fetchDouyin } from './douyin'
import { fetchToutiao } from './toutiao'
import { fetchNetease } from './netease'
import { fetchKrTrending } from './kr_trending'
import { fetchJuejin } from './juejin'
import { fetchBaidu } from './baidu'

export type FetchProgressFn = (detail: string, itemCount?: number) => void
export type SubItemProgressFn = (key: string, state: 'queued' | 'running' | 'ok' | 'failed', itemCount?: number, error?: string) => void
export type SensorFetchFn = (config: ConfigSettings, limit: number, onProgress?: FetchProgressFn, onSubItemProgress?: SubItemProgressFn) => Promise<IntelItem[]>

export { SENSOR_TOKEN_FIELD } from './constants'

async function fetchMastodonTrends(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.mastodon_trends_enabled) return []
  return fetchSocialTrends(config, limit, 'mastodon')
}

export const SENSOR_REGISTRY: Record<string, SensorFetchFn> = {
  hacker_news: fetchHackerNews,
  arxiv: fetchArxiv,
  github: fetchGitHub,
  product_hunt: fetchProductHunt,
  v2ex: fetchV2ex,
  hn_blogs: fetchHnBlogs,
  x_accounts: (config, limit, onProgress) => fetchXPosts(config, limit, onProgress),
  bluesky_accounts: (config, limit) => fetchSocialAccounts(config, limit, 'bluesky'),
  bluesky_topics: (config, limit, _onProgress, onSubItemProgress) => config.bluesky_topics_enabled ? fetchSocialTopics(config, limit, 'bluesky', onSubItemProgress) : Promise.resolve([]),
  mastodon_accounts: (config, limit) => fetchSocialAccounts(config, limit, 'mastodon'),
  mastodon_topics: (config, limit, _onProgress, onSubItemProgress) => config.mastodon_topics_enabled ? fetchSocialTopics(config, limit, 'mastodon', onSubItemProgress) : Promise.resolve([]),
  mastodon_trends: fetchMastodonTrends,
  sources_36kr: fetch36kr,
  wallstreetcn: fetchWallStreetCN,
  chrome_radar: fetchChromeRadar,
  rss_blogs: fetchRssFeeds,
  rss_news: fetchRssNews,
  weibo: fetchWeibo,
  zhihu: fetchZhihu,
  xiaohongshu: fetchXiaohongshu,
  baidu_tieba: fetchBaiduTieba,
  douyin: fetchDouyin,
  toutiao: fetchToutiao,
  netease: fetchNetease,
  '36kr_trending': fetchKrTrending,
  juejin: fetchJuejin,
  baidu: fetchBaidu,
}
