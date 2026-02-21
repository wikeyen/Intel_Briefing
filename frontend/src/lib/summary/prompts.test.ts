// ABOUTME: Tests for configurable summary prompt resolution.
// ABOUTME: Validates default prompts, user overrides, and fallback behavior.
import { describe, it, expect } from 'vitest'
import { getSensorPrompt, getOverallPrompt, DEFAULT_SENSOR_PROMPTS, DEFAULT_OVERALL_PROMPT, CHUNK_EXTRACT_PROMPT } from './prompts'

describe('getSensorPrompt', () => {
  it('returns default prompt for known sensor', () => {
    const prompt = getSensorPrompt('hacker_news')
    expect(prompt).toBe(DEFAULT_SENSOR_PROMPTS['hacker_news'])
    expect(prompt).toContain('Hacker News')
  })

  it('returns user override when provided', () => {
    const custom = 'Custom prompt for HN'
    const prompt = getSensorPrompt('hacker_news', { hacker_news: custom })
    expect(prompt).toBe(custom)
  })

  it('returns default when override map exists but sensor not overridden', () => {
    const prompt = getSensorPrompt('arxiv', { hacker_news: 'custom' })
    expect(prompt).toBe(DEFAULT_SENSOR_PROMPTS['arxiv'])
  })

  it('falls back to rss_feeds prompt for unknown sensor', () => {
    const prompt = getSensorPrompt('unknown_sensor')
    expect(prompt).toBe(DEFAULT_SENSOR_PROMPTS['rss_feeds'])
  })

  it('has a default prompt for every standard sensor', () => {
    const sensors = [
      'hacker_news', 'arxiv', 'github', 'product_hunt', 'v2ex',
      'hn_blogs', 'sources_36kr', 'wallstreetcn', 'x',
      'bluesky', 'mastodon', 'chrome_radar', 'rss_feeds',
    ]
    for (const s of sensors) {
      expect(DEFAULT_SENSOR_PROMPTS[s]).toBeTruthy()
    }
  })

  it('all prompts contain anti-listing instruction', () => {
    for (const prompt of Object.values(DEFAULT_SENSOR_PROMPTS)) {
      expect(prompt).toContain('严禁逐条列举')
      expect(prompt).toContain('2-4句')
    }
  })

  it('all prompts contain anti-hallucination instruction', () => {
    for (const prompt of Object.values(DEFAULT_SENSOR_PROMPTS)) {
      expect(prompt).toContain('严禁编造')
    }
  })
})


describe('CHUNK_EXTRACT_PROMPT', () => {
  it('contains extraction instructions', () => {
    expect(CHUNK_EXTRACT_PROMPT).toContain('提取关键信号')
    expect(CHUNK_EXTRACT_PROMPT).toContain('3-5句')
  })

  it('contains anti-hallucination instruction', () => {
    expect(CHUNK_EXTRACT_PROMPT).toContain('严禁编造')
  })
})

describe('getOverallPrompt', () => {
  it('returns default when no override', () => {
    expect(getOverallPrompt()).toBe(DEFAULT_OVERALL_PROMPT)
    expect(getOverallPrompt('')).toBe(DEFAULT_OVERALL_PROMPT)
  })

  it('returns user override when provided', () => {
    const custom = 'Custom overall prompt'
    expect(getOverallPrompt(custom)).toBe(custom)
  })

  it('default overall prompt contains anti-hallucination instruction', () => {
    expect(DEFAULT_OVERALL_PROMPT).toContain('严禁编造')
  })
})
