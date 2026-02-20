// ABOUTME: Tests for the ScheduleFooter component (Zone 3 of the Status page redesign).
// ABOUTME: Covers scheduled run display, countdown text, and null-config fallback.
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ScheduleFooter } from './ScheduleFooter'
import type { ConfigSettings } from '@/api/client'

vi.mock('./time-helpers', () => ({
  nextFetchIn: vi.fn(() => 'in 12h 59m'),
}))

function buildConfig(overrides: Partial<ConfigSettings> = {}): ConfigSettings {
  return {
    xai_api_key: null,
    xai_base_url: 'https://api.x.ai/v1',
    xai_model: 'grok-3',
    github_token: null,
    producthunt_token: null,
    sensors_enabled: {},
    fetch_time: '06:00',
    fetch_timezone: 'Asia/Shanghai',
    default_limit: 25,
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
    ...overrides,
  }
}

describe('ScheduleFooter', () => {
  it('shows next run time and timezone when config is loaded', () => {
    const config = buildConfig({ fetch_time: '06:00', fetch_timezone: 'Asia/Shanghai' })
    render(<ScheduleFooter config={config} />)
    expect(screen.getByText('06:00')).toBeInTheDocument()
    expect(screen.getByText(/Asia\/Shanghai/)).toBeInTheDocument()
  })

  it('shows countdown text matching expected pattern', () => {
    const config = buildConfig()
    render(<ScheduleFooter config={config} />)
    expect(screen.getByText(/in \d+h?\s*\d*m/)).toBeInTheDocument()
  })

  it('shows "No scheduled run configured" when config is null', () => {
    render(<ScheduleFooter config={null} />)
    expect(screen.getByText('No scheduled run configured')).toBeInTheDocument()
  })
})
