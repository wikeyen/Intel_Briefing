// ABOUTME: Tests for SensorGrid helper functions — topic keyword collection logic.
// ABOUTME: Verifies idle-state enrichment from report data and pipeline-active passthrough.
import { describe, it, expect } from 'vitest'
import { collectTopicKeywords } from './SensorGrid'
import { makeConfig, makeReport, makeSensorJob } from './test-helpers'
import type { PipelineStatus, SensorJobProgress, IntelReport } from '@/api/client'

describe('collectTopicKeywords', () => {
  const SENSOR_LABELS: Record<string, string> = {
    bluesky: 'Bluesky',
    mastodon: 'Mastodon',
  }

  it('returns empty array when no keywords configured and no pipeline data', () => {
    const result = collectTopicKeywords({}, null, SENSOR_LABELS, makeConfig(), null)
    expect(result).toEqual([])
  })

  it('shows configured keywords with item counts from report when idle', () => {
    const config = makeConfig({
      social_topics_keywords: ['ai', 'crypto'],
      bluesky_topics_enabled: true,
      mastodon_topics_enabled: true,
    })
    const report = makeReport({
      items: {
        social: [
          { id: '1', source: 'bluesky', title: 'AI post', url: 'https://b.sky/1', topic: 'ai' },
          { id: '2', source: 'bluesky', title: 'AI post 2', url: 'https://b.sky/2', topic: 'ai' },
          { id: '3', source: 'mastodon', title: 'AI toot', url: 'https://m.social/1', topic: 'ai' },
          { id: '4', source: 'bluesky', title: 'Crypto post', url: 'https://b.sky/3', topic: 'crypto' },
        ],
      },
    })

    const result = collectTopicKeywords({}, null, SENSOR_LABELS, config, report)

    expect(result).toHaveLength(2)
    // Sorted alphabetically
    expect(result[0].keyword).toBe('ai')
    expect(result[1].keyword).toBe('crypto')

    // AI: 2 bluesky + 1 mastodon
    const aiBluesky = result[0].platforms.find(p => p.sensor === 'bluesky')
    expect(aiBluesky?.sub.item_count).toBe(2)
    expect(aiBluesky?.sub.fetch).toBe('ok')

    const aiMastodon = result[0].platforms.find(p => p.sensor === 'mastodon')
    expect(aiMastodon?.sub.item_count).toBe(1)
    expect(aiMastodon?.sub.fetch).toBe('ok')

    // Crypto: 1 bluesky, 0 mastodon
    const cryptoBluesky = result[1].platforms.find(p => p.sensor === 'bluesky')
    expect(cryptoBluesky?.sub.item_count).toBe(1)
    expect(cryptoBluesky?.sub.fetch).toBe('ok')

    const cryptoMastodon = result[1].platforms.find(p => p.sensor === 'mastodon')
    expect(cryptoMastodon?.sub.item_count).toBe(0)
    expect(cryptoMastodon?.sub.fetch).toBe('queued')
  })

  it('only includes enabled topic sensors', () => {
    const config = makeConfig({
      social_topics_keywords: ['ai'],
      bluesky_topics_enabled: true,
      mastodon_topics_enabled: false,
    })

    const result = collectTopicKeywords({}, null, SENSOR_LABELS, config, null)

    expect(result).toHaveLength(1)
    expect(result[0].platforms).toHaveLength(1)
    expect(result[0].platforms[0].sensor).toBe('bluesky')
  })

  it('prefers live pipeline data over report data', () => {
    const config = makeConfig({
      social_topics_keywords: ['ai'],
      bluesky_topics_enabled: true,
      mastodon_topics_enabled: true,
    })
    const report = makeReport({
      items: {
        social: [
          { id: '1', source: 'bluesky', title: 'Old AI post', url: 'https://b.sky/1', topic: 'ai' },
        ],
      },
    })

    // Simulate live pipeline with sub_items
    const liveSensors: Record<string, SensorJobProgress> = {
      bluesky: {
        ...makeSensorJob('bluesky', { fetch: 'running' }),
        sub_items: [
          { key: 'ai', label: 'ai', fetch: 'running', item_count: 5 },
        ],
      },
    }

    const result = collectTopicKeywords(liveSensors, null, SENSOR_LABELS, config, report)

    // Should use live data, not report fallback
    expect(result).toHaveLength(1)
    expect(result[0].keyword).toBe('ai')
    const blueskyPlatform = result[0].platforms.find(p => p.sensor === 'bluesky')
    expect(blueskyPlatform?.sub.fetch).toBe('running')
    expect(blueskyPlatform?.sub.item_count).toBe(5)
  })

  it('ignores non-topic items from the report', () => {
    const config = makeConfig({
      social_topics_keywords: ['ai'],
      bluesky_topics_enabled: true,
      mastodon_topics_enabled: true,
    })
    const report = makeReport({
      items: {
        social: [
          // Regular social item (no topic) — should be ignored
          { id: '1', source: 'bluesky', title: 'Regular post', url: 'https://b.sky/1' },
          // Topic item — should be counted
          { id: '2', source: 'bluesky', title: 'AI post', url: 'https://b.sky/2', topic: 'ai' },
        ],
      },
    })

    const result = collectTopicKeywords({}, null, SENSOR_LABELS, config, report)

    const blueskyPlatform = result[0].platforms.find(p => p.sensor === 'bluesky')
    expect(blueskyPlatform?.sub.item_count).toBe(1)
  })
})
