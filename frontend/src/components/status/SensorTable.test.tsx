// ABOUTME: Tests for the SensorTable component (Zone 2 of the Status page redesign).
// ABOUTME: Covers idle/running/no-data states, section headers, sensor labels, counts, errors, and expanded detail.
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SensorTable } from './SensorTable'
import type { SensorTableProps } from './SensorTable'
import type { IntelReport, ConfigSettings, PipelineStatus, SensorJobProgress } from '@/api/client'

/* ------------------------------------------------------------------ */
/* Test helpers                                                        */
/* ------------------------------------------------------------------ */

function makeReport(overrides: Partial<IntelReport> = {}): IntelReport {
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

function makeConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return {
    xai_api_key: 'key',
    xai_base_url: 'https://api.x.ai',
    xai_model: 'grok-beta',
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
      social_accounts: true,
      social_topics: true,
      social_trends: true,
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
    social_accounts_x: [],
    social_accounts_bluesky: [],
    social_accounts_mastodon: [],
    social_topics_keywords: [],
    social_following_bluesky: false,
    social_following_mastodon: false,
    rss_feed_urls: [],
    cache_ttl_hours: 24,
    pipeline_concurrency: 4,
    post_expiry_days: 7,
    summary_provider: null,
    summary_api_key: null,
    summary_base_url: '',
    summary_model: '',
    summary_sensor_prompts: {},
    summary_overall_prompt: '',
    ...overrides,
  }
}

function makePipelineStatus(overrides: Partial<PipelineStatus> = {}): PipelineStatus {
  return {
    running: false,
    mode: 'fetch_summarize',
    concurrency: 4,
    started_at: '2026-01-15T10:00:00Z',
    completed_at: '2026-01-15T10:30:00Z',
    sensors: [],
    overall_summary: 'ok',
    total_items: 5,
    ...overrides,
  }
}

function makeSensorJob(name: string, overrides: Partial<SensorJobProgress> = {}): SensorJobProgress {
  return {
    name,
    fetch: 'queued',
    fetch_error: null,
    fetch_error_kind: null,
    summary: 'queued',
    summary_error: null,
    item_count: 0,
    summary_chunks_total: 0,
    summary_chunks_done: 0,
    ...overrides,
  }
}

function buildProps(overrides: Partial<SensorTableProps> = {}): SensorTableProps {
  return {
    isRunning: false,
    liveSensors: {},
    report: null,
    config: null,
    pipelineStatus: null,
    ...overrides,
  }
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('SensorTable', () => {
  // 1. Renders section headers
  it('renders section headers (Tech, Research, Social, etc.)', () => {
    const props = buildProps({
      report: makeReport(),
      config: makeConfig(),
      pipelineStatus: makePipelineStatus(),
    })
    render(<SensorTable {...props} />)
    expect(screen.getByText('TECH')).toBeInTheDocument()
    expect(screen.getByText('RESEARCH')).toBeInTheDocument()
    expect(screen.getByText('FINANCE')).toBeInTheDocument()
    expect(screen.getByText('PRODUCTS')).toBeInTheDocument()
    expect(screen.getByText('COMMUNITY')).toBeInTheDocument()
    expect(screen.getByText('SOCIAL')).toBeInTheDocument()
    expect(screen.getByText('INSIGHTS')).toBeInTheDocument()
    expect(screen.getByText('FEEDS')).toBeInTheDocument()
  })

  // 2. Renders sensor labels within sections
  it('renders sensor labels within sections (Hacker News, GitHub Trending, etc.)', () => {
    const props = buildProps({
      report: makeReport(),
      config: makeConfig(),
      pipelineStatus: makePipelineStatus(),
    })
    render(<SensorTable {...props} />)
    expect(screen.getByText('Hacker News')).toBeInTheDocument()
    expect(screen.getByText('GitHub Trending')).toBeInTheDocument()
    expect(screen.getByText('ArXiv AI')).toBeInTheDocument()
    expect(screen.getByText('Product Hunt')).toBeInTheDocument()
    expect(screen.getByText('V2EX')).toBeInTheDocument()
    expect(screen.getByText('Social Accounts')).toBeInTheDocument()
    expect(screen.getByText('RSS Feeds')).toBeInTheDocument()
  })

  // 3. Shows item count for successful sensors
  it('shows item count for successful sensors', () => {
    const report = makeReport({
      sources_ok: ['hacker_news', 'github', 'arxiv'],
    })
    const props = buildProps({
      report,
      config: makeConfig(),
      pipelineStatus: makePipelineStatus(),
    })
    render(<SensorTable {...props} />)
    // Hacker News has 2 items, GitHub has 1, ArXiv has 2
    // Find the sensor rows by their test IDs
    const hnRow = screen.getByTestId('sensor-row-hacker_news')
    expect(within(hnRow).getByText('2')).toBeInTheDocument()

    const ghRow = screen.getByTestId('sensor-row-github')
    expect(within(ghRow).getByText('1')).toBeInTheDocument()

    const arxivRow = screen.getByTestId('sensor-row-arxiv')
    expect(within(arxivRow).getByText('2')).toBeInTheDocument()
  })

  // 4. Shows "Off" for disabled sensors
  it('shows "Off" for disabled sensors', () => {
    const config = makeConfig({
      sensors_enabled: {
        ...makeConfig().sensors_enabled,
        github: false,
      },
    })
    const props = buildProps({
      report: makeReport(),
      config,
      pipelineStatus: makePipelineStatus(),
    })
    render(<SensorTable {...props} />)
    const ghRow = screen.getByTestId('sensor-row-github')
    expect(within(ghRow).getByText('Off')).toBeInTheDocument()
  })

  // 5. Shows inline error text for config errors
  it('shows inline error text for config errors', () => {
    const report = makeReport({
      sources_ok: ['hacker_news'],
      sources_failed: ['github'],
      items: {
        tech: [
          { id: '1', source: 'hacker_news', title: 'HN Post', url: 'https://hn.com/1' },
        ],
      },
    })
    const pipelineStatus = makePipelineStatus({
      sensors: [
        makeSensorJob('github', {
          fetch: 'failed',
          fetch_error: 'Missing GITHUB_TOKEN',
          fetch_error_kind: 'config',
        }),
      ],
    })
    const props = buildProps({
      report,
      config: makeConfig(),
      pipelineStatus,
    })
    render(<SensorTable {...props} />)
    const ghRow = screen.getByTestId('sensor-row-github')
    expect(within(ghRow).getByText('Missing GITHUB_TOKEN')).toBeInTheDocument()
  })

  // 6. Shows total items at the bottom
  it('shows total items at the bottom', () => {
    const report = makeReport()
    const props = buildProps({
      report,
      config: makeConfig(),
      pipelineStatus: makePipelineStatus({ total_items: 5 }),
    })
    render(<SensorTable {...props} />)
    const footer = screen.getByTestId('sensor-table-total')
    expect(within(footer).getByText('5')).toBeInTheDocument()
  })

  // 7. Shows dashes when no report exists (no-data state)
  it('shows dashes when no report exists (no-data state)', () => {
    const props = buildProps({
      report: null,
      config: makeConfig(),
      pipelineStatus: null,
    })
    render(<SensorTable {...props} />)
    // All sensor rows should show '\u2014' (em dash)
    const hnRow = screen.getByTestId('sensor-row-hacker_news')
    expect(within(hnRow).getByText('\u2014')).toBeInTheDocument()

    const ghRow = screen.getByTestId('sensor-row-github')
    expect(within(ghRow).getByText('\u2014')).toBeInTheDocument()
  })

  // 8. Shows "Fetching\u2026" for sensors currently fetching
  it('shows "Fetching\u2026" for sensors currently fetching', () => {
    const liveSensors: Record<string, SensorJobProgress> = {
      hacker_news: makeSensorJob('hacker_news', { fetch: 'running', summary: 'queued' }),
    }
    const props = buildProps({
      isRunning: true,
      liveSensors,
      config: makeConfig(),
    })
    render(<SensorTable {...props} />)
    const hnRow = screen.getByTestId('sensor-row-hacker_news')
    expect(within(hnRow).getByText('Fetching\u2026')).toBeInTheDocument()
  })

  // 9. Shows "Summarizing\u2026" for sensors currently summarizing
  it('shows "Summarizing\u2026" for sensors currently summarizing', () => {
    const liveSensors: Record<string, SensorJobProgress> = {
      hacker_news: makeSensorJob('hacker_news', {
        fetch: 'ok',
        summary: 'running',
        item_count: 10,
      }),
    }
    const props = buildProps({
      isRunning: true,
      liveSensors,
      config: makeConfig(),
    })
    render(<SensorTable {...props} />)
    const hnRow = screen.getByTestId('sensor-row-hacker_news')
    expect(within(hnRow).getByText('Summarizing\u2026')).toBeInTheDocument()
  })

  // 10. Shows item count for sensors that finished during a run
  it('shows item count for sensors that finished during a run', () => {
    const liveSensors: Record<string, SensorJobProgress> = {
      hacker_news: makeSensorJob('hacker_news', {
        fetch: 'ok',
        summary: 'ok',
        item_count: 15,
      }),
    }
    const props = buildProps({
      isRunning: true,
      liveSensors,
      config: makeConfig(),
    })
    render(<SensorTable {...props} />)
    const hnRow = screen.getByTestId('sensor-row-hacker_news')
    expect(within(hnRow).getByText('15')).toBeInTheDocument()
  })

  // 11. Shows stage detail when a running sensor row is clicked (expanded state)
  it('shows stage detail when a running sensor row is clicked', () => {
    const liveSensors: Record<string, SensorJobProgress> = {
      hacker_news: makeSensorJob('hacker_news', {
        fetch: 'ok',
        summary: 'running',
        item_count: 10,
      }),
    }
    const props = buildProps({
      isRunning: true,
      liveSensors,
      config: makeConfig(),
    })
    render(<SensorTable {...props} />)
    const hnRow = screen.getByTestId('sensor-row-hacker_news')

    // Detail should not be visible before click
    expect(screen.queryByTestId('sensor-detail-hacker_news')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(hnRow)

    // Detail should now be visible with stage info
    const detail = screen.getByTestId('sensor-detail-hacker_news')
    expect(within(detail).getByText(/Fetch/)).toBeInTheDocument()
    expect(within(detail).getByText(/Summary/)).toBeInTheDocument()
  })

  // Additional: Shows inline error text for API errors
  it('shows inline error text for API errors', () => {
    const report = makeReport({
      sources_ok: [],
      sources_failed: ['hacker_news'],
      items: {},
    })
    const pipelineStatus = makePipelineStatus({
      sensors: [
        makeSensorJob('hacker_news', {
          fetch: 'failed',
          fetch_error: 'Connection timeout',
          fetch_error_kind: 'api',
        }),
      ],
    })
    const props = buildProps({
      report,
      config: makeConfig(),
      pipelineStatus,
    })
    render(<SensorTable {...props} />)
    const hnRow = screen.getByTestId('sensor-row-hacker_news')
    expect(within(hnRow).getByText('Connection timeout')).toBeInTheDocument()
  })

  // Section total should display the sum of items in that section
  it('shows section item total in section header', () => {
    const report = makeReport()
    const props = buildProps({
      report,
      config: makeConfig(),
      pipelineStatus: makePipelineStatus(),
    })
    render(<SensorTable {...props} />)
    // Tech section has 3 items (2 HN + 1 GH)
    const techSection = screen.getByTestId('section-tech')
    expect(within(techSection).getByTestId('section-count')).toHaveTextContent('3')
  })
})
