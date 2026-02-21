// ABOUTME: Shared TypeScript data models for Intel Briefing.
// ABOUTME: Defines IntelItem, IntelReport, HealthResponse, ConfigSettings and pipeline status types.

import { ALL_CATEGORIES, type CategoryKey, emptyCategoryMap } from './sensors/taxonomy'

export { ALL_CATEGORIES, type CategoryKey }

export interface IntelItem {
  id: string
  source: string
  title: string
  url: string

  // Optional enrichment fields
  heat?: string | null
  published_at?: string | null

  // Research (ArXiv)
  authors?: string[] | null
  categories?: string[] | null
  abstract?: string | null

  // Social sensors
  account?: string | null
  handle?: string | null
  topic?: string | null

  // Full content (blog articles)
  content?: string | null

  // Link verification status
  verified?: boolean | null
}

export function emptyItemsMap(): Record<CategoryKey, IntelItem[]> {
  return emptyCategoryMap() as Record<CategoryKey, IntelItem[]>
}

/** Ensure every expected section key exists, filling missing ones with []. */
export function ensureAllSections(
  items: Record<string, IntelItem[]>,
): Record<CategoryKey, IntelItem[]> {
  const result = emptyItemsMap()
  for (const key of ALL_CATEGORIES) {
    if (items[key]) {
      result[key] = items[key]
    }
  }
  return result
}

export interface IntelReport {
  date: string
  fetched_at: string
  stale: boolean
  sources_ok: string[]
  sources_failed: string[]
  items: Record<CategoryKey, IntelItem[]>
}

export function createReport(
  overrides: Partial<IntelReport> & Pick<IntelReport, 'date' | 'fetched_at'>,
): IntelReport {
  const raw = {
    stale: false,
    sources_ok: [],
    sources_failed: [],
    items: emptyItemsMap(),
    ...overrides,
  }
  return {
    ...raw,
    items: ensureAllSections(raw.items),
  }
}

export interface HealthResponse {
  status: 'ok' | 'no_data' | 'stale' | 'error'
  last_fetch: string | null
}

export interface SensorResult {
  sensor_name: string
  items: IntelItem[]
  error: string | null
  error_kind?: 'config' | 'api' | null
}

export function sensorResultSucceeded(result: SensorResult): boolean {
  return result.error === null
}

export type RunMode = 'fetch' | 'summarize' | 'fetch_summarize'
export type StageState = 'queued' | 'running' | 'ok' | 'failed' | 'skipped' | 'cancelled'

export interface SensorJobProgress {
  name: string
  fetch: StageState
  fetch_error: string | null
  fetch_error_kind: 'config' | 'api' | null
  fetch_detail: string | null
  summary: StageState
  summary_error: string | null
  item_count: number
  // Map-reduce chunk progress for summary stage
  summary_chunks_total: number
  summary_chunks_done: number
  // URL verification retry progress
  verify_attempt: number
  verify_max_retries: number
  verify_failures: number
}

export interface PipelineStatus {
  running: boolean
  cancelled: boolean
  mode: RunMode
  default_concurrency: number
  local_summary_concurrency: number
  started_at: string | null
  completed_at: string | null
  sensors: SensorJobProgress[]
  overall_summary: StageState
  total_items: number
}

export interface SensorSummaryItem {
  title: string
  url: string
  brief: string
  verified?: boolean | null
}

export interface SensorSummary {
  sensor_name: string
  label: string
  source_url: string
  summary: string
  item_count: number
  items: SensorSummaryItem[]
}

export interface BriefingRef {
  title: string
  url: string
  verified?: boolean | null
}

/** Global source list entry — Perplexity-style numbered source for [N] citation resolution. */
export interface BriefingSource {
  id: number
  title: string
  url: string
  sensor: string
  brief?: string
}

export interface BriefingEntry {
  text: string
  source: string
  refs: BriefingRef[]
}

export interface BriefingSection {
  title: string
  entries: BriefingEntry[]
}

/** Canonical URLs for each sensor source, used in summary cards and export. */
export const SOURCE_URLS: Record<string, string> = {
  hacker_news:      'https://news.ycombinator.com',
  arxiv:            'https://arxiv.org/list/cs.AI/recent',
  github:           'https://github.com/trending',
  product_hunt:     'https://www.producthunt.com',
  v2ex:             'https://www.v2ex.com',
  hn_blogs:         'https://news.ycombinator.com/best',
  sources_36kr:     'https://36kr.com',
  wallstreetcn:     'https://wallstreetcn.com',
  chrome_radar:     'https://chromewebstore.google.com',
  rss_feeds:        '',
  x:                'https://x.com',
  bluesky:          'https://bsky.app',
  mastodon:         'https://mastodon.social',
  weibo:            'https://weibo.com',
  zhihu:            'https://www.zhihu.com',
  xiaohongshu:      'https://www.xiaohongshu.com',
}

export interface SentimentEntry {
  topic: string
  analysis: string
  refs: BriefingRef[]
}

export interface SentimentAnalysis {
  overall_mood: 'bullish' | 'bearish' | 'mixed' | 'neutral'
  mood_summary: string
  controversies: SentimentEntry[]
  opinion_shifts: SentimentEntry[]
  risk_flags: SentimentEntry[]
}

export const EMPTY_SENTIMENT: SentimentAnalysis = {
  overall_mood: 'neutral',
  mood_summary: '',
  controversies: [],
  opinion_shifts: [],
  risk_flags: [],
}

export interface OverallBriefing {
  quick_scan?: BriefingEntry[]
  executive_summary: string
  sections: BriefingSection[]
  sentiment: SentimentAnalysis
  /** Global numbered source list for [N] citation resolution (Perplexity-style). */
  sources?: BriefingSource[]
}

export interface BriefingSummary {
  generated_at: string
  report_fetched_at: string
  sections: SensorSummary[]
  overall: OverallBriefing
}

export interface SummarySensorProgress {
  sensor_name: string
  label: string
  state: 'pending' | 'running' | 'ok' | 'failed'
  error: string | null
}

export interface SummaryProgress {
  running: boolean
  started_at: string | null
  completed_at: string | null
  sensors: SummarySensorProgress[]
}

export interface ConfigSettings {
  // API keys
  github_token: string | null
  producthunt_token: string | null

  // Sensor enable/disable toggles
  sensors_enabled: Record<string, boolean>

  // Scheduler
  fetch_time: string
  fetch_timezone: string

  // Fetch limits — global default + optional per-sensor overrides
  default_limit: number
  sensor_limits: Record<string, number>
  sensor_lookback_hours: Record<string, number>

  // Keyword filters
  boost_keywords: string[]
  suppress_keywords: string[]

  // Bluesky credentials
  bluesky_handle: string | null
  bluesky_app_password: string | null

  // Mastodon credentials
  mastodon_token: string | null

  // Twitter/X authentication cookies (for @the-convocation/twitter-scraper)
  twitter_auth_token: string | null
  twitter_ct0: string | null

  // X scraper provider selection — which scraper to try first
  x_scraper_provider: 'twitter-scraper' | 'apify' | 'mixed'

  // Apify API token (for apify/twitter-scraper actor fallback)
  apify_token: string | null

  // Social sensor account lists (per platform)
  social_accounts_x: string[]
  social_accounts_bluesky: string[]
  social_accounts_mastodon: string[]

  // Disabled accounts — these remain in the list but are skipped during fetch
  social_accounts_disabled: string[]

  // Social sensor topic keywords
  social_topics_keywords: string[]

  // Include-following toggles (auto-include posts from followed accounts)
  social_following_bluesky: boolean
  social_following_mastodon: boolean

  // Per-platform sub-toggles (Bluesky)
  bluesky_topics_enabled: boolean
  bluesky_trends_enabled: boolean
  // Per-platform sub-toggles (Mastodon)
  mastodon_topics_enabled: boolean
  mastodon_trends_enabled: boolean

  // RSS feed URLs
  rss_feed_urls: string[]

  // Cache
  cache_ttl_hours: number

  // Concurrency — default applies to both fetch and summary; local override for local LLM models
  default_concurrency: number
  local_summary_concurrency: number

  // Post expiry — items older than this are pruned by the cleanup cron
  post_expiry_days: number

  // AI summary — LLM provider config
  summary_provider: 'openrouter' | 'local' | null
  summary_api_key: string | null
  summary_base_url: string
  summary_model: string

  // Customizable summary prompts
  summary_sensor_prompts: Record<string, string>
  summary_overall_prompt: string
}

export function defaultConfig(): ConfigSettings {
  return {
    github_token: null,
    producthunt_token: null,
    sensors_enabled: {
      hacker_news: true,
      github: true,
      arxiv: true,
      v2ex: true,
      hn_blogs: true,
      product_hunt: true,
      sources_36kr: true,
      wallstreetcn: true,
      x: true,
      bluesky: true,
      mastodon: true,
      chrome_radar: false,
      rss_feeds: false,
      weibo: true,
      zhihu: true,
      xiaohongshu: true,
    },
    fetch_time: '07:51',
    fetch_timezone: 'Asia/Shanghai',
    default_limit: 10,
    sensor_limits: {},
    sensor_lookback_hours: {},
    boost_keywords: [],
    suppress_keywords: [],
    bluesky_handle: null,
    bluesky_app_password: null,
    mastodon_token: null,
    twitter_auth_token: null,
    twitter_ct0: null,
    x_scraper_provider: 'twitter-scraper',
    apify_token: null,
    social_accounts_x: [],
    social_accounts_bluesky: [],
    social_accounts_mastodon: [],
    social_accounts_disabled: [],
    social_topics_keywords: [],
    social_following_bluesky: false,
    social_following_mastodon: false,
    bluesky_topics_enabled: true,
    bluesky_trends_enabled: true,
    mastodon_topics_enabled: true,
    mastodon_trends_enabled: true,
    rss_feed_urls: [],
    cache_ttl_hours: 6,
    default_concurrency: 4,
    local_summary_concurrency: 1,
    post_expiry_days: 30,
    summary_provider: null,
    summary_api_key: null,
    summary_base_url: 'https://openrouter.ai/api/v1',
    summary_model: 'deepseek/deepseek-v3.2',
    summary_sensor_prompts: {},
    summary_overall_prompt: '',
  }
}

/** Return the configured limit for a sensor, falling back to default_limit. */
export function sensorLimit(config: ConfigSettings, sensorName: string): number {
  return config.sensor_limits[sensorName] ?? config.default_limit
}
