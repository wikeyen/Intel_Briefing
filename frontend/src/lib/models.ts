// ABOUTME: Shared TypeScript data models for Intel Briefing.
// ABOUTME: Defines IntelItem, IntelReport, HealthResponse, ConfigSettings and pipeline status types.

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

  // Link verification status (Grok-sourced items only)
  verified?: boolean | null
}

export const ALL_SECTIONS = [
  'tech_trends',
  'research',
  'capital_flow',
  'products',
  'community',
  'social',
  'insights',
  'feeds',
] as const

export type SectionKey = (typeof ALL_SECTIONS)[number]

export function emptyItemsMap(): Record<SectionKey, IntelItem[]> {
  return {
    tech_trends: [],
    research: [],
    capital_flow: [],
    products: [],
    community: [],
    social: [],
    insights: [],
    feeds: [],
  }
}

/** Ensure every expected section key exists, filling missing ones with []. */
export function ensureAllSections(
  items: Record<string, IntelItem[]>,
): Record<SectionKey, IntelItem[]> {
  const result = emptyItemsMap()
  for (const key of ALL_SECTIONS) {
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
  items: Record<SectionKey, IntelItem[]>
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

/** @deprecated Use SensorJobProgress instead */
export interface SensorProgress {
  name: string
  state: 'pending' | 'running' | 'ok' | 'failed'
  item_count: number
  error: string | null
  error_kind?: 'config' | 'api' | null
}

export type RunMode = 'fetch' | 'summarize' | 'fetch_summarize'
export type StageState = 'queued' | 'running' | 'ok' | 'failed' | 'skipped'

export interface SensorJobProgress {
  name: string
  fetch: StageState
  fetch_error: string | null
  fetch_error_kind: 'config' | 'api' | null
  summary: StageState
  summary_error: string | null
  item_count: number
}

export interface PipelineStatus {
  running: boolean
  mode: RunMode
  concurrency: number
  started_at: string | null
  completed_at: string | null
  sensors: SensorJobProgress[]
  overall_summary: StageState
  total_items: number
}

export interface SensorSummary {
  sensor_name: string
  label: string
  summary: string
  item_count: number
}

export interface BriefingSummary {
  generated_at: string
  report_fetched_at: string
  sections: SensorSummary[]
  overall: string
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
  xai_api_key: string | null
  xai_base_url: string
  xai_model: string
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

  // Social sensor account lists (per platform)
  social_accounts_x: string[]
  social_accounts_bluesky: string[]
  social_accounts_mastodon: string[]

  // Social sensor topic keywords
  social_topics_keywords: string[]

  // Include-following toggles (auto-include posts from followed accounts)
  social_following_bluesky: boolean
  social_following_mastodon: boolean

  // RSS feed URLs
  rss_feed_urls: string[]

  // Cache
  cache_ttl_hours: number

  // Pipeline concurrency
  pipeline_concurrency: number

  // Post expiry — items older than this are pruned by the cleanup cron
  post_expiry_days: number

  // AI summary — LLM provider config
  summary_provider: 'openrouter' | 'custom' | null
  summary_api_key: string | null
  summary_base_url: string
  summary_model: string
}

export function defaultConfig(): ConfigSettings {
  return {
    xai_api_key: null,
    xai_base_url: 'https://api.x.ai/v1/chat/completions',
    xai_model: 'grok-3',
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
      social_accounts: true,
      social_topics: true,
      social_trends: true,
      chrome_radar: false,
      rss_feeds: false,
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
    social_accounts_x: [],
    social_accounts_bluesky: [],
    social_accounts_mastodon: [],
    social_topics_keywords: [],
    social_following_bluesky: false,
    social_following_mastodon: false,
    rss_feed_urls: [],
    cache_ttl_hours: 6,
    pipeline_concurrency: 4,
    post_expiry_days: 30,
    summary_provider: null,
    summary_api_key: null,
    summary_base_url: 'https://openrouter.ai/api/v1',
    summary_model: 'anthropic/claude-sonnet-4',
  }
}

/** Return the configured limit for a sensor, falling back to default_limit. */
export function sensorLimit(config: ConfigSettings, sensorName: string): number {
  return config.sensor_limits[sensorName] ?? config.default_limit
}
