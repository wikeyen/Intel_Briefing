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
import { fetchWeibo } from './weibo'
import { fetchZhihu } from './zhihu'
import { fetchXiaohongshu } from './xiaohongshu'

export type SensorFetchFn = (config: ConfigSettings, limit: number) => Promise<IntelItem[]>

export { SENSOR_TOKEN_FIELD } from './constants'

export const SENSOR_REGISTRY: Record<string, SensorFetchFn> = {
  hacker_news: fetchHackerNews,
  arxiv: fetchArxiv,
  github: fetchGitHub,
  product_hunt: fetchProductHunt,
  v2ex: fetchV2ex,
  hn_blogs: fetchHnBlogs,
  social_accounts: fetchSocialAccounts,
  social_topics: fetchSocialTopics,
  social_trends: fetchSocialTrends,
  sources_36kr: fetch36kr,
  wallstreetcn: fetchWallStreetCN,
  chrome_radar: fetchChromeRadar,
  rss_feeds: fetchRssFeeds,
  weibo: fetchWeibo,
  zhihu: fetchZhihu,
  xiaohongshu: fetchXiaohongshu,
}
