// ABOUTME: Social trends sensor — surfaces trending content from Mastodon and X/Twitter.
// ABOUTME: Stores snapshots for velocity tracking; computes growth rate across cron runs.
import type { ConfigSettings, IntelItem } from '../models'
import { ApifyClient } from 'apify-client'
import { mastodonPublicGet, mastodonStatusToItem } from '../platforms/mastodon'
import { writeTrendSnapshot, readTrendSnapshots, type TrendSnapshot } from '../db'

const X_TRENDS_ACTOR = 'eunit/x-twitter-trends-scraper'

interface ApifyTrend {
  rank: number
  name: string
  link: string
  tweet_count: string
}

interface ApifyTrendsTimeline {
  datetime: string
  timestamp: number
  trends: ApifyTrend[]
}

interface ApifyTrendsResult {
  scraped_at: string
  country_input: string
  timeline: ApifyTrendsTimeline[]
}

function parseCount(raw: string): number {
  const n = parseInt(raw, 10)
  return isNaN(n) || n <= 0 ? 0 : n
}

function formatVolume(raw: string): string | null {
  const n = parseCount(raw)
  if (n <= 0) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M posts`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K posts`
  return `${n} posts`
}

function mapTrendToItem(trend: ApifyTrend): IntelItem {
  const normalized = trend.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
  return {
    id: `x-trend-${normalized}`,
    source: 'x',
    title: trend.name,
    url: trend.link || `https://x.com/search?q=${encodeURIComponent(trend.name)}`,
    heat: formatVolume(trend.tweet_count),
    account: null,
    published_at: null,
  }
}

/**
 * Compute velocity for each item by comparing against historical snapshots.
 * Mutates items in-place to attach the `velocity` field.
 */
function attachVelocity(
  items: IntelItem[],
  currentCounts: Map<string, number>,
  snapshots: TrendSnapshot[],
): void {
  if (snapshots.length === 0) return

  // Build lookup: trend name (lowercase) → { earliestTimestamp, earliestCount }
  const history = new Map<string, { firstSeenAt: string; earliestCount: number }>()
  for (const snap of snapshots) {
    for (const t of snap.trends) {
      const key = t.name.toLowerCase()
      if (!history.has(key)) {
        history.set(key, { firstSeenAt: snap.timestamp, earliestCount: t.count })
      }
    }
  }

  const now = Date.now()

  for (const item of items) {
    const key = item.title.toLowerCase()
    const currentCount = currentCounts.get(key) ?? 0
    const past = history.get(key)

    if (!past) {
      // Brand new trend — never seen in previous snapshots
      item.velocity = {
        previousCount: null,
        currentCount,
        changePercent: null,
        firstSeenAt: new Date().toISOString(),
        hoursOnTrend: null,
      }
    } else {
      const hoursOnTrend = Math.round(
        (now - new Date(past.firstSeenAt).getTime()) / (1000 * 60 * 60) * 10,
      ) / 10
      const changePercent = past.earliestCount > 0
        ? Math.round(((currentCount - past.earliestCount) / past.earliestCount) * 1000) / 10
        : null
      item.velocity = {
        previousCount: past.earliestCount,
        currentCount,
        changePercent,
        firstSeenAt: past.firstSeenAt,
        hoursOnTrend,
      }
    }
  }
}

async function fetchMastodonTrends(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const statuses = await mastodonPublicGet<Array<Record<string, unknown>>>(
    `/api/v1/trends/statuses?limit=${Math.min(20, limit)}`,
  )
  const items: IntelItem[] = []
  const countMap = new Map<string, number>()
  for (const status of statuses) {
    if (items.length >= limit) break
    const item = mastodonStatusToItem(status, 'trends')
    if (item) {
      items.push(item)
      // Extract engagement count from the raw status for velocity tracking
      const favs = typeof status.favourites_count === 'number' ? status.favourites_count : 0
      const reblogs = typeof status.reblogs_count === 'number' ? status.reblogs_count : 0
      countMap.set(item.title.toLowerCase(), favs + reblogs)
    }
  }

  // Store snapshot and compute velocity
  try {
    const snapshotTrends = items.map((item, i) => ({
      name: item.title,
      count: countMap.get(item.title.toLowerCase()) ?? 0,
      rank: i + 1,
    }))
    const snapshot: TrendSnapshot = {
      timestamp: new Date().toISOString(),
      trends: snapshotTrends,
    }
    const previousSnapshots = await readTrendSnapshots('mastodon')
    await writeTrendSnapshot('mastodon', snapshot)
    attachVelocity(items, countMap, previousSnapshots)
  } catch {
    // Velocity is best-effort; don't fail the sensor
  }

  return items
}

async function fetchXTrends(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.apify_token) return []
  const client = new ApifyClient({ token: config.apify_token })
  const { defaultDatasetId } = await client.actor(X_TRENDS_ACTOR).call(
    { country: 'Worldwide' },
    { waitSecs: 120 },
  )
  if (!defaultDatasetId) return []
  const { items: rawItems } = await client.dataset(defaultDatasetId).listItems()
  const result = (rawItems as unknown as ApifyTrendsResult[])[0]
  if (!result?.timeline?.length) return []
  const latest = result.timeline[result.timeline.length - 1]
  const trends = latest.trends.slice(0, limit)
  const items = trends.map(mapTrendToItem)

  // Build count map and store snapshot
  const countMap = new Map<string, number>()
  const snapshotTrends = trends.map((t, i) => {
    const count = parseCount(t.tweet_count)
    countMap.set(t.name.toLowerCase(), count)
    return { name: t.name, count, rank: i + 1 }
  })

  try {
    const snapshot: TrendSnapshot = {
      timestamp: new Date().toISOString(),
      trends: snapshotTrends,
    }
    const previousSnapshots = await readTrendSnapshots('x')
    await writeTrendSnapshot('x', snapshot)
    attachVelocity(items, countMap, previousSnapshots)
  } catch {
    // Velocity is best-effort
  }

  return items
}

export async function fetchSocialTrends(
  config: ConfigSettings,
  limit: number,
  platform?: 'mastodon',
): Promise<IntelItem[]> {
  const checkMasto = !platform || platform === 'mastodon'

  const fetches: Promise<IntelItem[]>[] = []
  if (checkMasto) fetches.push(fetchMastodonTrends(config, limit))
  // X trends always included when apify_token is available (not platform-filtered)
  fetches.push(fetchXTrends(config, limit))

  const results = await Promise.allSettled(fetches)

  const items: IntelItem[] = []
  const errors: string[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
    else errors.push(String(r.reason))
  }

  // Only fail if all platforms errored
  if (items.length === 0 && errors.length === fetches.length) {
    throw new Error('No platform available for trends — check Mastodon connectivity or configure Apify token')
  }

  return items.slice(0, limit)
}
