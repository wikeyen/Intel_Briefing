// ABOUTME: Centralized sensor taxonomy — single source of truth for all sensor metadata.
// ABOUTME: Defines categories, sensor definitions, and grouping utilities for language/category views.

export const ALL_CATEGORIES = ['tech', 'research', 'finance', 'products', 'community', 'social', 'trend', 'insights', 'feeds'] as const
export type CategoryKey = (typeof ALL_CATEGORIES)[number]

export interface SensorDef {
  key: string
  label: string
  desc: string
  language: 'cn' | 'row'
  category: CategoryKey
}

export const SENSORS: SensorDef[] = [
  // ROW
  { key: 'hacker_news',     label: 'Hacker News',      desc: 'Top stories from news.ycombinator.com',          language: 'row', category: 'tech' },
  { key: 'github',          label: 'GitHub Trending',   desc: 'Daily trending repositories',                    language: 'row', category: 'tech' },
  { key: 'arxiv',           label: 'ArXiv AI',          desc: 'Latest AI/ML research preprints',                language: 'row', category: 'research' },
  { key: 'product_hunt',    label: 'Product Hunt',      desc: 'Top products of the day',                        language: 'row', category: 'products' },
  { key: 'chrome_radar',    label: 'Chrome Radar',      desc: 'Chrome Web Store surveillance',                  language: 'row', category: 'products' },
  { key: 'hn_blogs',        label: 'HN Blogs',          desc: 'Curated blog posts from Hacker News',            language: 'row', category: 'insights' },
  { key: 'x_accounts',        label: 'X Accounts',        desc: 'Posts from monitored X accounts',               language: 'row', category: 'social' },
  { key: 'bluesky_accounts',  label: 'Bluesky Accounts',  desc: 'Posts from monitored Bluesky accounts',         language: 'row', category: 'social' },
  { key: 'bluesky_topics',    label: 'Bluesky Topics',    desc: 'Keyword and hashtag search on Bluesky',         language: 'row', category: 'social' },
  { key: 'mastodon_accounts', label: 'Mastodon Accounts', desc: 'Posts from monitored Mastodon accounts',        language: 'row', category: 'social' },
  { key: 'mastodon_topics',   label: 'Mastodon Topics',   desc: 'Hashtag search on Mastodon',                    language: 'row', category: 'social' },
  { key: 'mastodon_trends',   label: 'Mastodon Trends',   desc: 'Trending posts on Mastodon',                    language: 'row', category: 'trend' },
  { key: 'rss_blogs',         label: 'RSS Blogs',         desc: 'Blog and other RSS/Atom feed subscriptions',    language: 'row', category: 'feeds' },
  { key: 'rss_news',        label: 'RSS News',          desc: 'News feeds from RSS subscriptions',              language: 'row', category: 'feeds' },
  // CN
  { key: 'sources_36kr',    label: '36Kr',              desc: 'Chinese startup and tech news',                  language: 'cn',  category: 'finance' },
  { key: 'wallstreetcn',    label: 'WallStreetCN',      desc: 'Chinese financial and macro news',               language: 'cn',  category: 'finance' },
  { key: 'v2ex',            label: 'V2EX',              desc: 'Chinese tech community hot posts',               language: 'cn',  category: 'trend' },
  { key: 'zhihu',           label: 'Zhihu',             desc: 'Zhihu trending questions and discussions',       language: 'cn',  category: 'trend' },
  { key: 'weibo',           label: 'Weibo',             desc: 'Weibo real-time hot search trending',            language: 'cn',  category: 'trend' },
  { key: 'xiaohongshu',     label: 'Xiaohongshu',       desc: 'Xiaohongshu trending topics',                    language: 'cn',  category: 'trend' },
  { key: 'baidu_tieba',     label: 'Baidu Tieba',       desc: 'Hot discussion topics from Baidu Tieba',         language: 'cn',  category: 'trend' },
  { key: 'douyin',          label: 'Douyin',            desc: 'Douyin hot search trending',                     language: 'cn',  category: 'trend' },
  { key: 'toutiao',         label: 'Toutiao',           desc: 'Toutiao hot news board',                         language: 'cn',  category: 'trend' },
  { key: 'netease',         label: 'Netease News',      desc: 'Netease hot news board',                         language: 'cn',  category: 'trend' },
  { key: '36kr_trending',   label: '36Kr Hot',          desc: '36Kr 24-hour most-read articles',                language: 'cn',  category: 'trend' },
  { key: 'juejin',          label: 'Juejin',            desc: 'Juejin developer hot article ranking',           language: 'cn',  category: 'trend' },
  { key: 'baidu',           label: 'Baidu Hot',         desc: 'Baidu real-time hot search ranking',             language: 'cn',  category: 'trend' },
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

/** Maps each sensor key (and source alias) to its category. */
export const SENSOR_CATEGORY_MAP: Record<string, CategoryKey> = (() => {
  const map: Record<string, CategoryKey> = {}
  for (const s of SENSORS) {
    map[s.key] = s.category
    // Also index by item source value for sensors whose key differs from source
    const src = sensorToSource(s.key)
    if (src !== s.key && !(src in map)) {
      map[src] = s.category
    }
  }
  return map
})()

/** Maps each sensor key to its human-readable label. */
export const SENSOR_LABELS: Record<string, string> = Object.fromEntries(
  SENSORS.map(s => [s.key, s.label])
)

/** Display metadata for each category. */
export const CATEGORY_META: Record<CategoryKey, { label: string; emoji: string }> = {
  tech:      { label: 'Tech',      emoji: '\u{1F525}' },
  research:  { label: 'Research',  emoji: '\u{1F4C4}' },
  finance:   { label: 'Finance',   emoji: '\u{1F4B0}' },
  products:  { label: 'Products',  emoji: '\u{1F680}' },
  community: { label: 'Community', emoji: '\u{1F5E3}\u{FE0F}' },
  social:    { label: 'Social',    emoji: '\u{1F4F1}' },
  trend:     { label: 'Trend',     emoji: '\u{1F4C8}' },
  insights:  { label: 'Insights',  emoji: '\u{1F4A1}' },
  feeds:     { label: 'Feeds',     emoji: '\u{1F4F0}' },
}

/** Human-readable labels for each language group. */
export const LANGUAGE_LABELS: Record<'cn' | 'row', string> = {
  row: 'ROW',
  cn: 'CN',
}

export interface CategoryGroup {
  category: CategoryKey
  label: string
  sensors: SensorDef[]
}

export interface LanguageGroup {
  language: 'cn' | 'row'
  label: string
  categories: CategoryGroup[]
}

/**
 * Groups all sensors by language then category.
 * Returns ROW first, CN second.
 * Within each language, categories appear in ALL_CATEGORIES order,
 * only including categories that have sensors in that language.
 */
export function sensorsByLanguageAndCategory(): LanguageGroup[] {
  const languages: Array<'row' | 'cn'> = ['row', 'cn']

  return languages.map(lang => {
    const langSensors = SENSORS.filter(s => s.language === lang)
    const categories: CategoryGroup[] = []

    for (const cat of ALL_CATEGORIES) {
      const catSensors = langSensors.filter(s => s.category === cat)
      if (catSensors.length > 0) {
        categories.push({
          category: cat,
          label: CATEGORY_META[cat].label,
          sensors: catSensors,
        })
      }
    }

    return {
      language: lang,
      label: LANGUAGE_LABELS[lang],
      categories,
    }
  })
}

/** Returns all sensor keys belonging to a given category. */
export function sensorsForCategory(category: CategoryKey): string[] {
  return SENSORS.filter(s => s.category === category).map(s => s.key)
}

/** Returns an empty record keyed by every category, each mapped to an empty array. */
export function emptyCategoryMap(): Record<CategoryKey, never[]> {
  return Object.fromEntries(ALL_CATEGORIES.map(c => [c, []])) as Record<CategoryKey, never[]>
}
