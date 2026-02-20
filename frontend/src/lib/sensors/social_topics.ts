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
    if (items.length >= limit) break
    try {
      const { data } = await agent.app.bsky.feed.searchPosts({ q: keyword, limit: Math.min(5, limit) })
      for (const post of data.posts) {
        if (items.length >= limit) break
        const item = blueskyPostToItem(post as unknown as Record<string, unknown>, 'topics')
        if (item) {
          item.topic = keyword
          items.push(item)
        }
      }
    } catch { /* search may not be available, skip */ }
  }
  return items
}

async function fetchMastodonTopics(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (config.social_topics_keywords.length === 0) return []
  const items: IntelItem[] = []
  for (const keyword of config.social_topics_keywords) {
    if (items.length >= limit) break
    const tag = keyword.replace(/^#/, '')
    try {
      const statuses = await mastodonPublicGet<Array<Record<string, unknown>>>(
        `/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=5`,
      )
      for (const status of statuses) {
        if (items.length >= limit) break
        const item = mastodonStatusToItem(status, 'topics')
        if (item) {
          item.topic = keyword
          items.push(item)
        }
      }
    } catch { /* tag may not exist, skip */ }
  }
  return items
}

export async function fetchSocialTopics(config: ConfigSettings, limit: number): Promise<IntelItem[]> {
  if (config.social_topics_keywords.length === 0) {
    throw new SensorConfigError('No topic keywords configured')
  }

  const results = await Promise.allSettled([
    fetchBlueskyTopics(config, limit),
    fetchMastodonTopics(config, limit),
  ])

  const items: IntelItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value)
  }
  return items.slice(0, limit)
}
