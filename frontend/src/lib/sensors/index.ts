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
import { fetchGrok } from './grok'
import { fetchPolitics } from './politics'
import { fetchTopics } from './topics'

export type SensorFetchFn = (config: ConfigSettings, limit: number) => Promise<IntelItem[]>

/** Maps sensor names to the config token field they require. Sensors not listed need no key. */
export const SENSOR_TOKEN_FIELD: Partial<Record<string, keyof ConfigSettings>> = {
  github: 'github_token',
  product_hunt: 'producthunt_token',
  grok: 'xai_api_key',
  politics: 'xai_api_key',
  topics: 'xai_api_key',
}

export const SENSOR_REGISTRY: Record<string, SensorFetchFn> = {
  hacker_news: fetchHackerNews,
  arxiv: fetchArxiv,
  github: fetchGitHub,
  product_hunt: fetchProductHunt,
  v2ex: fetchV2ex,
  hn_blogs: fetchHnBlogs,
  grok: fetchGrok,
  sources_36kr: fetch36kr,
  wallstreetcn: fetchWallStreetCN,
  politics: fetchPolitics,
  topics: fetchTopics,
}
