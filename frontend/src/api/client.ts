// ABOUTME: Typed API client for the Intel Briefing gateway — all requests go through /api.
// ABOUTME: All functions return typed data or throw on HTTP errors.

export interface HealthResponse {
  status: 'ok' | 'stale' | 'no_data' | 'error'
  last_fetch: string | null
}

export type SummaryLanguage = 'en' | 'zh'

export type RssFeedType = 'news' | 'blog' | 'other'
export interface RssFeedEntry {
  url: string
  type: RssFeedType
}

export interface ConfigSettings {
  github_token: string | null
  producthunt_token: string | null
  sensors_enabled: Record<string, boolean>
  fetch_time: string
  fetch_timezone: string
  default_limit: number
  sensor_limits: Record<string, number>
  sensor_lookback_hours: Record<string, number>
  boost_keywords: string[]
  suppress_keywords: string[]
  bluesky_handle: string | null
  bluesky_app_password: string | null
  mastodon_token: string | null
  twitter_auth_token: string | null
  twitter_ct0: string | null
  x_scraper_provider: 'twitter-scraper' | 'apify' | 'mixed'
  apify_token: string | null
  social_accounts_x: string[]
  social_accounts_bluesky: string[]
  social_accounts_mastodon: string[]
  social_accounts_disabled: string[]
  social_topics_keywords: string[]
  social_following_bluesky: boolean
  social_following_mastodon: boolean
  bluesky_topics_enabled: boolean
  bluesky_trends_enabled: boolean
  mastodon_topics_enabled: boolean
  mastodon_trends_enabled: boolean
  rss_feed_urls: (string | RssFeedEntry)[]
  cache_ttl_hours: number
  default_concurrency: number
  local_summary_concurrency: number
  post_expiry_days: number
  summary_provider: 'openrouter' | 'local' | null
  summary_api_key: string | null
  summary_base_url: string
  summary_model: string
  summary_attribution_model: string
  summary_sensor_prompts: Record<string, string>
  summary_overall_prompt: string
  summary_language: SummaryLanguage
}

export interface IntelItem {
  id: string
  source: string
  title: string
  url: string
  heat?: string | null
  published_at?: string | null
  authors?: string[] | null
  categories?: string[] | null
  abstract?: string | null
  account?: string | null
  handle?: string | null
  topic?: string | null
  content?: string | null
  verified?: boolean | null
  sentiment?: {
    label: 'positive' | 'negative' | 'neutral'
    score: number
  } | null
  velocity?: {
    previousCount: number | null
    currentCount: number
    changePercent: number | null
    firstSeenAt: string | null
    hoursOnTrend: number | null
  } | null
}


export type RunMode = 'fetch' | 'summarize' | 'fetch_summarize'
export type StageState = 'queued' | 'running' | 'ok' | 'failed' | 'skipped' | 'cancelled'

export interface SensorJobProgress {
  name: string
  fetch: StageState
  fetch_error: string | null
  fetch_error_kind: 'config' | 'api' | null
  fetch_detail: string | null
  /** ISO timestamp when this sensor's fetch stage started running. */
  fetch_started_at: string | null
  summary: StageState
  summary_error: string | null
  item_count: number
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
  paused: boolean
  paused_stage: 'fetch' | 'summary' | 'pre_overall' | null
  retry_attempt: number
  retry_max: number
  mode: RunMode
  default_concurrency: number
  local_summary_concurrency: number
  started_at: string | null
  completed_at: string | null
  sensors: SensorJobProgress[]
  overall_summary: StageState
  total_items: number
  alive: boolean
}

export interface IntelReport {
  date: string
  fetched_at: string
  stale: boolean
  sources_ok: string[]
  sources_failed: string[]
  items: Record<string, IntelItem[]>
  /** Per-sensor ISO timestamp of last successful fetch. */
  sources_fetched_at?: Record<string, string>
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
  alive: boolean
}

export interface SensorSummaryItem {
  title: string
  url: string
  brief: string
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
  sections: {
    sensor_name: string
    label: string
    source_url: string
    summary: string
    brief_summary?: string
    item_count: number
    items: SensorSummaryItem[]
  }[]
  overall: OverallBriefing
}

export interface RssDiscoveryResult {
  type: 'feed' | 'discovered' | 'not_found' | 'error'
  feedUrl?: string
  feedTitle?: string
  message?: string
}

export interface OllamaModelInfo {
  name: string
  size: string
  family: string
  quantization: string
}

// Intelligence analysis types
export interface IntelTag {
  text: string
  weight: number
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed'
}

export interface TrendTopic {
  name: string
  summary: string
  sources: string[]
  itemCount: number
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  heat: number
}

export interface TrendIntelligence {
  topics: TrendTopic[]
  tags: IntelTag[]
  summary: string
  generated_at: string
}

export interface TopicSentimentEntry {
  topic: string
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  summary: string
  samplePosts: string[]
  postCount: number
}

export interface TopicIntelligence {
  topics: TopicSentimentEntry[]
  tags: IntelTag[]
  summary: string
  generated_at: string
}

export interface AccountFocus {
  account: string
  handle: string
  platform: string
  themes: string[]
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  postCount: number
}

export interface AccountsIntelligence {
  accounts: AccountFocus[]
  tags: IntelTag[]
  summary: string
  generated_at: string
}

export interface IntelligenceReport {
  trend: TrendIntelligence | null
  topics: TopicIntelligence | null
  accounts: AccountsIntelligence | null
}

const BASE = '/api'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => apiFetch<HealthResponse>('/health'),

  getConfig: () => apiFetch<ConfigSettings>('/config'),

  getRawConfig: () => apiFetch<ConfigSettings>('/config/raw'),

  updateConfig: (partial: Partial<ConfigSettings>) =>
    apiFetch<ConfigSettings>('/config', {
      method: 'PUT',
      body: JSON.stringify(partial),
    }),

  getLatest: () =>
    apiFetch<IntelReport>('/intel/latest'),

  triggerFetch: (mode?: RunMode, sensors?: string[]) =>
    apiFetch<{ status: string; mode: string }>('/fetch', {
      method: 'POST',
      body: JSON.stringify({ mode: mode ?? 'fetch_summarize', ...(sensors?.length ? { sensors } : {}) }),
    }),

  getPipelineStatus: () =>
    apiFetch<PipelineStatus>('/fetch/status'),

  getConsoleSeen: () =>
    apiFetch<{ runId: string | null }>('/console/seen'),

  setConsoleSeen: (runId: string) =>
    apiFetch<{ ok: boolean }>('/console/seen', {
      method: 'PUT',
      body: JSON.stringify({ runId }),
    }),

  getSummary: (lang?: string) =>
    apiFetch<{ summary: BriefingSummary | null }>(lang ? `/summary?lang=${lang}` : '/summary'),

  discoverRssFeed: (url: string) =>
    apiFetch<RssDiscoveryResult>(`/rss-discover?url=${encodeURIComponent(url)}`),

  getSummaryStatus: () =>
    apiFetch<SummaryProgress>('/summary/status'),

  testSummary: () =>
    apiFetch<{ ok: boolean; latency_ms?: number; error?: string }>('/summary/test', { method: 'POST' }),

  triggerSummary: () =>
    apiFetch<{ ok: boolean; status?: string; error?: string }>('/summary/trigger', { method: 'POST' }),

  stopSummary: () =>
    apiFetch<{ status: string }>('/summary/stop', { method: 'POST' }),

  invalidateCache: () =>
    apiFetch<{ ok: boolean; invalidated: number }>('/cache/invalidate', { method: 'POST' }),

  cleanupExpired: () =>
    apiFetch<{ ok: boolean; removed: number; expiry_days: number }>('/cache/cleanup', { method: 'POST' }),

  stopPipeline: () =>
    apiFetch<{ status: string }>('/fetch/stop', { method: 'POST' }),

  resumePipeline: (action: 'proceed' | 'retry_sensor' | 'skip_sensor' | 'skip_fetching_sensor' | 'generate_overall', sensors?: string[]) =>
    apiFetch<{ status: string }>('/fetch/resume', {
      method: 'POST',
      body: JSON.stringify({ action, ...(sensors?.length ? { sensors } : {}) }),
    }),

  getOllamaModels: (baseUrl?: string) =>
    apiFetch<{ models: OllamaModelInfo[]; error?: string }>(
      `/ollama/models${baseUrl ? `?base_url=${encodeURIComponent(baseUrl)}` : ''}`,
    ),

  getIntelligence: () =>
    apiFetch<{ intelligence: IntelligenceReport | null }>('/intelligence'),
}
