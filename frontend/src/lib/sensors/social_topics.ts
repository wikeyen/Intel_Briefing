// ABOUTME: Social topics sensor — tracks keywords and hashtags across Bluesky and Mastodon.
// ABOUTME: Aggregates matching posts from multiple platforms into a unified IntelItem feed.
import type { ConfigSettings, IntelItem } from '../models'
import { SensorConfigError } from './errors'
import { createBlueskyAgent, blueskyPostToItem } from '../platforms/bluesky'
import { mastodonPublicGet, mastodonStatusToItem } from '../platforms/mastodon'

async function fetchBlueskyTopics(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (!config.bluesky_handle || !config.bluesky_app_password || config.social_topics_keywords.length === 0) return []
  const agent = await createBlueskyAgent(config.bluesky_handle, config.bluesky_app_password)
  const items: IntelItem[] = []
  for (const keyword of config.social_topics_keywords) {
    const kwLimit = config.topic_limits[keyword] ?? Math.min(5, limit)
    const lookbackHours = config.topic_lookback_hours[keyword]
    const cutoff = lookbackHours ? Date.now() - lookbackHours * 3600_000 : 0
    try {
      const { data } = await agent.app.bsky.feed.searchPosts({ q: keyword, limit: kwLimit })
      for (const post of data.posts) {
        const item = blueskyPostToItem(post as unknown as Record<string, unknown>, 'topics')
        if (item) {
          if (cutoff && item.published_at && new Date(item.published_at).getTime() < cutoff) continue
          item.topic = keyword
          items.push(item)
        }
      }
    } catch { /* search may not be available, skip */ }
  }
  return items.slice(0, limit)
}

async function fetchMastodonTopics(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (config.social_topics_keywords.length === 0) return []
  const items: IntelItem[] = []
  for (const keyword of config.social_topics_keywords) {
    const kwLimit = config.topic_limits[keyword] ?? 5
    const lookbackHours = config.topic_lookback_hours[keyword]
    const cutoff = lookbackHours ? Date.now() - lookbackHours * 3600_000 : 0
    const tag = keyword.replace(/^#/, '')
    try {
      const statuses = await mastodonPublicGet<Array<Record<string, unknown>>>(
        `/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=${kwLimit}`,
      )
      for (const status of statuses) {
        const item = mastodonStatusToItem(status, 'topics')
        if (item) {
          if (cutoff && item.published_at && new Date(item.published_at).getTime() < cutoff) continue
          item.topic = keyword
          items.push(item)
        }
      }
    } catch { /* tag may not exist, skip */ }
  }
  return items.slice(0, limit)
}

export async function fetchSocialTopics(
  config: ConfigSettings,
  limit: number,
  platform?: 'bluesky' | 'mastodon',
): Promise<IntelItem[]> {
  if (config.social_topics_keywords.length === 0) {
    throw new SensorConfigError('No topic keywords configured')
  }

  const checkBsky = !platform || platform === 'bluesky'
  const checkMasto = !platform || platform === 'mastodon'

  const fetches: Promise<IntelItem[]>[] = []
  if (checkBsky) fetches.push(fetchBlueskyTopics(config, limit))
  if (checkMasto) fetches.push(fetchMastodonTopics(config, limit))

  const results = await Promise.allSettled(fetches)

  const items: IntelItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items.slice(0, limit)
}
