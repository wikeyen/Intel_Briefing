// ABOUTME: Social trends sensor — surfaces trending content from Mastodon and X/Twitter.
// ABOUTME: Mastodon uses public trends API; X trends via Apify actor. Bluesky has no public trends API.
import type { ConfigSettings, IntelItem } from '../models'
import { ApifyClient } from 'apify-client'
import { mastodonPublicGet, mastodonStatusToItem } from '../platforms/mastodon'

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

function formatVolume(raw: string): string | null {
  const n = parseInt(raw, 10)
  if (isNaN(n) || n <= 0) return null
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

async function fetchMastodonTrends(_config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const statuses = await mastodonPublicGet<Array<Record<string, unknown>>>(
    `/api/v1/trends/statuses?limit=${Math.min(20, limit)}`,
  )
  const items: IntelItem[] = []
  for (const status of statuses) {
    if (items.length >= limit) break
    const item = mastodonStatusToItem(status, 'trends')
    if (item) items.push(item)
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
  const { items } = await client.dataset(defaultDatasetId).listItems()
  const result = (items as unknown as ApifyTrendsResult[])[0]
  if (!result?.timeline?.length) return []
  const latest = result.timeline[result.timeline.length - 1]
  return latest.trends.slice(0, limit).map(mapTrendToItem)
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
