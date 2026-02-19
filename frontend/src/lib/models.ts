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

  // Politics sensor
  account?: string | null
  handle?: string | null

  // Topics sensor
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
  'politics',
  'topics',
  'insights',
] as const

export type SectionKey = (typeof ALL_SECTIONS)[number]

export function emptyItemsMap(): Record<SectionKey, IntelItem[]> {
  return {
    tech_trends: [],
    research: [],
    capital_flow: [],
    products: [],
    community: [],
    politics: [],
    topics: [],
    insights: [],
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

export interface SensorProgress {
  name: string
  state: 'pending' | 'running' | 'ok' | 'failed'
  item_count: number
  error: string | null
  error_kind?: 'config' | 'api' | null
}

export interface PipelineStatus {
  running: boolean
  started_at: string | null
  completed_at: string | null
  sensors: SensorProgress[]
  total_items: number
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

  // Politics sensor accounts
  politics_accounts: string[]

  // Topics sensor keywords/hashtags
  topics_keywords: string[]

  // Cache
  cache_ttl_hours: number

  // Post expiry — items older than this are pruned by the cleanup cron
  post_expiry_days: number
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
      grok: true,
      product_hunt: true,
      sources_36kr: true,
      wallstreetcn: true,
      politics: true,
      topics: true,
    },
    fetch_time: '07:51',
    fetch_timezone: 'Asia/Shanghai',
    default_limit: 10,
    sensor_limits: {},
    sensor_lookback_hours: {},
    boost_keywords: [],
    suppress_keywords: [],
    politics_accounts: [],
    topics_keywords: [],
    cache_ttl_hours: 6,
    post_expiry_days: 30,
  }
}

/** Return the configured limit for a sensor, falling back to default_limit. */
export function sensorLimit(config: ConfigSettings, sensorName: string): number {
  return config.sensor_limits[sensorName] ?? config.default_limit
}
