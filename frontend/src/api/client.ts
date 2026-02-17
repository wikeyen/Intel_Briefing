// Typed API client for Intel Briefing backend endpoints.
// All functions return typed data or throw on HTTP errors.

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
  section_limits: Record<string, number>
  boost_keywords: string[]
  suppress_keywords: string[]
  politics_accounts: string[]
  topics_keywords: string[]
  cache_ttl_hours: number
}

export interface IntelItem {
  id: string
  source: string
  title: string
  url: string
  heat?: string | null
  published_at?: string | null
  abstract?: string | null
  account?: string | null
  handle?: string | null
  topic?: string | null
}

export interface IntelReport {
  date: string
  fetched_at: string
  stale: boolean
  sources_ok: string[]
  sources_failed: string[]
  items: Record<string, IntelItem[]>
}

const BASE = ''

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

  getLatest: (limit = 10) =>
    apiFetch<IntelReport>(`/intel/latest?limit=${limit}`),

  triggerFetch: () =>
    apiFetch<{ status: string }>('/fetch', { method: 'POST' }),
}
