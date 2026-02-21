// ABOUTME: Tests for configurable summary prompt resolution.
// ABOUTME: Validates default prompts, user overrides, language selection, and fallback behavior.
import { describe, it, expect } from 'vitest'
import {
  getSensorPrompt, getOverallPrompt, getChunkExtractPrompt,
  DEFAULT_SENSOR_PROMPTS, DEFAULT_SENSOR_PROMPTS_EN,
  DEFAULT_OVERALL_PROMPT, DEFAULT_OVERALL_PROMPT_EN,
  CHUNK_EXTRACT_PROMPT, CHUNK_EXTRACT_PROMPT_EN,
} from './prompts'

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

  it('returns English prompt when language is en', () => {
    const prompt = getSensorPrompt('hacker_news', undefined, 'en')
    expect(prompt).toBe(DEFAULT_SENSOR_PROMPTS_EN['hacker_news'])
    expect(prompt).toContain('Hacker News')
    expect(prompt).toContain('never fabricate')
  })

  it('returns Chinese prompt when language is zh', () => {
    const prompt = getSensorPrompt('hacker_news', undefined, 'zh')
    expect(prompt).toBe(DEFAULT_SENSOR_PROMPTS['hacker_news'])
  })

  it('user override wins regardless of language', () => {
    const custom = 'My custom prompt'
    const prompt = getSensorPrompt('hacker_news', { hacker_news: custom }, 'en')
    expect(prompt).toBe(custom)
  })

  it('falls back to EN rss_feeds for unknown sensor with language en', () => {
    const prompt = getSensorPrompt('unknown_sensor', undefined, 'en')
    expect(prompt).toBe(DEFAULT_SENSOR_PROMPTS_EN['rss_feeds'])
  })

  it('has an English prompt for every standard sensor', () => {
    const sensors = [
      'hacker_news', 'arxiv', 'github', 'product_hunt', 'v2ex',
      'hn_blogs', 'sources_36kr', 'wallstreetcn', 'x',
      'bluesky', 'mastodon', 'chrome_radar', 'rss_feeds',
    ]
    for (const s of sensors) {
      expect(DEFAULT_SENSOR_PROMPTS_EN[s]).toBeTruthy()
    }
  })

  it('all English prompts contain anti-listing instruction', () => {
    for (const prompt of Object.values(DEFAULT_SENSOR_PROMPTS_EN)) {
      expect(prompt).toContain('no bullet lists')
      expect(prompt).toContain('2-4 sentence')
    }
  })

  it('all English prompts contain anti-hallucination instruction', () => {
    for (const prompt of Object.values(DEFAULT_SENSOR_PROMPTS_EN)) {
      expect(prompt).toContain('never fabricate')
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

describe('getChunkExtractPrompt', () => {
  it('returns Chinese prompt by default', () => {
    expect(getChunkExtractPrompt()).toBe(CHUNK_EXTRACT_PROMPT)
    expect(getChunkExtractPrompt('zh')).toBe(CHUNK_EXTRACT_PROMPT)
  })

  it('returns English prompt when language is en', () => {
    expect(getChunkExtractPrompt('en')).toBe(CHUNK_EXTRACT_PROMPT_EN)
    expect(getChunkExtractPrompt('en')).toContain('Extract key signals')
  })

  it('English chunk prompt contains anti-hallucination instruction', () => {
    expect(CHUNK_EXTRACT_PROMPT_EN).toContain('never fabricate')
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

  it('returns English overall prompt when language is en', () => {
    expect(getOverallPrompt(undefined, 'en')).toBe(DEFAULT_OVERALL_PROMPT_EN)
    expect(DEFAULT_OVERALL_PROMPT_EN).toContain('never fabricate')
  })

  it('user override wins regardless of language', () => {
    const custom = 'My custom overall'
    expect(getOverallPrompt(custom, 'en')).toBe(custom)
  })
})
