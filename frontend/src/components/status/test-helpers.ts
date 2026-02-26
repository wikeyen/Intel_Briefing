// ABOUTME: Shared test helpers for Status page component tests.
// ABOUTME: Factory functions for IntelReport, ConfigSettings, PipelineStatus, and SensorJobProgress.
import type { IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress } from '@/api/client'

export function makeReport(overrides: Partial<IntelReport> = {}): IntelReport {
  return {
    date: '2026-01-15',
    fetched_at: '2026-01-15T10:30:00Z',
    stale: false,
    sources_ok: ['hacker_news', 'github', 'arxiv'],
    sources_failed: [],
    items: {
      tech: [
        { id: '1', source: 'hacker_news', title: 'HN Post 1', url: 'https://hn.com/1' },
        { id: '2', source: 'hacker_news', title: 'HN Post 2', url: 'https://hn.com/2' },
        { id: '3', source: 'github', title: 'GH Repo 1', url: 'https://github.com/1' },
      ],
      research: [
        { id: '4', source: 'arxiv', title: 'Paper 1', url: 'https://arxiv.org/1' },
        { id: '5', source: 'arxiv', title: 'Paper 2', url: 'https://arxiv.org/2' },
      ],
    },
    ...overrides,
  }
}

export function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return {
    github_token: 'gh_token',
    producthunt_token: 'ph_token',
    sensors_enabled: {
      hacker_news: true,
      github: true,
      arxiv: true,
      product_hunt: true,
      v2ex: true,
      hn_blogs: true,
      sources_36kr: true,
      wallstreetcn: true,
      x: true,
      bluesky: true,
      mastodon: true,
      chrome_radar: true,
      rss_feeds: true,
    },
    fetch_time: '07:00',
    fetch_timezone: 'America/New_York',
    default_limit: 30,
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
    bluesky_topics_enabled: false,
    bluesky_trends_enabled: false,
    mastodon_topics_enabled: false,
    mastodon_trends_enabled: false,
    rss_feed_urls: [],
    cache_ttl_hours: 24,
    default_concurrency: 4,
    local_summary_concurrency: 4,
    post_expiry_days: 7,
    summary_provider: null,
    summary_api_key: null,
    summary_base_url: '',
    summary_model: '',
    summary_attribution_model: '',
    summary_sensor_prompts: {},
    summary_overall_prompt: '',
    summary_language: 'zh' as const,
    ...overrides,
  }
}

export function makePipelineStatus(overrides: Partial<PipelineStatus> = {}): PipelineStatus {
  return {
    running: false,
    cancelled: false,
    mode: 'fetch_summarize',
    default_concurrency: 4,
    local_summary_concurrency: 4,
    started_at: '2026-01-15T10:00:00Z',
    completed_at: '2026-01-15T10:30:00Z',
    sensors: [],
    overall_summary: 'ok',
    total_items: 5,
    alive: false,
    paused: false,
    paused_stage: null,
    retry_attempt: 0,
    retry_max: 0,
    events: [],
    ...overrides,
  }
}

export function makeSensorJob(name: string, overrides: Partial<SensorJobProgress> = {}): SensorJobProgress {
  return {
    name,
    fetch: 'queued',
    fetch_error: null,
    fetch_error_kind: null,
    fetch_detail: null,
    fetch_started_at: null,
    fetch_cached: false,
    summary: 'queued',
    summary_error: null,
    summary_cached: false,
    item_count: 0,
    summary_chunks_total: 0,
    summary_chunks_done: 0,
    verify_attempt: 0,
    verify_max_retries: 0,
    verify_failures: 0,
    ...overrides,
  }
}
