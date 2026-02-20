// ABOUTME: Centralized sensor taxonomy — single source of truth for all sensor metadata.
// ABOUTME: Defines categories, sensor definitions, and grouping utilities for language/category views.

export const ALL_CATEGORIES = ['tech', 'research', 'finance', 'products', 'community', 'social', 'insights', 'feeds'] as const
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
  { key: 'social_accounts', label: 'Social Accounts',   desc: 'Monitor accounts across X, Bluesky, Mastodon',  language: 'row', category: 'social' },
  { key: 'social_topics',   label: 'Social Topics',     desc: 'Track keywords across X, Bluesky, Mastodon',    language: 'row', category: 'social' },
  { key: 'social_trends',   label: 'Social Trends',     desc: 'Trending content across X, Bluesky, Mastodon',  language: 'row', category: 'social' },
  { key: 'rss_feeds',       label: 'RSS Feeds',         desc: 'Custom RSS/Atom feed subscriptions',             language: 'row', category: 'feeds' },
  // CN
  { key: 'sources_36kr',    label: '36Kr',              desc: 'Chinese startup and tech news',                  language: 'cn',  category: 'finance' },
  { key: 'wallstreetcn',    label: 'WallStreetCN',      desc: 'Chinese financial and macro news',               language: 'cn',  category: 'finance' },
  { key: 'v2ex',            label: 'V2EX',              desc: 'Chinese tech community hot posts',               language: 'cn',  category: 'community' },
  { key: 'zhihu',           label: 'Zhihu',             desc: 'Zhihu trending questions and discussions',       language: 'cn',  category: 'community' },
  { key: 'weibo',           label: 'Weibo',             desc: 'Weibo real-time hot search trending',            language: 'cn',  category: 'social' },
  { key: 'xiaohongshu',     label: 'Xiaohongshu',       desc: 'Xiaohongshu trending topics',                    language: 'cn',  category: 'social' },
]

/** Maps each sensor key to its category. */
export const SENSOR_CATEGORY_MAP: Record<string, CategoryKey> = Object.fromEntries(
  SENSORS.map(s => [s.key, s.category])
) as Record<string, CategoryKey>

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
