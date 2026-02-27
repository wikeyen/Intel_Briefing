// ABOUTME: Centralized sensor taxonomy — single source of truth for all sensor metadata.
// ABOUTME: Defines sensor definitions, labels, and source-mapping utilities.

export interface SensorDef {
  key: string
  label: string
  desc: string
  language: 'cn' | 'row'
}

export const SENSORS: SensorDef[] = [
  // ROW
  { key: 'hacker_news',     label: 'Hacker News',      desc: 'Top stories from news.ycombinator.com',          language: 'row' },
  { key: 'github',          label: 'GitHub Trending',   desc: 'Daily trending repositories',                    language: 'row' },
  { key: 'arxiv',           label: 'ArXiv AI',          desc: 'Latest AI/ML research preprints',                language: 'row' },
  { key: 'product_hunt',    label: 'Product Hunt',      desc: 'Top products of the day',                        language: 'row' },
  { key: 'chrome_radar',    label: 'Chrome Radar',      desc: 'Chrome Web Store surveillance',                  language: 'row' },
  { key: 'hn_blogs',        label: 'HN Blogs',          desc: 'Curated blog posts from Hacker News',            language: 'row' },
  { key: 'x_accounts',        label: 'X Accounts',        desc: 'Posts from monitored X accounts',               language: 'row' },
  { key: 'bluesky_accounts',  label: 'Bluesky Accounts',  desc: 'Posts from monitored Bluesky accounts',         language: 'row' },
  { key: 'bluesky_topics',    label: 'Bluesky Topics',    desc: 'Keyword and hashtag search on Bluesky',         language: 'row' },
  { key: 'mastodon_accounts', label: 'Mastodon Accounts', desc: 'Posts from monitored Mastodon accounts',        language: 'row' },
  { key: 'mastodon_topics',   label: 'Mastodon Topics',   desc: 'Hashtag search on Mastodon',                    language: 'row' },
  { key: 'mastodon_trends',   label: 'Mastodon Trends',   desc: 'Trending posts on Mastodon',                    language: 'row' },
  { key: 'rss_blogs',         label: 'RSS Blogs',         desc: 'Blog and other RSS/Atom feed subscriptions',    language: 'row' },
  { key: 'rss_news',        label: 'RSS News',          desc: 'News feeds from RSS subscriptions',              language: 'row' },
  // CN
  { key: 'sources_36kr',    label: '36Kr',              desc: 'Chinese startup and tech news',                  language: 'cn' },
  { key: 'wallstreetcn',    label: 'WallStreetCN',      desc: 'Chinese financial and macro news',               language: 'cn' },
  { key: 'v2ex',            label: 'V2EX',              desc: 'Chinese tech community hot posts',               language: 'cn' },
  { key: 'zhihu',           label: 'Zhihu',             desc: 'Zhihu trending questions and discussions',       language: 'cn' },
  { key: 'weibo',           label: 'Weibo',             desc: 'Weibo real-time hot search trending',            language: 'cn' },
  { key: 'xiaohongshu',     label: 'Xiaohongshu',       desc: 'Xiaohongshu trending topics',                    language: 'cn' },
  { key: 'baidu_tieba',     label: 'Baidu Tieba',       desc: 'Hot discussion topics from Baidu Tieba',         language: 'cn' },
  { key: 'douyin',          label: 'Douyin',            desc: 'Douyin hot search trending',                     language: 'cn' },
  { key: 'toutiao',         label: 'Toutiao',           desc: 'Toutiao hot news board',                         language: 'cn' },
  { key: 'netease',         label: 'Netease News',      desc: 'Netease hot news board',                         language: 'cn' },
  { key: '36kr_trending',   label: '36Kr Hot',          desc: '36Kr 24-hour most-read articles',                language: 'cn' },
  { key: 'juejin',          label: 'Juejin',            desc: 'Juejin developer hot article ranking',           language: 'cn' },
  { key: 'baidu',           label: 'Baidu Hot',         desc: 'Baidu real-time hot search ranking',             language: 'cn' },
]

/**
 * Maps sensor keys to the item source value they produce.
 * Most sensors produce items with source === sensor key, but split social
 * sensors share a platform-level source (e.g. x_accounts -> 'x').
 */
const SENSOR_SOURCE_OVERRIDES: Record<string, string> = {
  x_accounts: 'x',
  bluesky_accounts: 'bluesky',
  bluesky_topics: 'bluesky',
  mastodon_accounts: 'mastodon',
  mastodon_topics: 'mastodon',
}

/** Resolve the item source value produced by a sensor key. */
export function sensorToSource(sensorKey: string): string {
  return SENSOR_SOURCE_OVERRIDES[sensorKey] ?? sensorKey
}

/** Maps each sensor key to its human-readable label. */
export const SENSOR_LABELS: Record<string, string> = Object.fromEntries(
  SENSORS.map(s => [s.key, s.label])
)

/** Human-readable labels for each language group. */
export const LANGUAGE_LABELS: Record<'cn' | 'row', string> = {
  row: 'ROW',
  cn: 'CN',
}
