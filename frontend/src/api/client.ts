// ABOUTME: Typed API client for the Intel Briefing gateway — all requests go through /api.
// ABOUTME: All functions return typed data or throw on HTTP errors.

export interface HealthResponse {
  status: 'ok' | 'stale' | 'no_data' | 'error'
  last_fetch: string | null
}

export interface ConfigSettings {
  xai_api_key: string | null
  xai_base_url: string
  xai_model: string
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
  social_accounts_x: string[]
  social_accounts_bluesky: string[]
  social_accounts_mastodon: string[]
  social_topics_keywords: string[]
  social_following_bluesky: boolean
  social_following_mastodon: boolean
  rss_feed_urls: string[]
  cache_ttl_hours: number
  post_expiry_days: number
  summary_provider: 'openrouter' | 'custom' | null
  summary_api_key: string | null
  summary_base_url: string
  summary_model: string
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

export interface IntelReport {
  date: string
  fetched_at: string
  stale: boolean
  sources_ok: string[]
  sources_failed: string[]
  items: Record<string, IntelItem[]>
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

export interface BriefingSummary {
  generated_at: string
  report_fetched_at: string
  sections: {
    sensor_name: string
    label: string
    summary: string
    item_count: number
  }[]
  overall: string
}

export interface RssDiscoveryResult {
  type: 'feed' | 'discovered' | 'not_found' | 'error'
  feedUrl?: string
  feedTitle?: string
  message?: string
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

  triggerFetch: () =>
    apiFetch<{ status: string }>('/fetch', { method: 'POST' }),

  getPipelineStatus: () =>
    apiFetch<PipelineStatus>('/fetch/status'),

  getConsoleSeen: () =>
    apiFetch<{ runId: string | null }>('/console/seen'),

  setConsoleSeen: (runId: string) =>
    apiFetch<{ ok: boolean }>('/console/seen', {
      method: 'PUT',
      body: JSON.stringify({ runId }),
    }),

  getSummary: () =>
    apiFetch<{ summary: BriefingSummary | null }>('/summary'),

  discoverRssFeed: (url: string) =>
    apiFetch<RssDiscoveryResult>(`/rss-discover?url=${encodeURIComponent(url)}`),

  getSummaryStatus: () =>
    apiFetch<SummaryProgress>('/summary/status'),

  testSummary: () =>
    apiFetch<{ ok: boolean; latency_ms?: number; error?: string }>('/summary/test', { method: 'POST' }),
}
