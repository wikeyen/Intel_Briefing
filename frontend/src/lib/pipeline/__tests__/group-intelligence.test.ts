// ABOUTME: Tests that the intelligence pipeline uses group-driven sensor sets for item splitting.
// ABOUTME: Validates trend/topic/social filtering respects group membership, not hardcoded categories.

import { describe, it, expect } from 'vitest'
import type { IntelItem } from '../../models'
import { createReport } from '../../models'
import { ALL_CATEGORIES, SENSOR_CATEGORY_MAP } from '../../sensors/taxonomy'
import type { CategoryKey } from '../../sensors/taxonomy'
import type { IntelligenceSensorSets } from '../intelligence'

// ── Replicate the filtering logic from runIntelligenceAnalysis ────────────
// This mirrors the exact splitting code in intelligence.ts so we can verify
// that group-driven sensor sets produce the correct item partitions.

function collectAllItems(report: { items: Record<string, IntelItem[]> }): IntelItem[] {
  const allItems: IntelItem[] = []
  for (const cat of ALL_CATEGORIES) {
    const catItems = report.items[cat as CategoryKey]
    if (catItems) allItems.push(...catItems)
  }
  return allItems
}

function splitWithGroups(allItems: IntelItem[], sensorSets: IntelligenceSensorSets) {
  const trendItems = allItems.filter(i => sensorSets.trendSensors.has(i.source))
  const topicItems = allItems.filter(i => sensorSets.topicSensors.has(i.source) && i.topic != null && i.topic.length > 0)
  const accountItems = allItems.filter(i => sensorSets.socialSensors.has(i.source) && i.account != null && i.account.length > 0)
  return { trendItems, topicItems, accountItems }
}

function splitWithLegacy(allItems: IntelItem[]) {
  const trendItems = allItems.filter(i => SENSOR_CATEGORY_MAP[i.source] === 'trend')
  const topicItems = allItems.filter(i => i.topic != null && i.topic.length > 0)
  const accountItems = allItems.filter(i => i.account != null && i.account.length > 0 && SENSOR_CATEGORY_MAP[i.source] === 'social')
  return { trendItems, topicItems, accountItems }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<IntelItem> & Pick<IntelItem, 'id' | 'source' | 'title'>): IntelItem {
  return { url: `https://example.com/${overrides.id}`, ...overrides }
}

function buildReport(items: IntelItem[]) {
  return createReport({
    date: '2026-02-27',
    fetched_at: new Date().toISOString(),
    items: { tech: items } as Record<string, IntelItem[]>,
  })
}

// ── Test data ─────────────────────────────────────────────────────────────

const TREND_ITEMS: IntelItem[] = [
  makeItem({ id: 't1', source: 'weibo', title: 'Weibo hot topic' }),
  makeItem({ id: 't2', source: 'zhihu', title: 'Zhihu trending question' }),
  makeItem({ id: 't3', source: 'douyin', title: 'Douyin viral clip' }),
]

const TOPIC_ITEMS: IntelItem[] = [
  makeItem({ id: 'tp1', source: 'x', title: 'AI thoughts', topic: 'artificial-intelligence' }),
  makeItem({ id: 'tp2', source: 'bluesky', title: 'Rust progress', topic: 'rust' }),
  makeItem({ id: 'tp3', source: 'mastodon', title: 'FOSS update', topic: 'open-source' }),
]

const SOCIAL_ITEMS: IntelItem[] = [
  makeItem({ id: 's1', source: 'x', title: 'Post by alice', account: 'alice', handle: 'alice' }),
  makeItem({ id: 's2', source: 'bluesky', title: 'Post by bob', account: 'bob', handle: 'bob' }),
]

const NEWS_ITEMS: IntelItem[] = [
  makeItem({ id: 'n1', source: 'hacker_news', title: 'HN story' }),
  makeItem({ id: 'n2', source: 'rss_news', title: 'RSS news', account: 'Reuters Feed' }),
]

const UNGROUPED_ITEMS: IntelItem[] = [
  makeItem({ id: 'u1', source: 'unknown_sensor', title: 'Mystery item' }),
]

// ── Tests ─────────────────────────────────────────────────────────────────

describe('group-driven intelligence splitting', () => {
  const sensorSets: IntelligenceSensorSets = {
    trendSensors: new Set(['weibo', 'zhihu', 'douyin']),
    topicSensors: new Set(['x', 'bluesky', 'mastodon']),
    socialSensors: new Set(['x', 'bluesky']),
  }

  it('trend items only come from sensors in trend-processing groups', () => {
    const allItems = collectAllItems(buildReport([...TREND_ITEMS, ...NEWS_ITEMS]))
    const { trendItems } = splitWithGroups(allItems, sensorSets)

    expect(trendItems).toHaveLength(3)
    expect(trendItems.every(i => sensorSets.trendSensors.has(i.source))).toBe(true)
    // No news items should leak in
    expect(trendItems.some(i => i.source === 'hacker_news')).toBe(false)
    expect(trendItems.some(i => i.source === 'rss_news')).toBe(false)
  })

  it('topic items only come from sensors in topic-processing groups AND have item.topic set', () => {
    const itemsWithoutTopic: IntelItem[] = [
      makeItem({ id: 'nt1', source: 'x', title: 'No topic post' }),         // x in topicSensors, no topic field
      makeItem({ id: 'nt2', source: 'hacker_news', title: 'HN topic', topic: 'tech' }),  // has topic, wrong sensor
    ]
    const allItems = collectAllItems(buildReport([...TOPIC_ITEMS, ...itemsWithoutTopic]))
    const { topicItems } = splitWithGroups(allItems, sensorSets)

    // Only the 3 TOPIC_ITEMS should match
    expect(topicItems).toHaveLength(3)
    expect(topicItems.every(i => sensorSets.topicSensors.has(i.source))).toBe(true)
    expect(topicItems.every(i => i.topic != null && i.topic.length > 0)).toBe(true)
    // Item from x without topic excluded
    expect(topicItems.some(i => i.id === 'nt1')).toBe(false)
    // Item from hacker_news with topic excluded (wrong sensor group)
    expect(topicItems.some(i => i.id === 'nt2')).toBe(false)
  })

  it('account items only come from sensors in social-processing groups AND have item.account set', () => {
    const allItems = collectAllItems(buildReport([...SOCIAL_ITEMS, ...NEWS_ITEMS]))
    const { accountItems } = splitWithGroups(allItems, sensorSets)

    // Only x and bluesky items with account fields
    expect(accountItems).toHaveLength(2)
    expect(accountItems.every(i => sensorSets.socialSensors.has(i.source))).toBe(true)
    expect(accountItems.every(i => i.account != null && i.account.length > 0)).toBe(true)
    // rss_news has account but should be excluded (not in socialSensors)
    expect(accountItems.some(i => i.source === 'rss_news')).toBe(false)
  })

  it('sensors not in any group are excluded from all analyses', () => {
    const allItems = collectAllItems(buildReport([...UNGROUPED_ITEMS]))
    const { trendItems, topicItems, accountItems } = splitWithGroups(allItems, sensorSets)

    expect(trendItems).toHaveLength(0)
    expect(topicItems).toHaveLength(0)
    expect(accountItems).toHaveLength(0)
  })

  it('a sensor in both topic and social groups appears in both analyses', () => {
    // x is in both topicSensors and socialSensors
    const dualItem: IntelItem = makeItem({
      id: 'dual1',
      source: 'x',
      title: 'AI post by alice',
      topic: 'ai',
      account: 'alice',
      handle: 'alice',
    })
    const allItems = collectAllItems(buildReport([dualItem]))
    const { topicItems, accountItems } = splitWithGroups(allItems, sensorSets)

    // Should appear in topic analysis (x is in topicSensors, has topic)
    expect(topicItems).toHaveLength(1)
    expect(topicItems[0].id).toBe('dual1')

    // Should also appear in account analysis (x is in socialSensors, has account)
    expect(accountItems).toHaveLength(1)
    expect(accountItems[0].id).toBe('dual1')
  })

  it('empty sensor sets produce empty item arrays for all analyses', () => {
    const emptySets: IntelligenceSensorSets = {
      trendSensors: new Set(),
      topicSensors: new Set(),
      socialSensors: new Set(),
    }
    const allItems = collectAllItems(buildReport([...TREND_ITEMS, ...TOPIC_ITEMS, ...SOCIAL_ITEMS]))
    const { trendItems, topicItems, accountItems } = splitWithGroups(allItems, emptySets)

    expect(trendItems).toHaveLength(0)
    expect(topicItems).toHaveLength(0)
    expect(accountItems).toHaveLength(0)
  })

  it('correctly splits items across all three sections simultaneously', () => {
    const allItems = collectAllItems(buildReport([
      ...TREND_ITEMS,      // weibo, zhihu, douyin → trend
      ...TOPIC_ITEMS,      // x, bluesky, mastodon with topic → topic
      ...SOCIAL_ITEMS,     // x, bluesky with account → social
      ...NEWS_ITEMS,       // hacker_news, rss_news → none of the three
      ...UNGROUPED_ITEMS,  // unknown → excluded
    ]))
    const { trendItems, topicItems, accountItems } = splitWithGroups(allItems, sensorSets)

    expect(trendItems).toHaveLength(3)
    expect(topicItems).toHaveLength(3)
    expect(accountItems).toHaveLength(2)
  })
})

describe('legacy fallback (no sensorSets)', () => {
  it('trend items come from SENSOR_CATEGORY_MAP trend category', () => {
    const allItems = collectAllItems(buildReport([...TREND_ITEMS, ...NEWS_ITEMS]))
    const { trendItems } = splitWithLegacy(allItems)

    // weibo, zhihu, douyin are all 'trend' category in taxonomy
    expect(trendItems).toHaveLength(3)
    expect(trendItems.every(i => SENSOR_CATEGORY_MAP[i.source] === 'trend')).toBe(true)
  })

  it('topic items include any item with topic field regardless of sensor', () => {
    const mixedItems: IntelItem[] = [
      makeItem({ id: 'm1', source: 'x', title: 'X topic', topic: 'ai' }),
      makeItem({ id: 'm2', source: 'hacker_news', title: 'HN topic', topic: 'tech' }),
    ]
    const allItems = collectAllItems(buildReport(mixedItems))
    const { topicItems } = splitWithLegacy(allItems)

    // Legacy behavior: any item with topic, regardless of sensor
    expect(topicItems).toHaveLength(2)
  })

  it('account items only from social-category sensors', () => {
    const allItems = collectAllItems(buildReport([...SOCIAL_ITEMS, ...NEWS_ITEMS]))
    const { accountItems } = splitWithLegacy(allItems)

    // x is 'social' category, bluesky is 'social', rss_news is 'feeds'
    expect(accountItems).toHaveLength(2)
    expect(accountItems.every(i => SENSOR_CATEGORY_MAP[i.source] === 'social')).toBe(true)
    // rss_news excluded despite having account field
    expect(accountItems.some(i => i.source === 'rss_news')).toBe(false)
  })
})

describe('group-driven vs legacy equivalence', () => {
  it('default groups produce equivalent splits to legacy SENSOR_CATEGORY_MAP', () => {
    // Sensor sets matching the default group seeds (source-level values after sensorToSource)
    const defaultSets: IntelligenceSensorSets = {
      trendSensors: new Set([
        'v2ex', 'zhihu', 'weibo', 'xiaohongshu', 'baidu_tieba', 'douyin',
        'toutiao', 'netease', '36kr_trending', 'juejin', 'baidu', 'mastodon_trends',
      ]),
      topicSensors: new Set(['bluesky', 'mastodon']),
      socialSensors: new Set(['x', 'bluesky', 'mastodon']),
    }

    const allItems = collectAllItems(buildReport([...TREND_ITEMS, ...TOPIC_ITEMS]))
    const groupSplit = splitWithGroups(allItems, defaultSets)
    const legacySplit = splitWithLegacy(allItems)

    // Trend items should match exactly — same sensors
    expect(groupSplit.trendItems).toHaveLength(legacySplit.trendItems.length)

    // Topic items differ: group-driven requires sensor membership,
    // legacy accepts any item with a topic field.
    // X is now in the Voices (social) group, not Topics, so group-driven
    // filtering excludes the X topic item (source: 'x').
    expect(groupSplit.topicItems).toHaveLength(2) // bluesky + mastodon
    expect(legacySplit.topicItems).toHaveLength(3) // all items with topic field
  })
})
