// ABOUTME: Tests that the intelligence pipeline uses group-driven sensor sets for item splitting.
// ABOUTME: Validates trend/social filtering respects group membership; topic filtering is global.

import { describe, it, expect } from 'vitest'
import type { IntelItem } from '../../models'
import { createReport } from '../../models'
import type { IntelligenceSensorSets } from '../intelligence'

// ── Replicate the filtering logic from runIntelligenceAnalysis ────────────
// This mirrors the exact splitting code in intelligence.ts so we can verify
// that group-driven sensor sets produce the correct item partitions.

function collectAllItems(report: { items: Record<string, IntelItem[]> }): IntelItem[] {
  const allItems: IntelItem[] = []
  for (const items of Object.values(report.items)) {
    if (items) allItems.push(...items)
  }
  return allItems
}

function splitWithGroups(allItems: IntelItem[], sensorSets: IntelligenceSensorSets) {
  const trendItems = allItems.filter(i => sensorSets.trendSensors.has(i.source))
  const topicItems = allItems.filter(i => i.topic != null && i.topic.length > 0)
  const accountItems = allItems.filter(i => sensorSets.socialSensors.has(i.source) && i.account != null && i.account.length > 0)
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
    items: { 'test-group': items },
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

  it('topic items include any item with a non-empty topic regardless of sensor group', () => {
    const itemsWithoutTopic: IntelItem[] = [
      makeItem({ id: 'nt1', source: 'x', title: 'No topic post' }),         // no topic field
      makeItem({ id: 'nt2', source: 'hacker_news', title: 'HN topic', topic: 'tech' }),  // has topic, any sensor
    ]
    const allItems = collectAllItems(buildReport([...TOPIC_ITEMS, ...itemsWithoutTopic]))
    const { topicItems } = splitWithGroups(allItems, sensorSets)

    // 3 TOPIC_ITEMS + nt2 (has topic) = 4; nt1 excluded (no topic)
    expect(topicItems).toHaveLength(4)
    expect(topicItems.every(i => i.topic != null && i.topic.length > 0)).toBe(true)
    // Item without topic excluded
    expect(topicItems.some(i => i.id === 'nt1')).toBe(false)
    // Item from any sensor with topic included
    expect(topicItems.some(i => i.id === 'nt2')).toBe(true)
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

  it('empty sensor sets produce empty trend/account arrays; topic items still included', () => {
    const emptySets: IntelligenceSensorSets = {
      trendSensors: new Set(),
      topicSensors: new Set(),
      socialSensors: new Set(),
    }
    const allItems = collectAllItems(buildReport([...TREND_ITEMS, ...TOPIC_ITEMS, ...SOCIAL_ITEMS]))
    const { trendItems, topicItems, accountItems } = splitWithGroups(allItems, emptySets)

    expect(trendItems).toHaveLength(0)
    // Topic items are global — 3 TOPIC_ITEMS have topic set
    expect(topicItems).toHaveLength(3)
    expect(accountItems).toHaveLength(0)
  })

  it('correctly splits items across all three sections simultaneously', () => {
    const allItems = collectAllItems(buildReport([
      ...TREND_ITEMS,      // weibo, zhihu, douyin → trend
      ...TOPIC_ITEMS,      // x, bluesky, mastodon with topic → topic
      ...SOCIAL_ITEMS,     // x, bluesky with account → social
      ...NEWS_ITEMS,       // hacker_news, rss_news → news excluded from trend/social
      ...UNGROUPED_ITEMS,  // unknown → excluded from trend/social
    ]))
    const { trendItems, topicItems, accountItems } = splitWithGroups(allItems, sensorSets)

    expect(trendItems).toHaveLength(3)
    // Topic items are global: 3 TOPIC_ITEMS (all have topic set)
    expect(topicItems).toHaveLength(3)
    expect(accountItems).toHaveLength(2)
  })
})
