// ABOUTME: Social trends sensor — surfaces trending content across Bluesky and Mastodon.
// ABOUTME: Aggregates trending posts and discussions into a unified IntelItem feed.
import type { ConfigSettings, IntelItem } from '../models'
import { createBlueskyAgent, blueskyPostToItem } from '../platforms/bluesky'
import { mastodonPublicGet, mastodonStatusToItem } from '../platforms/mastodon'

async function fetchBlueskyTrends(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.bluesky_handle || !config.bluesky_app_password) return []
  const agent = await createBlueskyAgent(config.bluesky_handle, config.bluesky_app_password)
  const { data } = await agent.getTimeline({ limit: Math.min(50, limit * 3) })
  // Sort by engagement (likes + reposts) and take the top items
  const scored = data.feed.map(f => ({
    post: f.post,
    score: Number((f.post as unknown as Record<string, unknown>).likeCount ?? 0) +
           Number((f.post as unknown as Record<string, unknown>).repostCount ?? 0),
  }))
  scored.sort((a, b) => b.score - a.score)
  const items: IntelItem[] = []
  for (const { post } of scored.slice(0, limit)) {
    const item = blueskyPostToItem(post as unknown as Record<string, unknown>, 'trends')
    if (item) items.push(item)
  }
  return items
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

export async function fetchSocialTrends(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  const results = await Promise.allSettled([
    fetchBlueskyTrends(config, limit),
    fetchMastodonTrends(config, limit),
  ])

  const items: IntelItem[] = []
  const errors: string[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
    else errors.push(String(r.reason))
  }

  // Mastodon trends is public — only fail if both platforms errored
  if (items.length === 0 && errors.length === 2) {
    throw new Error('No platform available for trends — configure Bluesky or check Mastodon connectivity')
  }

  return items.slice(0, limit)
}
